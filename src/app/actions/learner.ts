'use server';
import { revalidatePath } from 'next/cache';
import { all, one, run } from '@/lib/db';
import { sendEmail } from '@/lib/notify';
import { fmtSession } from '@/lib/format';
import { requireUser, PORTAL_ROLES } from '@/lib/auth';
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
  const u = await requireUser(...PORTAL_ROLES);
  const m = await loadModule(u.id, courseId, key);
  const req = await requirementStatus(u.id, courseId, m);
  if (!req.materialOk) return { error: 'Эхлээд хичээлийн материалыг (видео, гарын авлага) бүрэн үзнэ үү.' };
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


/* Хуваарьт бүртгүүлэх: src/app/actions/offerings.ts (enrollSelf, dropSelf) */
