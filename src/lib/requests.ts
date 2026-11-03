import 'server-only';
import { all, one, run } from './db';
import { appUrl } from './auth';
import { sendEmail } from './notify';

// Харилцагч байгууллагын сургалтын хүсэлт
export const REQ_KIND: Record<string, [string, string]> = {
  NEW_STAFF: ['Шинэ ажилтны сургалт', 'Шинээр ажилд орсон хүмүүсийг сургалтад хамруулах, системд бүртгэх'],
  RETRAIN: ['Давтан сургалт', 'Сургалтад өмнө нь хамрагдсан ажилтнуудыг дахин сургах (хугацаа дууссан, мэдлэгээ сэргээх)'],
  ADDITIONAL: ['Нэмэлт сургалт', 'Шинэ тоног төхөөрөмж, нэмэлт хичээл, эмнэлэг дээр очиж зохион байгуулах сургалт'],
  OTHER: ['Бусад', 'Сургалттай холбоотой бусад хүсэлт'],
};
export const REQ_STATUS: Record<string, [string, string]> = {
  NEW: ['Шинэ', 'brand'], IN_REVIEW: ['Хянаж байна', 'info'], SCHEDULED: ['Хуваарь гарсан', 'ok'],
  DONE: ['Шийдвэрлэсэн', 'ok'], REJECTED: ['Татгалзсан', 'crit'], CANCELLED: ['Цуцалсан', 'neutral'],
};
export const REQ_FORMAT: Record<string, string> = {
  ANY: 'Аль нь ч болно', INPERSON: 'Proliance-ийн танхимд', ONSITE: 'Манай байгууллага дээр', ONLINE: 'Онлайнаар',
};
export const OPEN_STATUSES = ['NEW', 'IN_REVIEW', 'SCHEDULED'];
export const reqCode = (n: number) => `ХҮ-${String(n).padStart(4, '0')}`;

// Байгууллагад нээлттэй харилцагчийн сургалтууд (худалдаж авсан бүтээгдэхүүнээр)
export async function orgCourses(orgId: string) {
  return all<{ id: string; title: string }>(`
    SELECT DISTINCT c.id, c.title FROM courses c JOIN course_products cp ON cp.course_id=c.id JOIN org_products op ON op.product_id=cp.product_id
     WHERE op.org_id=$1 AND c.audience='CUSTOMER' AND EXISTS (SELECT 1 FROM course_versions v WHERE v.course_id=c.id AND v.status='PUBLISHED')
     ORDER BY c.title`, [orgId]);
}

export async function getRequest(id: string) {
  return one<any>(`SELECT r.*, o.name AS org, c.title AS course, u.name AS requester, u.email AS requester_email, u.phone AS requester_phone, h.name AS handler
    FROM training_requests r JOIN orgs o ON o.id=r.org_id LEFT JOIN courses c ON c.id=r.course_id
    LEFT JOIN users u ON u.id=r.requested_by LEFT JOIN users h ON h.id=r.handled_by WHERE r.id=$1`, [id]);
}
export async function requestPeople(id: string) {
  return all<any>(`SELECT p.*, u.name AS uname, u.position AS uposition, u.email AS uemail, (u.password_hash IS NOT NULL) AS activated
    FROM training_request_people p LEFT JOIN users u ON u.id=p.user_id WHERE p.request_id=$1 ORDER BY p.name`, [id]);
}
export async function requestMessages(id: string) {
  return all<any>(`SELECT m.*, u.name FROM training_request_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.request_id=$1 ORDER BY m.created_at`, [id]);
}

export async function addMessage(requestId: string, side: 'ORG' | 'PROLIANCE' | 'SYSTEM', userId: string | null, body: string) {
  await run('INSERT INTO training_request_messages (request_id,user_id,side,body) VALUES ($1,$2,$3,$4)', [requestId, userId, side, body]);
  if (side === 'ORG') await run('UPDATE training_requests SET last_org_at=now(), updated_at=now() WHERE id=$1', [requestId]);
  else await run('UPDATE training_requests SET last_admin_at=now(), updated_at=now() WHERE id=$1', [requestId]);
}

// Proliance-ийн сургалт хариуцсан ажилтнуудад: имэйл (админ портал дээр хүсэлтийн тоо тэмдэглэгээгээр харагдана)
export async function notifyProliance(requestId: string, subject: string, text: string) {
  const r = await getRequest(requestId);
  const staff = await all<{ email: string }>(`SELECT email FROM users WHERE role IN ('ADMIN','TRAINING_ADMIN') AND active`);
  const body = `${text}\n\nБайгууллага: ${r.org}\nХүсэлт: ${reqCode(r.num)} · ${REQ_KIND[r.kind][0]}${r.course ? ` · ${r.course}` : r.topic ? ` · ${r.topic}` : ''}\nХүсэлт гаргасан: ${r.requester ?? '—'}\n\n${appUrl(`/admin/requests/${r.id}`)}`;
  for (const s of staff) await sendEmail(s.email, `${subject}: ${r.org} (${reqCode(r.num)})`, body);
}

// Хүсэлт гаргасан хариуцагчид: системийн мэдэгдэл ба имэйл
export async function notifyOrg(requestId: string, title: string, text: string) {
  const r = await getRequest(requestId);
  if (!r.requested_by) return;
  await run(`INSERT INTO notifications (user_id, course_id, kind, title, body) VALUES ($1,$2,'REQUEST',$3,$4)`,
    [r.requested_by, null, `${title} (${reqCode(r.num)})`, `${text}\n\nХүсэлт: ${REQ_KIND[r.kind][0]}${r.course ? ` · ${r.course}` : ''}`]);
  if (r.requester_email) await sendEmail(r.requester_email, `${title} (${reqCode(r.num)})`,
    `Сайн байна уу, ${r.requester}.\n\n${text}\n\nХүсэлтээ эндээс харна уу: ${appUrl(`/org/requests/${r.id}`)}`);
}

// Хариуцагчид шинэ хариу ирсэн хүсэлтийн тоо
export async function orgUnread(orgId: string) {
  return (await one<{ n: number }>(`SELECT count(*)::int AS n FROM training_requests WHERE org_id=$1 AND last_admin_at > coalesce(org_seen_at, 'epoch')`, [orgId]))!.n;
}
// Proliance-д шийдвэрлэх хүсэлтийн тоо: шинэ эсвэл харилцагч шинээр бичсэн
export async function adminOpen() {
  return (await one<{ n: number }>(`SELECT count(*)::int AS n FROM training_requests
    WHERE status='NEW' OR (status IN ('IN_REVIEW','SCHEDULED') AND last_org_at > coalesce(admin_seen_at, 'epoch') AND last_org_at > coalesce(last_admin_at, 'epoch'))`))!.n;
}

export async function markSeen(id: string, side: 'ORG' | 'ADMIN') {
  await run(`UPDATE training_requests SET ${side === 'ORG' ? 'org_seen_at' : 'admin_seen_at'}=now() WHERE id=$1`, [id]);
}
