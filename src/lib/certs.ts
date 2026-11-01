import 'server-only';
import { all, one, run } from './db';
import { courseProgress, logActivity } from './progress';
import { recurrenceFor, userAssignments } from './assign';
import { sendEmail } from './notify';
import { appUrl } from './auth';

export type Certificate = {
  id: string; number: string; user_id: string; course_id: string; version: number; course_title: string; category: string;
  user_name: string; org_name: string | null; position: string | null; department: string | null; mandatory: boolean;
  issued_at: string; valid_until: string | null; revoked: boolean;
};

export function certState(c: Pick<Certificate, 'valid_until' | 'revoked'>): ['Хүчинтэй' | 'Хугацаа дууссан' | 'Хүчингүй', string] {
  if (c.revoked) return ['Хүчингүй', 'crit'];
  if (c.valid_until && new Date(c.valid_until).getTime() < Date.now()) return ['Хугацаа дууссан', 'warn'];
  return ['Хүчинтэй', 'ok'];
}

// Сургалтыг бүрэн дуусгахад гэрчилгээ олгоно. Тухайн хувилбар, давтан суух хугацаанд аль хэдийн олгосон бол дахин олгохгүй.
export async function issueCertificateIfDone(userId: string, courseId: string) {
  const p = await courseProgress(userId, courseId);
  if (!p || p.total === 0 || p.left > 0 || p.done < p.total) return null;
  const months = await recurrenceFor(userId, courseId);
  const existing = await one<{ id: string }>(
    `SELECT id FROM certificates WHERE user_id=$1 AND course_id=$2 AND NOT revoked AND version=$3
       AND (valid_until IS NULL OR valid_until > now() + interval '30 days')`, [userId, courseId, p.version.number]);
  if (existing) return null;
  const u = await one<any>(`SELECT u.name, u.email, u.position, u.department, o.name AS org FROM users u LEFT JOIN orgs o ON o.id=u.org_id WHERE u.id=$1`, [userId]);
  const c = await one<any>('SELECT title, category FROM courses WHERE id=$1', [courseId]);
  const mandatory = (await userAssignments(userId)).some(a => a.course_id === courseId);
  const n = await one<{ n: string }>(`SELECT nextval('certificate_seq')::text AS n`);
  const number = `PL-${new Date().getFullYear()}-${n!.n.padStart(5, '0')}`;
  const cert = await one<Certificate>(
    `INSERT INTO certificates (number,user_id,course_id,version,course_title,category,user_name,org_name,position,department,mandatory,valid_until)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $12::int IS NULL THEN NULL ELSE now() + ($12::int * interval '1 month') END) RETURNING *`,
    [number, userId, courseId, p.version.number, c.title, c.category, u.name, u.org, u.position, u.department, mandatory, months]);
  await logActivity(userId, courseId, null, 'CERTIFICATE', number);
  await run(`INSERT INTO notifications (user_id,course_id,kind,title,body) VALUES ($1,$2,'CERTIFICATE',$3,$4)`,
    [userId, courseId, `Гэрчилгээ олгогдлоо: ${c.title}`, `Гэрчилгээний дугаар ${number}. Профайл хэсгээс харж, хэвлэж авна уу.`]);
  await sendEmail(u.email, `Гэрчилгээ: ${c.title}`,
    `Сайн байна уу, ${u.name}.\n\n"${c.title}" сургалтыг амжилттай дуусгасан тул гэрчилгээ олгогдлоо.\nДугаар: ${number}\n\nХарах, хэвлэх: ${appUrl(`/cert/${cert!.id}`)}`);
  return cert;
}

export async function userCertificates(userId: string) {
  return all<Certificate>('SELECT * FROM certificates WHERE user_id=$1 ORDER BY issued_at DESC', [userId]);
}
