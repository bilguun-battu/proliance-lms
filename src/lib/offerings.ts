import 'server-only';
import { all, one, run } from './db';
import { appUrl } from './auth';
import { completeByAttendance, logActivity } from './progress';
import { sendEmail, sendSms } from './notify';
import { fmtSession } from './format';

export type EnrStatus = 'ENROLLED' | 'WAITLISTED' | 'DROPPED' | 'COMPLETED' | 'UNSUCCESSFUL';
export const ENR_LABEL: Record<EnrStatus, [string, string]> = {
  ENROLLED: ['Бүртгэгдсэн', 'info'], WAITLISTED: ['Хүлээлгийн жагсаалтад', 'warn'], DROPPED: ['Цуцалсан', 'neutral'],
  COMPLETED: ['Дүүргэсэн', 'ok'], UNSUCCESSFUL: ['Амжилтгүй', 'crit'],
};
export const ATT_LABEL: Record<string, [string, string]> = {
  REGISTERED: ['Оруулаагүй', 'neutral'], ATTENDED: ['Ирсэн', 'ok'], PARTIAL: ['Хэсэгчлэн ирсэн', 'warn'], ABSENT: ['Ирээгүй', 'crit'],
};
// Суудал эзэлдэг төлөвүүд
export const SEAT = ['ENROLLED', 'COMPLETED', 'UNSUCCESSFUL'];
export const offCode = (num: number) => `ХС-${String(num).padStart(4, '0')}`;

export type OfferingRow = {
  id: string; num: number; course_id: string; course: string; audience: string; category: string; instructor_id: string | null; instructor: string | null;
  location: string; link: string | null; min_capacity: number; max_capacity: number; waitlist_capacity: number; auto_waitlist: boolean;
  enroll_deadline: string | null; drop_deadline: string | null; status: string; notes: string;
  first_at: string | null; last_at: string | null; taken: number; waiting: number; nsessions: number;
};

const OFF_SQL = `
  SELECT o.*, c.title AS course, c.audience, c.category, coalesce(iu.name, o.instructor_name) AS instructor,
    (SELECT min(s.starts_at) FROM sessions s WHERE s.offering_id=o.id) AS first_at,
    (SELECT max(s.starts_at + s.duration_min * interval '1 minute') FROM sessions s WHERE s.offering_id=o.id) AS last_at,
    (SELECT count(*)::int FROM sessions s WHERE s.offering_id=o.id) AS nsessions,
    (SELECT count(*)::int FROM offering_enrollments e WHERE e.offering_id=o.id AND e.status = ANY('{ENROLLED,COMPLETED,UNSUCCESSFUL}')) AS taken,
    (SELECT count(*)::int FROM offering_enrollments e WHERE e.offering_id=o.id AND e.status='WAITLISTED') AS waiting
  FROM offerings o JOIN courses c ON c.id=o.course_id LEFT JOIN users iu ON iu.id=o.instructor_id`;

export async function listOfferings(where: string, params: unknown[], order = 'first_at ASC NULLS LAST') {
  return all<OfferingRow>(`SELECT * FROM (${OFF_SQL}) x WHERE ${where} ORDER BY ${order}`, params);
}
export async function getOffering(id: string) {
  return (await listOfferings('x.id=$1', [id]))[0];
}

export type SessionRow = { id: string; offering_id: string; course_id: string; module_key: string; module: string; format: string; starts_at: string;
  duration_min: number; location: string; link: string | null; instructor: string | null; instructor_id: string | null; status: string };
export async function offeringSessions(ids: string[]) {
  if (!ids.length) return [];
  return all<SessionRow>(`
    SELECT s.*, coalesce(su.name, ou.name, o.instructor_name, s.instructor) AS instructor, coalesce(s.instructor_id, o.instructor_id) AS instructor_id,
      (SELECT m.title FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=s.course_id AND m.module_key=s.module_key ORDER BY v.number DESC LIMIT 1) AS module,
      (SELECT m.format FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=s.course_id AND m.module_key=s.module_key ORDER BY v.number DESC LIMIT 1) AS format
      FROM sessions s JOIN offerings o ON o.id=s.offering_id LEFT JOIN users su ON su.id=s.instructor_id LEFT JOIN users ou ON ou.id=o.instructor_id
     WHERE s.offering_id = ANY($1) ORDER BY s.starts_at`, [ids]);
}

