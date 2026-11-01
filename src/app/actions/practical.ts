'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { all, one, run } from '@/lib/db';
import { requireUser, PORTAL_ROLES } from '@/lib/auth';
import { canAccessCourse, canAssess, courseProgress, logActivity, recordCompletion, publishedVersion, versionModules } from '@/lib/progress';
import { sendEmail } from '@/lib/notify';
import { appUrl } from '@/lib/auth';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const go = (path: string, msg: string, err = false): never =>
  redirect(`${path}${path.includes('?') ? '&' : '?'}${err ? 'err' : 'ok'}=${encodeURIComponent(msg)}`);

type Item = { text: string; done?: boolean; note?: string; at?: string; result?: 'PASS' | 'FAIL' | null };

async function currentModule(courseId: string, key: string) {
  const v = await publishedVersion(courseId);
  const m = v && (await versionModules(v.id)).find(x => x.module_key === key);
  if (!m || (m.format !== 'OJT' && m.format !== 'VOC')) throw new Error('Модуль олдсонгүй');
  const items = await all<{ text: string }>('SELECT text FROM module_items WHERE module_id=$1 ORDER BY position', [m.id]);
  return { m, items };
}

// Тухайн хүний тухайн модулийн хамгийн сүүлийн бүртгэл (NYC бол шинээр эхэлнэ)
async function openRecord(userId: string, courseId: string, key: string) {
  return one<any>(`SELECT * FROM practical_records WHERE user_id=$1 AND course_id=$2 AND module_key=$3
     AND status IN ('IN_PROGRESS','SUBMITTED','REQUESTED') ORDER BY created_at DESC LIMIT 1`, [userId, courseId, key]);
}

async function ensureLearner(courseId: string, key: string) {
  const u = await requireUser(...PORTAL_ROLES);
  if (!(await canAccessCourse(u.id, courseId))) throw new Error('Эрхгүй');
  const p = await courseProgress(u.id, courseId);
  const mod = p?.modules.find(x => x.module_key === key);
  if (!mod || !mod.unlocked) throw new Error('Модуль нээгдээгүй');
  return u;
}

/* ---------------- Суралцагч: OJT ---------------- */
export async function ojtToggle(fd: FormData) {
  const courseId = s(fd, 'course_id'), key = s(fd, 'module_key'), idx = Number(s(fd, 'idx'));
  const u = await ensureLearner(courseId, key);
  const { m, items } = await currentModule(courseId, key);
  let r = await openRecord(u.id, courseId, key);
  if (!r) {
    r = await one<any>(`INSERT INTO practical_records (user_id,course_id,module_key,mver,kind,status,items) VALUES ($1,$2,$3,$4,'OJT','IN_PROGRESS',$5) RETURNING *`,
      [u.id, courseId, key, m.mver, JSON.stringify(items.map(i => ({ text: i.text, done: false, note: '' })))]);
  }
  if (r.status !== 'IN_PROGRESS') return go(`/portal/courses/${courseId}/m/${key}`, 'Үнэлэгчид илгээсэн тул өөрчлөх боломжгүй.', true);
  const list: Item[] = r.items;
  if (list[idx]) {
    list[idx].done = !list[idx].done;
    list[idx].note = s(fd, 'note') || list[idx].note || '';
    list[idx].at = list[idx].done ? new Date().toISOString() : undefined;
  }
  await run('UPDATE practical_records SET items=$1, updated_at=now() WHERE id=$2', [JSON.stringify(list), r.id]);
  revalidatePath(`/portal/courses/${courseId}/m/${key}`);
}

export async function ojtSubmit(fd: FormData) {
  const courseId = s(fd, 'course_id'), key = s(fd, 'module_key');
  const u = await ensureLearner(courseId, key);
  const r = await openRecord(u.id, courseId, key);
  const back = `/portal/courses/${courseId}/m/${key}`;
  if (!r || r.status !== 'IN_PROGRESS') go(back, 'Илгээх бүртгэл алга.', true);
  if ((r.items as Item[]).some(i => !i.done)) go(back, 'Бүх даалгаврыг гүйцэтгэсний дараа илгээнэ.', true);
  await run(`UPDATE practical_records SET status='SUBMITTED', updated_at=now() WHERE id=$1`, [r.id]);
  await logActivity(u.id, courseId, key, 'OJT_SUBMIT');
  await notifyAssessors(courseId, `${u.name} OJT баталгаажуулалт хүсэв`);
  go(back, 'Үнэлэгчид илгээгдлээ. Баталгаажсаны дараа модуль дуусна.');
}

/* ---------------- Суралцагч: VoC хүсэх ---------------- */
export async function vocRequest(fd: FormData) {
  const courseId = s(fd, 'course_id'), key = s(fd, 'module_key');
  const u = await ensureLearner(courseId, key);
  const { m, items } = await currentModule(courseId, key);
  const back = `/portal/courses/${courseId}/m/${key}`;
  if (await openRecord(u.id, courseId, key)) go(back, 'Үнэлгээ аль хэдийн хүсэгдсэн байна.', true);
  await run(`INSERT INTO practical_records (user_id,course_id,module_key,mver,kind,status,items) VALUES ($1,$2,$3,$4,'VOC','REQUESTED',$5)`,
    [u.id, courseId, key, m.mver, JSON.stringify(items.map(i => ({ text: i.text, result: null, note: '' })))]);
  await logActivity(u.id, courseId, key, 'VOC_REQUEST');
  await notifyAssessors(courseId, `${u.name} VoC үнэлгээ хүсэв`);
  go(back, 'Үнэлгээний хүсэлт илгээгдлээ. Үнэлэгч тантай цаг тохирно.');
}

