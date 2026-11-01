'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { all, one, run, tx } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { canAccessCourse, logActivity } from '@/lib/progress';
import { saveFormFile, IMAGE_TYPES, PDF_TYPES } from '@/lib/files';
import {
  newToken, runByToken, runIsOpen, attemptDeadline, gradeAttempt, finalizeAttempt, drawQuestions, latestAttempt,
  attemptQuestions, QTYPES, AUTO_TYPES, type QType, type Answer,
} from '@/lib/exams';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const n = (fd: FormData, k: string, def: number, min = 0, max = 100000) => {
  const v = Number(s(fd, k));
  return Number.isFinite(v) && s(fd, k) !== '' ? Math.min(max, Math.max(min, Math.round(v))) : def;
};
const go = (target: string, msg: string, err = false): never => {
  const [path, hash] = target.split('#');
  redirect(`${path}${path.includes('?') ? '&' : '?'}${err ? 'err' : 'ok'}=${encodeURIComponent(msg)}${hash ? `#${hash}` : ''}`);
};
const touch = (examId: string) => run('UPDATE exams SET updated_at=now() WHERE id=$1', [examId]);

/* ---------------- Шалгалтын материал: тохиргоо ---------------- */
export async function saveExam(fd: FormData) {
  const me = await requireUser('ADMIN');
  const id = s(fd, 'exam_id');
  const back = id ? `/admin/exams/${id}/edit` : '/admin/exams/new';
  const [courseId, moduleKey] = s(fd, 'target').split('|');
  const title = s(fd, 'title');
  if (!courseId || !title) go(back, 'Шалгалтын нэр болон хамаарах сургалтыг оруулна уу.', true);
  const file = await saveFormFile(fd.get('file') as File | null, PDF_TYPES, 20);
  if (file && typeof file === 'object') go(back, file.error, true);
  const vals = [
    title, courseId, moduleKey || null,
    s(fd, 'status') === 'HIDDEN' ? 'HIDDEN' : 'ACTIVE',
    s(fd, 'check_mode') === 'MANUAL' ? 'MANUAL' : 'AUTO',
    s(fd, 'show_result') === 'LATER' ? 'LATER' : 'NOW',
    n(fd, 'duration_min', 20, 0, 600), n(fd, 'attempts_allowed', 1, 1, 10), n(fd, 'pass_score', 70, 0, 100),
    fd.get('shuffle') === 'on', s(fd, 'description'), s(fd, 'eval_template_id') || null,
  ];
  let examId = id;
  if (id) {
    await run(`UPDATE exams SET title=$1, course_id=$2, module_key=$3, status=$4, check_mode=$5, show_result=$6, duration_min=$7,
      attempts_allowed=$8, pass_score=$9, shuffle=$10, description=$11, eval_template_id=$12, updated_at=now() WHERE id=$13`, [...vals, id]);
    if (typeof file === 'string') await run('UPDATE exams SET file_id=$1 WHERE id=$2', [file, id]);
    else if (fd.get('remove_file') === 'on') await run('UPDATE exams SET file_id=NULL WHERE id=$1', [id]);
  } else {
    examId = await tx(async c => {
      const e = await one<{ id: string }>(`INSERT INTO exams (title,course_id,module_key,status,check_mode,show_result,duration_min,attempts_allowed,
        pass_score,shuffle,description,eval_template_id,file_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [...vals, typeof file === 'string' ? file : null, me.id], c);
      await run('INSERT INTO exam_sections (exam_id,position,draw_count) VALUES ($1,1,0)', [e!.id], c);
      return e!.id;
    });
  }
  go(`/admin/exams/${examId}`, id ? 'Тохиргоо хадгалагдлаа.' : 'Шалгалт үүслээ. Одоо бүлэг, асуултаа нэмнэ үү.');
}

export async function deleteExam(fd: FormData) {
  await requireUser('ADMIN');
  const used = await one('SELECT 1 FROM exam_runs WHERE exam_id=$1 LIMIT 1', [s(fd, 'exam_id')]);
  if (used) go(`/admin/exams/${s(fd, 'exam_id')}`, 'Энэ шалгалтыг авч байсан тул устгах боломжгүй. Оронд нь "Нуусан" төлөвт шилжүүлнэ үү.', true);
  await run('DELETE FROM exams WHERE id=$1', [s(fd, 'exam_id')]);
  go('/admin/exams', 'Шалгалт устгагдлаа.');
}

// Хуулбарлах: тохиргоо, бүлэг, асуулт, онооны шатлалыг хуулж "Нуусан" төлөвтэй шинэ шалгалт үүсгэнэ
export async function duplicateExam(fd: FormData) {
  const me = await requireUser('ADMIN');
  const src = s(fd, 'exam_id');
  const id = await tx(async c => {
    const e = await one<{ id: string }>(`INSERT INTO exams (course_id,module_key,title,duration_min,pass_score,shuffle,status,check_mode,show_result,
        attempts_allowed,description,eval_template_id,file_id,created_by)
      SELECT course_id,module_key,title || ' (хуулбар)',duration_min,pass_score,shuffle,'HIDDEN',check_mode,show_result,attempts_allowed,
        description,eval_template_id,file_id,$2 FROM exams WHERE id=$1 RETURNING id`, [src, me.id], c);
    const secs = await all<any>('SELECT * FROM exam_sections WHERE exam_id=$1 ORDER BY position', [src], c);
    for (const x of secs) {
      const ns = await one<{ id: string }>('INSERT INTO exam_sections (exam_id,position,draw_count,description) VALUES ($1,$2,$3,$4) RETURNING id',
        [e!.id, x.position, x.draw_count, x.description], c);
      await run(`INSERT INTO exam_questions (section_id,position,text,options,correct,correct_index,qtype,image_file,points)
        SELECT $1,position,text,options,correct,correct_index,qtype,image_file,points FROM exam_questions WHERE section_id=$2`, [ns!.id, x.id], c);
    }
    await run('INSERT INTO exam_bands (exam_id,min_points,max_points,label,passed) SELECT $1,min_points,max_points,label,passed FROM exam_bands WHERE exam_id=$2', [e!.id, src], c);
    return e!.id;
  });
  go(`/admin/exams/${id}`, 'Хуулбар үүслээ ("Нуусан" төлөвтэй). Шаардлагатай засвараа хийгээд идэвхжүүлнэ үү.');
}

/* ---------------- Бүлэг ---------------- */
export async function addSection(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id');
  await run('INSERT INTO exam_sections (exam_id,position,draw_count) VALUES ($1,(SELECT coalesce(max(position),0)+1 FROM exam_sections WHERE exam_id=$1),$2)',
    [examId, n(fd, 'draw_count', 0, 0, 500)]);
  await touch(examId);
  go(`/admin/exams/${examId}`, 'Бүлэг нэмэгдлээ.');
}

export async function updateSection(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id');
  await run('UPDATE exam_sections SET draw_count=$1, description=$2 WHERE id=$3 AND exam_id=$4',
    [n(fd, 'draw_count', 0, 0, 500), s(fd, 'description'), s(fd, 'section_id'), examId]);
  await touch(examId);
  go(`/admin/exams/${examId}`, 'Бүлэг хадгалагдлаа.');
}

export async function deleteSection(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id');
  await tx(async c => {
    await run('DELETE FROM exam_sections WHERE id=$1 AND exam_id=$2', [s(fd, 'section_id'), examId], c);
    await run(`UPDATE exam_sections x SET position=r.p FROM (SELECT id, row_number() OVER (ORDER BY position) AS p FROM exam_sections WHERE exam_id=$1) r
               WHERE x.id=r.id`, [examId], c);
  });
  await touch(examId);
  go(`/admin/exams/${examId}`, 'Бүлэг асуултуудын хамт устгагдлаа.');
}

export async function moveSection(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id');
  const cur = await one<any>('SELECT * FROM exam_sections WHERE id=$1 AND exam_id=$2', [s(fd, 'section_id'), examId]);
  const prev = cur && await one<any>('SELECT * FROM exam_sections WHERE exam_id=$1 AND position<$2 ORDER BY position DESC LIMIT 1', [examId, cur.position]);
  if (cur && prev) await tx(async c => {
    await run('UPDATE exam_sections SET position=$1 WHERE id=$2', [prev.position, cur.id], c);
    await run('UPDATE exam_sections SET position=$1 WHERE id=$2', [cur.position, prev.id], c);
  });
  go(`/admin/exams/${examId}`, 'Бүлгийн дараалал өөрчлөгдлөө.');
}

/* ---------------- Асуулт ---------------- */
export async function saveQuestion(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id'), qid = s(fd, 'question_id'), sectionId = s(fd, 'section_id');
  const back = `/admin/exams/${examId}/q/${qid || 'new'}${qid ? '' : `?section=${sectionId}`}`;
  const sec = await one('SELECT 1 FROM exam_sections WHERE id=$1 AND exam_id=$2', [sectionId, examId]);
  if (!sec) go(back, 'Бүлгээ сонгоно уу.', true);
  const qtype = (QTYPES.includes(s(fd, 'qtype') as QType) ? s(fd, 'qtype') : 'RADIO') as QType;
  const text = s(fd, 'text');
  if (!text) go(back, 'Асуултын текстийг оруулна уу.', true);

  let options: string[] = [], correct: number[] = [];
  if (qtype === 'YESNO') {
    const c = s(fd, 'yn');
    if (c !== '0' && c !== '1') go(back, 'Зөв хариулт (Тийм эсвэл Үгүй)-г сонгоно уу.', true);
    correct = [Number(c)];
  } else if (AUTO_TYPES.includes(qtype)) {
    const raw = Array.from({ length: 10 }, (_, i) => ({ t: s(fd, `opt${i + 1}`), c: fd.get(`c${i + 1}`) === 'on' || s(fd, 'correct') === String(i + 1) }));
    const kept = raw.filter(r => r.t);
    options = kept.map(r => r.t);
    correct = kept.flatMap((r, i) => (r.c ? [i] : []));
    if (options.length < 2) go(back, 'Дор хаяж 2 хариулт оруулна уу.', true);
    if (!correct.length) go(back, 'Зөв хариултыг тэмдэглэнэ үү.', true);
    if (qtype !== 'CHECKBOX' && correct.length > 1) go(back, `"${qtype === 'SELECT' ? 'Жагсаалтаас сонгох' : 'Нэг сонголт'}" төрөлд нэг л зөв хариулт байна.`, true);
  }
  const img = await saveFormFile(fd.get('image') as File | null, IMAGE_TYPES, 5);
  if (img && typeof img === 'object') go(back, img.error, true);
  const points = n(fd, 'points', 1, 0, 100);
  if (qid) {
    await run(`UPDATE exam_questions SET section_id=$1, text=$2, qtype=$3, options=$4, correct=$5, correct_index=$6, points=$7,
      position=coalesce($8, position) WHERE id=$9`,
      [sectionId, text, qtype, JSON.stringify(options), JSON.stringify(correct), correct[0] ?? null, points, s(fd, 'position') ? n(fd, 'position', 1, 1) : null, qid]);
    if (typeof img === 'string') await run('UPDATE exam_questions SET image_file=$1 WHERE id=$2', [img, qid]);
    else if (fd.get('remove_image') === 'on') await run('UPDATE exam_questions SET image_file=NULL WHERE id=$1', [qid]);
  } else {
    const pos = s(fd, 'position') ? n(fd, 'position', 1, 1)
      : (await one<{ p: number }>('SELECT coalesce(max(position),0)+1 AS p FROM exam_questions WHERE section_id=$1', [sectionId]))!.p;
    await run(`INSERT INTO exam_questions (section_id,position,text,qtype,options,correct,correct_index,points,image_file) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [sectionId, pos, text, qtype, JSON.stringify(options), JSON.stringify(correct), correct[0] ?? null, points, typeof img === 'string' ? img : null]);
  }
  await touch(examId);
  if (fd.get('again') === '1') go(`/admin/exams/${examId}/q/new?section=${sectionId}&t=${Date.now()}`, 'Асуулт хадгалагдлаа. Дараагийн асуултаа оруулна уу.');
  go(`/admin/exams/${examId}#s-${sectionId}`, 'Асуулт хадгалагдлаа.');
}

export async function deleteQuestion(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id');
  await run(`DELETE FROM exam_questions q USING exam_sections x WHERE q.id=$1 AND x.id=q.section_id AND x.exam_id=$2`, [s(fd, 'question_id'), examId]);
  await touch(examId);
  go(`/admin/exams/${examId}`, 'Асуулт устгагдлаа.');
}

/* ---------------- Онооны шатлал ---------------- */
export async function addBand(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id');
  const back = `/admin/exams/${examId}?tab=bands`;
  const min = Number(s(fd, 'min_points')), max = Number(s(fd, 'max_points'));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) go(back, 'Онооны доод, дээд хязгаарыг зөв оруулна уу.', true);
  const overlap = await one('SELECT 1 FROM exam_bands WHERE exam_id=$1 AND NOT ($3 < min_points OR $2 > max_points)', [examId, min, max]);
  if (overlap) go(back, 'Энэ онооны завсар өөр шатлалтай давхцаж байна.', true);
  if (!s(fd, 'label')) go(back, 'Дүнгийн нэрийг оруулна уу.', true);
  await run('INSERT INTO exam_bands (exam_id,min_points,max_points,label,passed) VALUES ($1,$2,$3,$4,$5)', [examId, min, max, s(fd, 'label'), fd.get('passed') === 'on']);
  await touch(examId);
  go(back, 'Онооны шатлал нэмэгдлээ.');
}

export async function deleteBand(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id');
  await run('DELETE FROM exam_bands WHERE id=$1 AND exam_id=$2', [s(fd, 'band_id'), examId]);
  go(`/admin/exams/${examId}?tab=bands`, 'Онооны шатлал устгагдлаа.');
}

/* ---------------- Шалгалт эхлүүлэх / хаах ---------------- */
export async function openExamRun(fd: FormData) {
  await requireUser('ADMIN');
  const examId = s(fd, 'exam_id'), sessionId = s(fd, 'session_id') || null;
  const back = sessionId ? '/admin/sessions' : `/admin/exams/${examId}`;
  const exam = await one<any>('SELECT * FROM exams WHERE id=$1', [examId]);
  if (!exam) go(back, 'Шалгалт олдсонгүй.', true);
  if (exam.status === 'HIDDEN') go(back, 'Шалгалт "Нуусан" төлөвтэй байна. Тохиргооноос идэвхжүүлнэ үү.', true);
  const qn = (await one<{ n: number }>('SELECT count(*)::int AS n FROM exam_questions q JOIN exam_sections x ON x.id=q.section_id WHERE x.exam_id=$1', [examId]))!.n;
  if (!qn && exam.check_mode !== 'MANUAL') go(back, 'Шалгалтад асуулт алга. Асуулт нэмэх эсвэл "Гараар шалгах" (дадлагын үнэлгээ) болгоно уу.', true);
  // Холбоос нээлттэй байх хугацаа: шалгалтын хугацаа + 15 минут (хязгааргүй бол 3 цаг)
  const openMin = Number(s(fd, 'open_min')) || (exam.duration_min > 0 ? exam.duration_min + 15 : 180);
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

/* ---------------- Багш гараар шалгах ---------------- */
export async function reviewAttempt(fd: FormData) {
  const me = await requireUser('ADMIN');
  const id = s(fd, 'attempt_id');
  const a = await one<any>('SELECT * FROM exam_attempts WHERE id=$1', [id]);
  if (!a || !a.submitted_at) go('/admin/exams', 'Хариулт олдсонгүй.', true);
  const qs = await attemptQuestions(a.question_ids);
  const marks = qs.map((q, i) => Math.min(q.points, Math.max(0, Number(s(fd, `m${i}`)) || 0)));
  const pts = marks.reduce((t, m) => t + m, 0);
  await run(`UPDATE exam_attempts SET marks=$1, points=$2, max_points=$3, review_status='DONE', reviewer_id=$4, reviewed_at=now(), review_note=$5 WHERE id=$6`,
    [JSON.stringify(marks), pts, qs.reduce((t, q) => t + q.points, 0), me.id, s(fd, 'note') || null, id]);
  const d = s(fd, 'decision');
  await finalizeAttempt(id, d === 'pass' || d === 'fail' ? { passed: d === 'pass', label: s(fd, 'label') || undefined } : undefined);
  go(`/admin/exams/live/${a.run_id}`, 'Дүн хадгалагдлаа.');
}

/* ---------------- Оролцогч ---------------- */
export async function startAttempt(token: string): Promise<{ error?: string }> {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const r = await runByToken(token);
  if (!r || !runIsOpen(r)) return { error: 'Шалгалт дууссан эсвэл холбоос идэвхгүй байна.' };
  if (!(await canAccessCourse(u.id, r.course_id))) return { error: 'Танд энэ шалгалтыг өгөх эрх алга. Proliance-тай холбогдоно уу.' };
  const last = await latestAttempt(r.id, u.id);
  if (last && !last.submitted_at) return {};
  if (last && (last.passed || last.review_status === 'PENDING' || last.attempt_no >= r.attempts_allowed)) return { error: 'Дахин өгөх боломжгүй байна.' };
  const qs = await drawQuestions(r.exam_id, r.shuffle);
  const ins = await one<{ id: string }>('INSERT INTO exam_attempts (run_id,user_id,question_ids,attempt_no) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',
    [r.id, u.id, JSON.stringify(qs.map(q => q.id)), (last?.attempt_no ?? 0) + 1]);
  await logActivity(u.id, r.course_id, r.module_key, 'EXAM_START', r.title);
  // Асуултгүй дадлагын үнэлгээ: оролцогч бүртгэгдээд багшийн дүнг хүлээнэ
  if (ins && !qs.length) await gradeAttempt(ins.id, []);
  revalidatePath(`/exam/${token}`);
  return {};
}

export async function submitAttempt(token: string, answers: Answer[]): Promise<{ error?: string }> {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const r = await runByToken(token);
  if (!r) return { error: 'Шалгалт олдсонгүй.' };
  const a = await latestAttempt(r.id, u.id);
  if (!a) return { error: 'Шалгалт эхлээгүй байна.' };
  if (a.submitted_at) return {};
  // Хугацаа дууссанаас хойш 30 секундын дотор ирсэн хариултыг хүлээн авна (сүлжээний саатал)
  const late = Date.now() > attemptDeadline(r, a.started_at) + 30000 || !!r.closed_at;
  await gradeAttempt(a.id, late ? null : answers);
  revalidatePath(`/exam/${token}`);
  return {};
}

// Хугацаа явж байхад хариултыг түр хадгална (утас унтарвал алдагдахгүй)
export async function saveDraftAnswers(token: string, answers: Answer[]) {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const r = await runByToken(token);
  if (!r) return;
  await run(`UPDATE exam_attempts SET answers=$1 WHERE id=(SELECT id FROM exam_attempts WHERE run_id=$2 AND user_id=$3 ORDER BY attempt_no DESC LIMIT 1)
             AND submitted_at IS NULL`, [JSON.stringify(answers), r.id, u.id]);
}