// Бүртгүүлэх эцсийн хугацаа: тохируулаагүй бол эхний хичээл эхлэх хүртэл
export function enrollOpen(o: Pick<OfferingRow, 'status' | 'enroll_deadline' | 'first_at'>) {
  const d = o.enroll_deadline ?? o.first_at;
  return o.status === 'SCHEDULED' && (!d || new Date(d).getTime() > Date.now());
}
export function dropOpen(o: Pick<OfferingRow, 'status' | 'drop_deadline' | 'first_at'>) {
  const d = o.drop_deadline ?? o.first_at;
  return o.status === 'SCHEDULED' && (!d || new Date(d).getTime() > Date.now());
}

async function tell(userId: string, courseId: string, title: string, body: string) {
  const u = await one<any>('SELECT email, phone, name FROM users WHERE id=$1', [userId]);
  if (!u) return;
  const email = await sendEmail(u.email, title, `Сайн байна уу, ${u.name}.\n\n${body}\n\n${appUrl('/portal/schedule')}`);
  const sms = await sendSms(u.phone, `Proliance: ${title}. ${body}`.slice(0, 300));
  await run(`INSERT INTO notifications (user_id,course_id,kind,title,body,email_status,sms_status) VALUES ($1,$2,'SESSION',$3,$4,$5,$6)`,
    [userId, courseId, title, body, email, sms]);
}

async function addToSessions(offeringId: string, userId: string) {
  await run(`INSERT INTO session_attendees (session_id,user_id) SELECT s.id, $2 FROM sessions s WHERE s.offering_id=$1 AND s.status='SCHEDULED'
             ON CONFLICT DO NOTHING`, [offeringId, userId]);
}
async function removeFromSessions(offeringId: string, userId: string) {
  await run(`DELETE FROM session_attendees a USING sessions s WHERE a.session_id=s.id AND s.offering_id=$1 AND a.user_id=$2 AND a.status='REGISTERED'`, [offeringId, userId]);
}

// Бүртгүүлэх: суудал байвал бүртгэнэ, дүүрсэн бол хүлээлгийн жагсаалтад оруулна. byAdmin бол эцсийн хугацаа, багтаамжийг алгасч болно.
export async function enroll(offeringId: string, userId: string, opts: { by?: string; force?: boolean } = {}): Promise<{ error?: string; status?: EnrStatus; msg?: string }> {
  const o = await getOffering(offeringId);
  if (!o || o.status !== 'SCHEDULED') return { error: 'Энэ хуваарьт бүртгүүлэх боломжгүй.' };
  if (!opts.force && !enrollOpen(o)) return { error: 'Бүртгүүлэх хугацаа дууссан байна.' };
  const cur = await one<any>('SELECT status FROM offering_enrollments WHERE offering_id=$1 AND user_id=$2', [offeringId, userId]);
  if (cur && ['ENROLLED', 'WAITLISTED', 'COMPLETED'].includes(cur.status)) return { error: 'Та энэ хуваарьт аль хэдийн бүртгэлтэй байна.', status: cur.status };
  const status: EnrStatus | null = o.taken < o.max_capacity || opts.force ? 'ENROLLED' : o.waiting < o.waitlist_capacity ? 'WAITLISTED' : null;
  if (!status) return { error: 'Суудал болон хүлээлгийн жагсаалт дүүрсэн байна. Өөр хуваарь сонгоно уу.' };
  // Суудал авсан үед л өмнөх хуваарийн бүртгэлийг цуцална (хүлээлгийн жагсаалтад орох нь одоогийн бүртгэлд нөлөөлөхгүй)
  if (status === 'ENROLLED') await releaseOthers(o.course_id, offeringId, userId);
  await run(`INSERT INTO offering_enrollments (offering_id,user_id,status,enrolled_at,waitlisted_at,enrolled_by) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (offering_id,user_id) DO UPDATE SET status=EXCLUDED.status, enrolled_at=EXCLUDED.enrolled_at, waitlisted_at=EXCLUDED.waitlisted_at,
      dropped_at=NULL, grade=NULL, completed_at=NULL, enrolled_by=EXCLUDED.enrolled_by`,
    [offeringId, userId, status, status === 'ENROLLED' ? new Date() : null, status === 'WAITLISTED' ? new Date() : null, opts.by ?? null]);
  const when = o.first_at ? fmtSession(o.first_at) : '';
  if (status === 'ENROLLED') {
    await addToSessions(offeringId, userId);
    await logActivity(userId, o.course_id, null, 'REGISTER', `${offCode(o.num)} · ${when} · ${o.location}`);
    await tell(userId, o.course_id, `Бүртгэл баталгаажлаа: ${o.course}`, `${offCode(o.num)} хуваарь, ${when}-аас эхэлнэ. Байршил: ${o.location}${o.link ? `. Холбоос: ${o.link}` : ''}. Хичээл бүрээс 1 өдрийн өмнө сануулга очно.`);
    return { status, msg: `${offCode(o.num)} хуваарьт бүртгэгдлээ.` };
  }
  await logActivity(userId, o.course_id, null, 'WAITLIST', offCode(o.num));
  await tell(userId, o.course_id, `Хүлээлгийн жагсаалтад орлоо: ${o.course}`, `${offCode(o.num)} хуваарийн суудал дүүрсэн тул та хүлээлгийн жагсаалтад орлоо. Суудал чөлөөлөгдвөл мэдэгдэнэ.`);
  return { status, msg: 'Суудал дүүрсэн тул хүлээлгийн жагсаалтад орлоо.' };
}