async function notifyAssessors(courseId: string, subject: string) {
  const c = await one<{ title: string }>('SELECT title FROM courses WHERE id=$1', [courseId]);
  const people = await all<{ email: string; name: string }>(
    `SELECT u.email, u.name FROM trainer_quals q JOIN users u ON u.id=q.user_id WHERE q.course_id=$1 AND u.active`, [courseId]);
  for (const p of people) await sendEmail(p.email, `${subject}: ${c?.title}`, `Сайн байна уу, ${p.name}.\n\n${subject}.\nҮнэлгээ хийх: ${appUrl('/portal/assess')}`);
}

/* ---------------- Үнэлэгч ---------------- */
// OJT батлах эсвэл буцаах; VoC шалгуур бүрийг үнэлж Competent / NYC шийдвэрлэх
export async function assessRecord(fd: FormData) {
  const me = await requireUser('ADMIN', ...PORTAL_ROLES);
  const back = s(fd, 'back') || '/portal/assess';
  let r = s(fd, 'record_id') ? await one<any>('SELECT * FROM practical_records WHERE id=$1', [s(fd, 'record_id')]) : undefined;
  // Үнэлэгч өөрөө VoC эхлүүлж болно (суралцагч хүсээгүй ч)
  if (!r && s(fd, 'user_id')) {
    const courseId = s(fd, 'course_id'), key = s(fd, 'module_key');
    const { m, items } = await currentModule(courseId, key);
    r = await one<any>(`INSERT INTO practical_records (user_id,course_id,module_key,mver,kind,status,items) VALUES ($1,$2,$3,$4,'VOC','REQUESTED',$5) RETURNING *`,
      [s(fd, 'user_id'), courseId, key, m.mver, JSON.stringify(items.map(i => ({ text: i.text, result: null, note: '' })))]);
  }
  if (!r) go(back, 'Бүртгэл олдсонгүй.', true);
  if (!(await canAssess(me.id, me.role, r.course_id))) go(back, 'Танд энэ сургалтыг үнэлэх эрх алга.', true);
  if (r.user_id === me.id) go(back, 'Өөрийгөө үнэлэх боломжгүй.', true);
  if (!['SUBMITTED', 'REQUESTED', 'IN_PROGRESS'].includes(r.status)) go(back, 'Энэ бүртгэл аль хэдийн шийдвэрлэгдсэн.', true);

  const decision = s(fd, 'decision');
  const items: Item[] = r.items;
  if (r.kind === 'VOC') {
    items.forEach((it, i) => { const v = s(fd, `r${i}`); it.result = v === 'PASS' ? 'PASS' : v === 'FAIL' ? 'FAIL' : null; it.note = s(fd, `n${i}`); });
    if (decision === 'COMPETENT' && items.some(i => i.result !== 'PASS')) go(back, 'Бүх шалгуур "Хангасан" байж Competent гэж шийдвэрлэнэ.', true);
    if (items.some(i => !i.result)) go(back, 'Шалгуур бүрийг үнэлнэ үү.', true);
  }
  const status = decision === 'COMPETENT' ? 'COMPETENT' : r.kind === 'OJT' && decision === 'RETURN' ? 'IN_PROGRESS' : 'NYC';
  await run(`UPDATE practical_records SET status=$1, items=$2, comments=$3, assessor_id=$4, assessed_at=now(), updated_at=now() WHERE id=$5`,
    [status, JSON.stringify(items), s(fd, 'comments'), me.id, r.id]);
  const learner = await one<any>('SELECT email, name FROM users WHERE id=$1', [r.user_id]);
  const c = await one<any>('SELECT title FROM courses WHERE id=$1', [r.course_id]);
  if (status === 'COMPETENT') {
    await recordCompletion(r.user_id, r.course_id, r.module_key, r.mver, null);
    await logActivity(r.user_id, r.course_id, r.module_key, 'SIGNOFF', `${r.kind}: ${me.name}`);
  } else {
    await logActivity(r.user_id, r.course_id, r.module_key, r.kind === 'OJT' ? 'OJT_SUBMIT' : 'NYC', s(fd, 'comments') || undefined);
  }
  const msg = status === 'COMPETENT' ? 'баталгаажлаа (Competent)' : status === 'NYC' ? 'чадамж хангаагүй (Not yet competent)' : 'засвар хийхээр буцаагдлаа';
  await sendEmail(learner.email, `${c.title}: ${r.kind} ${msg}`, `Сайн байна уу, ${learner.name}.\n\nТаны ${r.kind} ${msg}.${s(fd, 'comments') ? `\nҮнэлэгчийн тайлбар: ${s(fd, 'comments')}` : ''}\n\n${appUrl(`/portal/courses/${r.course_id}/m/${r.module_key}`)}`);
  await run(`INSERT INTO notifications (user_id,course_id,kind,title,body) VALUES ($1,$2,'PRACTICAL',$3,$4)`,
    [r.user_id, r.course_id, `${c.title}: ${r.kind} ${msg}`, s(fd, 'comments') || `Үнэлэгч: ${me.name}`]);
  go(back, `${learner.name}: ${msg}.`);
}
