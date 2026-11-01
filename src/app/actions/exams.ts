'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { all, one, run, tx } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { canAccessCourse, logActivity } from '@/lib/progress';
import { newToken, runByToken, runIsOpen, shuffled, attemptDeadline, gradeAttempt } from '@/lib/exams';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const go = (path: string, msg: string, err = false): never =>
  redirect(`${path}${path.includes('?') ? '&' : '?'}${err ? 'err' : 'ok'}=${encodeURIComponent(msg)}`);
const LETTERS = 'АБВГДЕЖЗИК';

/* ---------------- Шалгалтын сан (админ) ---------------- */
export async function createExam(fd: FormData) {
  await requireUser('ADMIN');
  const [courseId, moduleKey] = s(fd, 'target').split('|');
  const title = s(fd, 'title');
  if (!courseId || !title) go('/admin/exams', 'Сургалт болон шалгалтын нэрийг оруулна уу.', true);
  const variants = Math.min(10, Math.max(1, Number(s(fd, 'variants')) || 2));
  const id = await tx(async c => {
    const e = await one<{ id: string }>('INSERT INTO exams (course_id,module_key,title,duration_min,pass_score) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [courseId, moduleKey || null, title, Number(s(fd, 'duration_min')) || 20, Number(s(fd, 'pass_score')) || 70], c);
    for (let i = 0; i < variants; i++) await run('INSERT INTO exam_variants (exam_id,name,position) VALUES ($1,$2,$3)', [e!.id, `${LETTERS[i]} хувилбар`, i + 1], c);
    return e!.id;
  });
  redirect(`/admin/exams/${id}?ok=${encodeURIComponent('Шалгалт үүслээ. Хувилбар бүрт асуултаа нэмнэ үү.')}`);
}

export async function updateExam(fd: FormData) {
  await requireUser('ADMIN');
  const id = s(fd, 'exam_id');
  await run('UPDATE exams SET title=$1,duration_min=$2,pass_score=$3,shuffle=$4 WHERE id=$5',
    [s(fd, 'title'), Number(s(fd, 'duration_min')) || 20, Math.min(100, Math.max(0, Number(s(fd, 'pass_score')) || 70)), fd.get('shuffle') === 'on', id]);
  go(`/admin/exams/${id}`, 'Шалгалтын тохиргоо хадгалагдлаа.');
}

export async function deleteExam(fd: FormData) {
  await requireUser('ADMIN');
  await run('DELETE FROM exams WHERE id=$1', [s(fd, 'exam_id')]);
  go('/admin/exams', 'Шалгалт устгагдлаа.');
}

export async function addVariant(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id'), copyFrom = s(fd, 'copy_from');
  await tx(async c => {
    const n = (await one<{ n: number }>('SELECT count(*)::int AS n FROM exam_variants WHERE exam_id=$1', [examId], c))!.n;
    const v = await one<{ id: string }>('INSERT INTO exam_variants (exam_id,name,position) VALUES ($1,$2,$3) RETURNING id', [examId, `${LETTERS[n] ?? n + 1} хувилбар`, n + 1], c);
    if (copyFrom) await run('INSERT INTO exam_questions (variant_id,position,text,options,correct_index) SELECT $1,position,text,options,correct_index FROM exam_questions WHERE variant_id=$2', [v!.id, copyFrom], c);
  });
  go(`/admin/exams/${examId}`, copyFrom ? 'Хувилбар хуулагдлаа. Асуултуудыг өөрчилнө үү.' : 'Хувилбар нэмэгдлээ.');
}

export async function deleteVariant(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id');
  const n = (await one<{ n: number }>('SELECT count(*)::int AS n FROM exam_variants WHERE exam_id=$1', [examId]))!.n;
  if (n <= 1) go(`/admin/exams/${examId}`, 'Дор хаяж нэг хувилбар байх ёстой.', true);
  const used = await one('SELECT 1 FROM exam_attempts WHERE variant_id=$1 LIMIT 1', [s(fd, 'variant_id')]);
  if (used) go(`/admin/exams/${examId}`, 'Энэ хувилбараар шалгалт өгсөн тул устгах боломжгүй.', true);
  await run('DELETE FROM exam_variants WHERE id=$1 AND exam_id=$2', [s(fd, 'variant_id'), examId]);
  go(`/admin/exams/${examId}`, 'Хувилбар устгагдлаа.');
}

export async function addExamQuestion(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id'), variantId = s(fd, 'variant_id'), text = s(fd, 'text');
  const options = [1, 2, 3, 4, 5].map(i => s(fd, `opt${i}`)).filter(Boolean);
  const correct = Number(s(fd, 'correct')) - 1;
  const back = `/admin/exams/${examId}?v=${variantId}`;
  if (!text || options.length < 2) go(back, 'Асуулт болон дор хаяж 2 хариулт оруулна уу.', true);
  if (correct < 0 || !s(fd, `opt${correct + 1}`)) go(back, 'Зөв хариултыг сонгоно уу.', true);
  const realCorrect = [1, 2, 3, 4, 5].slice(0, correct).filter(i => s(fd, `opt${i}`)).length;
  const pos = (await one<{ p: number }>('SELECT coalesce(max(position),0)+1 AS p FROM exam_questions WHERE variant_id=$1', [variantId]))!.p;
  await run('INSERT INTO exam_questions (variant_id,position,text,options,correct_index) VALUES ($1,$2,$3,$4,$5)', [variantId, pos, text, JSON.stringify(options), realCorrect]);
  go(back, 'Асуулт нэмэгдлээ.');
}

export async function deleteExamQuestion(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id'), variantId = s(fd, 'variant_id');
  await run('DELETE FROM exam_questions WHERE id=$1 AND variant_id=$2', [s(fd, 'question_id'), variantId]);
  go(`/admin/exams/${examId}?v=${variantId}`, 'Асуулт устгагдлаа.');
}

/* ---------------- Шалгалт эхлүүлэх / хаах ---------------- */
export async function openExamRun(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id'), sessionId = s(fd, 'session_id') || null;
  const back = sessionId ? '/admin/sessions' : `/admin/exams/${examId}`;
  const empty = await all<{ name: string }>(`SELECT v.name FROM exam_variants v WHERE v.exam_id=$1 AND NOT EXISTS (SELECT 1 FROM exam_questions q WHERE q.variant_id=v.id)`, [examId]);
  if (empty.length) go(back, `Асуултгүй хувилбар байна: ${empty.map(e => e.name).join(', ')}`, true);
  const exam = await one<any>('SELECT * FROM exams WHERE id=$1', [examId]);
  if (!exam) go(back, 'Шалгалт олдсонгүй.', true);
  // Холбоос нээлттэй байх хугацаа: шалгалтын хугацаа + 15 минут (хоцорсон хүн эхлэх боломж)
  const openMin = Number(s(fd, 'open_min')) || exam.duration_min + 15;
  const r = await one<{ id: string }>(`INSERT INTO exam_runs (exam_id,session_id,token,closes_at) VALUES ($1,$2,$3,now() + ($4 || ' minutes')::interval) RETURNING id`,
    [examId, sessionId, newToken(), String(openMin)]);
  redirect(`/admin/exams/live/${r!.id}`);
}

export async function closeExamRun(fd: FormData) {
  await requireUser('ADMIN');
  const id = s(fd, 'run_id');
  await run('UPDATE exam_runs SET closed_at=now() WHERE id=$1 AND closed_at IS NULL', [id]);
  // Эхэлсэн боловч илгээгээгүй оролцогчдын хариултыг одоо байгаагаар нь дүгнэнэ
  const open = await all<any>('SELECT id FROM exam_attempts WHERE run_id=$1 AND submitted_at IS NULL', [id]);
  for (const a of open) await gradeAttempt(a.id, null);
  go(`/admin/exams/live/${id}`, 'Шалгалт дууслаа. Холбоос идэвхгүй боллоо.');
}

export async function extendExamRun(fd: FormData) {
  await requireUser('ADMIN');
  const id = s(fd, 'run_id');
  await run(`UPDATE exam_runs SET closes_at = greatest(closes_at, now()) + interval '10 minutes' WHERE id=$1 AND closed_at IS NULL`, [id]);
  go(`/admin/exams/live/${id}`, 'Хугацаа 10 минутаар сунгагдлаа.');
}

/* ---------------- Оролцогч ---------------- */
export async function startAttempt(token: string): Promise<{ error?: string }> {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const r = await runByToken(token);
  if (!r || !runIsOpen(r)) return { error: 'Шалгалт дууссан эсвэл холбоос идэвхгүй байна.' };
  if (!(await canAccessCourse(u.id, r.course_id))) return { error: 'Танд энэ шалгалтыг өгөх эрх алга. Proliance-тай холбогдоно уу.' };
  const existing = await one('SELECT 1 FROM exam_attempts WHERE run_id=$1 AND user_id=$2', [r.id, u.id]);
  if (!existing) {
    const variants = await all<{ id: string }>('SELECT id FROM exam_variants WHERE exam_id=$1', [r.exam_id]);
    const v = variants[Math.floor(Math.random() * variants.length)];
    const qids = (await all<{ id: string }>('SELECT id FROM exam_questions WHERE variant_id=$1 ORDER BY position', [v.id])).map(q => q.id);
    await run('INSERT INTO exam_attempts (run_id,user_id,variant_id,question_ids) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [r.id, u.id, v.id, JSON.stringify(r.shuffle ? shuffled(qids) : qids)]);
    await logActivity(u.id, r.course_id, r.module_key, 'EXAM_START', r.title);
  }
  revalidatePath(`/exam/${token}`);
  return {};
}

export async function submitAttempt(token: string, answers: number[]): Promise<{ error?: string }> {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const r = await runByToken(token);
  if (!r) return { error: 'Шалгалт олдсонгүй.' };
  const a = await one<any>('SELECT * FROM exam_attempts WHERE run_id=$1 AND user_id=$2', [r.id, u.id]);
  if (!a) return { error: 'Шалгалт эхлээгүй байна.' };
  if (a.submitted_at) return {};
  // Хугацаа дууссанаас хойш 30 секундын дотор ирсэн хариултыг хүлээн авна (сүлжээний саатал)
  const late = Date.now() > attemptDeadline(r, a.started_at) + 30000 || !!r.closed_at;
  await gradeAttempt(a.id, late ? null : answers);
  revalidatePath(`/exam/${token}`);
  return {};
}

// Хугацаа явж байхад хариултыг түр хадгална (утас унтарвал алдагдахгүй)
export async function saveDraftAnswers(token: string, answers: number[]) {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const r = await runByToken(token);
  if (!r) return;
  await run('UPDATE exam_attempts SET answers=$1 WHERE run_id=$2 AND user_id=$3 AND submitted_at IS NULL', [JSON.stringify(answers), r.id, u.id]);
}