// Нэг сургалтад нэг л идэвхтэй хуваарь: эхлээгүй өөр хуваарийн бүртгэл, хүлээлгийг цуцална
async function releaseOthers(courseId: string, keepOfferingId: string, userId: string) {
  const other = await all<any>(`SELECT e.offering_id FROM offering_enrollments e JOIN offerings x ON x.id=e.offering_id
     WHERE e.user_id=$1 AND x.course_id=$2 AND x.id<>$3 AND e.status IN ('ENROLLED','WAITLISTED')
       AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.offering_id=x.id AND s.starts_at <= now())`, [userId, courseId, keepOfferingId]);
  for (const x of other) await drop(x.offering_id, userId, { force: true, quiet: true });
}

export async function drop(offeringId: string, userId: string, opts: { force?: boolean; quiet?: boolean } = {}): Promise<{ error?: string; msg?: string }> {
  const o = await getOffering(offeringId);
  if (!o) return { error: 'Хуваарь олдсонгүй.' };
  if (!opts.force && !dropOpen(o)) return { error: 'Бүртгэл цуцлах хугацаа дууссан байна. Сургалтын албатай холбогдоно уу.' };
  const r = await run(`UPDATE offering_enrollments SET status='DROPPED', dropped_at=now() WHERE offering_id=$1 AND user_id=$2 AND status IN ('ENROLLED','WAITLISTED') RETURNING 1`, [offeringId, userId]);
  if (!r.rowCount) return { error: 'Бүртгэл олдсонгүй.' };
  await removeFromSessions(offeringId, userId);
  await logActivity(userId, o.course_id, null, 'UNREGISTER', offCode(o.num));
  if (!opts.quiet) await tell(userId, o.course_id, `Бүртгэл цуцлагдлаа: ${o.course}`, `${offCode(o.num)} хуваарийн бүртгэл тань цуцлагдлаа.`);
  if (o.auto_waitlist) await promote(offeringId);
  return { msg: 'Бүртгэл цуцлагдлаа.' };
}

