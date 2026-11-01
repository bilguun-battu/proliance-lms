'use server';
import { revalidatePath } from 'next/cache';
import { all, one, run } from '@/lib/db';
import { sendEmail } from '@/lib/notify';
import { fmtSession } from '@/lib/format';
import { requireUser } from '@/lib/auth';
import { canAccessCourse, publishedVersion, versionModules, requirementStatus, tryComplete, logActivity, courseProgress } from '@/lib/progress';

async function loadModule(userId: string, courseId: string, key: string) {
  if (!(await canAccessCourse(userId, courseId))) throw new Error('Эрхгүй');
  const p = await courseProgress(userId, courseId);
  const m = p?.modules.find(x => x.module_key === key);
  if (!m || !m.unlocked) throw new Error('Модуль нээгдээгүй байна');
  return m;
}

export type QuizResult = { score: number; passed: boolean; passScore: number; wrong: number[] } | { error: string };

export async function submitQuiz(courseId: string, key: string, answers: number[]): Promise<QuizResult> {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const m = await loadModule(u.id, courseId, key);
  const req = await requirementStatus(u.id, courseId, m);
  if (!req.videoOk) return { error: 'Эхлээд видеог бүрэн үзнэ үү.' };
  const qs = await all<{ correct_index: number }>('SELECT correct_index FROM questions WHERE module_id=$1 ORDER BY position', [m.id]);
  if (!qs.length) return { error: 'Тест алга.' };
  const wrong = qs.map((q, i) => (answers[i] === q.correct_index ? -1 : i)).filter(i => i >= 0);
  const score = Math.round(((qs.length - wrong.length) / qs.length) * 100);
  const passed = score >= m.pass_score;
  await run('INSERT INTO quiz_attempts (user_id,course_id,module_key,mver,score,passed) VALUES ($1,$2,$3,$4,$5,$6)', [u.id, courseId, key, m.mver, score, passed]);
  await logActivity(u.id, courseId, key, 'QUIZ', `${m.title}: ${score}%${passed ? ' (тэнцсэн)' : ''}`);
  if (passed) await tryComplete(u.id, courseId, m);
  revalidatePath(`/portal/courses/${courseId}`);
  return { score, passed, passScore: m.pass_score, wrong };
}

export async function markRead(courseId: string, key: string) {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const m = await loadModule(u.id, courseId, key);
  await tryComplete(u.id, courseId, m, true);
  revalidatePath(`/portal/courses/${courseId}/m/${key}`);
}

/* ---------------- Хичээлд бүртгүүлэх ---------------- */
export async function registerSession(sessionId: string): Promise<{ error?: string; ok?: string }> {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const s = await one<any>(`SELECT s.*, c.title FROM sessions s JOIN courses c ON c.id=s.course_id WHERE s.id=$1`, [sessionId]);
  if (!s || s.status !== 'SCHEDULED' || new Date(s.starts_at) < new Date()) return { error: 'Энэ хичээлд бүртгүүлэх боломжгүй.' };
  if (!(await canAccessCourse(u.id, s.course_id))) return { error: 'Эрхгүй.' };
  const taken = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM session_attendees WHERE session_id=$1`, [sessionId]))!.n;
  if (taken >= s.seats) return { error: 'Суудал дүүрсэн байна. Өөр хуваарь сонгоно уу.' };
  // Нэг модульд нэг л ирэх хуваарьт бүртгэлтэй байна: өмнөхийг цуцална
  await run(`DELETE FROM session_attendees a USING sessions x
              WHERE a.session_id=x.id AND a.user_id=$1 AND x.course_id=$2 AND x.module_key=$3 AND a.status='REGISTERED' AND x.starts_at > now()`,
    [u.id, s.course_id, s.module_key]);
  await run(`INSERT INTO session_attendees (session_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [sessionId, u.id]);
  const when = fmtSession(s.starts_at);
  await logActivity(u.id, s.course_id, s.module_key, 'REGISTER', `${when} · ${s.location}`);
  const me = await one<any>('SELECT email FROM users WHERE id=$1', [u.id]);
  await sendEmail(me.email, `Бүртгэл баталгаажлаа: ${s.title}`,
    `Сайн байна уу, ${u.name}.\n\nТа ${when}-д болох хичээлд бүртгүүллээ.\nБайршил: ${s.location}${s.link ? `\nХолбоос: ${s.link}` : ''}\n\nХичээлээс 1 өдрийн өмнө сануулга илгээнэ.`);
  revalidatePath(`/portal/courses/${s.course_id}`);
  return { ok: `${when}-д бүртгэгдлээ.` };
}

export async function unregisterSession(sessionId: string): Promise<{ error?: string; ok?: string }> {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const s = await one<any>('SELECT * FROM sessions WHERE id=$1', [sessionId]);
  if (!s || new Date(s.starts_at) < new Date()) return { error: 'Эхэлсэн хичээлийн бүртгэлийг цуцлах боломжгүй.' };
  const r = await run(`DELETE FROM session_attendees WHERE session_id=$1 AND user_id=$2 AND status='REGISTERED'`, [sessionId, u.id]);
  if (r.rowCount) await logActivity(u.id, s.course_id, s.module_key, 'UNREGISTER', fmtSession(s.starts_at));
  revalidatePath(`/portal/courses/${s.course_id}`);
  return { ok: 'Бүртгэл цуцлагдлаа.' };
}