// Хүлээлгийн жагсаалтаас бүртгэх: userId өгөөгүй бол эхний хүн, суудал байх хүртэл
export async function promote(offeringId: string, userId?: string): Promise<number> {
  let n = 0;
  for (;;) {
    const o = await getOffering(offeringId);
    if (!o || o.status !== 'SCHEDULED' || (!userId && o.taken >= o.max_capacity)) return n;
    const w = await one<any>(`SELECT user_id FROM offering_enrollments WHERE offering_id=$1 AND status='WAITLISTED' ${userId ? 'AND user_id=$2' : ''}
       ORDER BY waitlisted_at LIMIT 1`, userId ? [offeringId, userId] : [offeringId]);
    if (!w) return n;
    await run(`UPDATE offering_enrollments SET status='ENROLLED', enrolled_at=now() WHERE offering_id=$1 AND user_id=$2`, [offeringId, w.user_id]);
    await releaseOthers(o.course_id, offeringId, w.user_id);
    await addToSessions(offeringId, w.user_id);
    await logActivity(w.user_id, o.course_id, null, 'REGISTER', `${offCode(o.num)} · хүлээлгээс`);
    await tell(w.user_id, o.course_id, `Суудал гарлаа: ${o.course}`, `Хүлээлгийн жагсаалтаас ${offCode(o.num)} хуваарьт бүртгэгдлээ. ${o.first_at ? `${fmtSession(o.first_at)}-аас эхэлнэ. ` : ''}Байршил: ${o.location}.`);
    n++;
    if (userId) return n;
  }
}

// Хичээлийн ирц: Ирсэн бол тухайн модуль дуусна; хуваарийн бүх хичээлд ирсэн бол бүртгэл "Дүүргэсэн"
export async function markAttendance(sessionId: string, userIds: string[], status: 'ATTENDED' | 'PARTIAL' | 'ABSENT') {
  const s = await one<any>('SELECT * FROM sessions WHERE id=$1', [sessionId]);
  if (!s) return;
  for (const uid of userIds) {
    await run(`INSERT INTO session_attendees (session_id,user_id,status,marked_at) VALUES ($1,$2,$3,now())
               ON CONFLICT (session_id,user_id) DO UPDATE SET status=$3, marked_at=now()`, [sessionId, uid, status]);
    if (status === 'ATTENDED') await completeByAttendance(uid, s.course_id, s.module_key);
    else await logActivity(uid, s.course_id, s.module_key, status === 'PARTIAL' ? 'PARTIAL' : 'ABSENT');
    if (s.offering_id && status === 'ATTENDED') {
      const left = await one(`SELECT 1 FROM sessions x LEFT JOIN session_attendees a ON a.session_id=x.id AND a.user_id=$2
         WHERE x.offering_id=$1 AND x.status='SCHEDULED' AND coalesce(a.status,'') <> 'ATTENDED' LIMIT 1`, [s.offering_id, uid]);
      if (!left) await run(`UPDATE offering_enrollments SET status='COMPLETED', grade=coalesce(grade,'PASS'), completed_at=now()
         WHERE offering_id=$1 AND user_id=$2 AND status='ENROLLED'`, [s.offering_id, uid]);
    }
  }
}

// Эцсийн дүн: Тэнцсэн → Дүүргэсэн (хуваарийн бүх хичээлийн модуль дуусна), Тэнцээгүй → Амжилтгүй (дахин бүртгүүлнэ)
export async function setResult(offeringId: string, userId: string, grade: 'PASS' | 'FAIL', score: number | null, note: string | null) {
  const o = await getOffering(offeringId);
  if (!o) return;
  await run(`UPDATE offering_enrollments SET status=$3, grade=$4, score=$5, note=$6, completed_at=now() WHERE offering_id=$1 AND user_id=$2`,
    [offeringId, userId, grade === 'PASS' ? 'COMPLETED' : 'UNSUCCESSFUL', grade, score, note]);
  if (grade === 'PASS') {
    const keys = (await all<{ module_key: string }>(`SELECT DISTINCT module_key FROM sessions WHERE offering_id=$1 AND status='SCHEDULED'`, [offeringId])).map(r => r.module_key);
    for (const k of keys) await completeByAttendance(userId, o.course_id, k);
  }
  await logActivity(userId, o.course_id, null, grade === 'PASS' ? 'OFFERING_DONE' : 'OFFERING_FAIL', offCode(o.num));
}

// Хуваарийг удирдах эрх: админ, хуваарийн үндсэн багш эсвэл аль нэг хичээлийн багш
export async function canManageOffering(user: { id: string; role: string }, offeringId: string) {
  if (user.role === 'ADMIN') return true;
  return !!(await one(`SELECT 1 FROM offerings o WHERE o.id=$1 AND (o.instructor_id=$2 OR EXISTS (SELECT 1 FROM sessions s WHERE s.offering_id=o.id AND s.instructor_id=$2))`, [offeringId, user.id]));
}

export async function cancelOffering(offeringId: string) {
  const o = await getOffering(offeringId);
  if (!o) return 0;
  await run(`UPDATE offerings SET status='CANCELLED' WHERE id=$1`, [offeringId]);
  await run(`UPDATE sessions SET status='CANCELLED' WHERE offering_id=$1`, [offeringId]);
  const people = await all<{ user_id: string }>(`SELECT user_id FROM offering_enrollments WHERE offering_id=$1 AND status IN ('ENROLLED','WAITLISTED')`, [offeringId]);
  for (const p of people) {
    await run(`UPDATE offering_enrollments SET status='DROPPED', dropped_at=now() WHERE offering_id=$1 AND user_id=$2`, [offeringId, p.user_id]);
    await removeFromSessions(offeringId, p.user_id);
    await tell(p.user_id, o.course_id, `Хуваарь цуцлагдлаа: ${o.course}`, `${offCode(o.num)} хуваарь${o.first_at ? ` (${fmtSession(o.first_at)})` : ''} цуцлагдлаа. Өөр хуваарьт бүртгүүлнэ үү.`);
  }
  return people.length;
}

// Суралцагчид харагдах тухайн сургалтын хуваарь (ирэх, бүртгэл нээлттэй эсвэл өөрөө бүртгэлтэй)
export type PickOffering = {
  id: string; code: string; location: string; instructor: string | null; notes: string; link: string | null; left: number; waitLeft: number;
  canEnroll: boolean; canDrop: boolean; enrollBy: string | null; dropBy: string | null; my: EnrStatus | null; waitPos: number | null;
  sessions: { when: string; module: string; format: string; location: string; mine: boolean }[];
};
export async function learnerOfferings(userId: string, courseId: string, moduleKey?: string): Promise<PickOffering[]> {
  const { fmtDate } = await import('./format');
  const rows = await listOfferings(`x.course_id=$1 AND x.status='SCHEDULED' AND (x.last_at IS NULL OR x.last_at > now()
     OR EXISTS (SELECT 1 FROM offering_enrollments e WHERE e.offering_id=x.id AND e.user_id=$2 AND e.status IN ('ENROLLED','WAITLISTED')))`, [courseId, userId]);
  const sess = await offeringSessions(rows.map(r => r.id));
  const mine = await all<any>(`SELECT offering_id, status, waitlisted_at FROM offering_enrollments WHERE user_id=$1 AND offering_id = ANY($2)`, [userId, rows.map(r => r.id)]);
  const out: PickOffering[] = [];
  for (const o of rows) {
    const ss = sess.filter(s => s.offering_id === o.id && s.status === 'SCHEDULED');
    if (moduleKey && !ss.some(s => s.module_key === moduleKey)) continue;
    const me = mine.find(m => m.offering_id === o.id);
    const my = me && me.status !== 'DROPPED' ? me.status as EnrStatus : null;
    const pos = my === 'WAITLISTED' ? (await one<{ n: number }>(`SELECT count(*)::int AS n FROM offering_enrollments WHERE offering_id=$1 AND status='WAITLISTED' AND waitlisted_at <= $2`, [o.id, me.waitlisted_at]))!.n : null;
    out.push({
      id: o.id, code: offCode(o.num), location: o.location, instructor: o.instructor, notes: o.notes, link: my === 'ENROLLED' ? o.link : null,
      left: Math.max(0, o.max_capacity - o.taken), waitLeft: Math.max(0, o.waitlist_capacity - o.waiting),
      canEnroll: enrollOpen(o) && !my, canDrop: dropOpen(o) && (my === 'ENROLLED' || my === 'WAITLISTED'),
      enrollBy: fmtDate(o.enroll_deadline ?? o.first_at), dropBy: fmtDate(o.drop_deadline ?? o.first_at), my, waitPos: pos,
      sessions: ss.map(s => ({ when: fmtSession(s.starts_at), module: s.module, format: s.format, location: s.location, mine: s.module_key === moduleKey })),
    });
  }
  return out;
}
