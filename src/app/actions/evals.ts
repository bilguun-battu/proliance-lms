'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { all, one, run, tx } from '@/lib/db';
import { requireUser, PORTAL_ROLES, STAFF_ROLES } from '@/lib/auth';
import { canAccessCourse, logActivity } from '@/lib/progress';
import { newToken, runIsOpen } from '@/lib/exams';
import { DEFAULT_QUESTIONS, evalRunByToken, templateQuestions, EvalAnswer } from '@/lib/evals';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const go = (path: string, msg: string, err = false): never =>
  redirect(`${path}${path.includes('?') ? '&' : '?'}${err ? 'err' : 'ok'}=${encodeURIComponent(msg)}`);
const fmt = (v: string) => (['ELEARN', 'INPERSON', 'ONLINE'].includes(v) ? v : null);

/* ---------------- Маягт ---------------- */
export async function createTemplate(fd: FormData) {
  await requireUser(...STAFF_ROLES);
  const name = s(fd, 'name');
  if (!name) go('/admin/evaluations', 'Маягтын нэрийг оруулна уу.', true);
  const id = await tx(async c => {
    const t = await one<{ id: string }>('INSERT INTO eval_templates (name,format,course_id,anonymous) VALUES ($1,$2,$3,$4) RETURNING id',
      [name, fmt(s(fd, 'format')), s(fd, 'course_id') || null, fd.get('anonymous') === 'on'], c);
    if (fd.get('defaults') === 'on') {
      let p = 1;
      for (const q of DEFAULT_QUESTIONS) await run('INSERT INTO eval_questions (template_id,position,section,kind,text,options,required) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [t!.id, p++, q.section, q.kind, q.text, JSON.stringify(q.options), q.required], c);
    }
    return t!.id;
  });
  redirect(`/admin/evaluations/${id}?ok=${encodeURIComponent('Маягт үүслээ.')}`);
}

export async function updateTemplate(fd: FormData) {
  await requireUser(...STAFF_ROLES);
  const id = s(fd, 'template_id');
  await run('UPDATE eval_templates SET name=$1, format=$2, course_id=$3, anonymous=$4, intro=$5 WHERE id=$6',
    [s(fd, 'name'), fmt(s(fd, 'format')), s(fd, 'course_id') || null, fd.get('anonymous') === 'on', s(fd, 'intro'), id]);
  go(`/admin/evaluations/${id}`, 'Маягтын тохиргоо хадгалагдлаа.');
}

export async function copyTemplate(fd: FormData) {
  await requireUser(...STAFF_ROLES);
  const src = s(fd, 'template_id');
  const id = await tx(async c => {
    const t = await one<{ id: string }>(`INSERT INTO eval_templates (name,format,course_id,anonymous,intro)
      SELECT name || ' (хуулбар)', format, course_id, anonymous, intro FROM eval_templates WHERE id=$1 RETURNING id`, [src], c);
    await run('INSERT INTO eval_questions (template_id,position,section,kind,text,options,required) SELECT $1,position,section,kind,text,options,required FROM eval_questions WHERE template_id=$2', [t!.id, src], c);
    return t!.id;
  });
  redirect(`/admin/evaluations/${id}?ok=${encodeURIComponent('Маягт хуулагдлаа. Төрөл, нэрийг нь өөрчилнө үү.')}`);
}

export async function deleteTemplate(fd: FormData) {
  await requireUser(...STAFF_ROLES);
  await run('DELETE FROM eval_templates WHERE id=$1', [s(fd, 'template_id')]);
  go('/admin/evaluations', 'Маягт устгагдлаа.');
}

export async function addEvalQuestion(fd: FormData) {
  await requireUser(...STAFF_ROLES);
  const id = s(fd, 'template_id'), kind = s(fd, 'kind'), text = s(fd, 'text');
  const back = `/admin/evaluations/${id}`;
  if (!text || !['RATING', 'CHOICE', 'TEXT'].includes(kind)) go(back, 'Асуулт болон төрлийг оруулна уу.', true);
  const options = kind === 'CHOICE' ? s(fd, 'options').split('\n').map(x => x.trim()).filter(Boolean) : [];
  if (kind === 'CHOICE' && options.length < 2) go(back, 'Сонголттой асуултад дор хаяж 2 хариулт мөр мөрөөр оруулна уу.', true);
  const pos = (await one<{ p: number }>('SELECT coalesce(max(position),0)+1 AS p FROM eval_questions WHERE template_id=$1', [id]))!.p;
  await run('INSERT INTO eval_questions (template_id,position,section,kind,text,options,required) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, pos, s(fd, 'section') || 'Ерөнхий', kind, text, JSON.stringify(options), fd.get('required') === 'on']);
  go(back, 'Асуулт нэмэгдлээ.');
}

export async function deleteEvalQuestion(fd: FormData) {
  await requireUser(...STAFF_ROLES);
  const id = s(fd, 'template_id');
  await run('DELETE FROM eval_questions WHERE id=$1 AND template_id=$2', [s(fd, 'question_id'), id]);
  go(`/admin/evaluations/${id}`, 'Асуулт устгагдлаа.');
}

export async function moveEvalQuestion(fd: FormData) {
  await requireUser(...STAFF_ROLES);
  const id = s(fd, 'template_id'), qid = s(fd, 'question_id'), dir = s(fd, 'dir');
  await tx(async c => {
    const qs = await all<{ id: string }>('SELECT id FROM eval_questions WHERE template_id=$1 ORDER BY position', [id], c);
    const i = qs.findIndex(q => q.id === qid), j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    for (let k = 0; k < qs.length; k++) await run('UPDATE eval_questions SET position=$1 WHERE id=$2', [k + 1, qs[k].id], c);
  });
  revalidatePath(`/admin/evaluations/${id}`);
}

/* ---------------- Үнэлгээ эхлүүлэх / хаах ---------------- */
export async function openEvalRun(fd: FormData) {
  await requireUser(...STAFF_ROLES);
  const templateId = s(fd, 'template_id'), sessionId = s(fd, 'session_id') || null;
  const back = sessionId ? '/admin/sessions' : `/admin/evaluations/${templateId}`;
  const n = (await one<{ n: number }>('SELECT count(*)::int AS n FROM eval_questions WHERE template_id=$1', [templateId]))!.n;
  if (!n) go(back, 'Маягтад асуулт алга.', true);
  const sess = sessionId ? await one<any>('SELECT course_id, instructor FROM sessions WHERE id=$1', [sessionId]) : null;
  const courseId = sess?.course_id ?? (s(fd, 'course_id') || null);
  const minutes = Math.max(5, Number(s(fd, 'open_min')) || 30);
  const r = await one<{ id: string }>(`INSERT INTO eval_runs (template_id,session_id,course_id,instructor,token,closes_at)
     VALUES ($1,$2,$3,$4,$5,now() + ($6 || ' minutes')::interval) RETURNING id`,
    [templateId, sessionId, courseId, sess?.instructor ?? (s(fd, 'instructor') || null), newToken(), String(minutes)]);
  redirect(`/admin/evaluations/live/${r!.id}`);
}

export async function closeEvalRun(fd: FormData) {
  await requireUser(...STAFF_ROLES);
  const id = s(fd, 'run_id');
  await run('UPDATE eval_runs SET closed_at=now() WHERE id=$1 AND closed_at IS NULL', [id]);
  go(`/admin/evaluations/live/${id}`, 'Үнэлгээ хаагдлаа. Холбоос идэвхгүй боллоо.');
}

export async function extendEvalRun(fd: FormData) {
  await requireUser(...STAFF_ROLES);
  const id = s(fd, 'run_id');
  await run(`UPDATE eval_runs SET closes_at = greatest(closes_at, now()) + interval '15 minutes' WHERE id=$1 AND closed_at IS NULL`, [id]);
  go(`/admin/evaluations/live/${id}`, 'Хугацаа 15 минутаар сунгагдлаа.');
}

/* ---------------- Оролцогч бөглөх ---------------- */
export async function submitEvaluation(token: string, values: Record<string, number | string>): Promise<{ error?: string }> {
  const u = await requireUser(...PORTAL_ROLES);
  const r = await evalRunByToken(token);
  if (!r || !runIsOpen(r)) return { error: 'Үнэлгээ хаагдсан байна.' };
  if (r.course_id && !(await canAccessCourse(u.id, r.course_id))) return { error: 'Танд энэ хичээлийг үнэлэх эрх алга.' };
  const qs = await templateQuestions(r.template_id);
  const answers: EvalAnswer[] = [];
  for (const q of qs) {
    let v = values[q.id];
    if (q.kind === 'RATING') v = Number(v) >= 1 && Number(v) <= 5 ? Number(v) : (undefined as any);
    if (q.kind === 'CHOICE' && !q.options.includes(String(v))) v = undefined as any;
    if (q.kind === 'TEXT') v = String(v ?? '').trim().slice(0, 2000);
    const empty = v === undefined || v === '';
    if (q.required && empty) return { error: `"${q.text}" асуултад хариулна уу.` };
    answers.push({ qid: q.id, section: q.section, kind: q.kind, text: q.text, value: empty ? null : v });
  }
  const res = await run('INSERT INTO eval_responses (run_id,user_id,answers) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [r.id, u.id, JSON.stringify(answers)]);
  if (!res.rowCount) return { error: 'Та энэ хичээлийг аль хэдийн үнэлсэн байна.' };
  await logActivity(u.id, r.course_id, null, 'EVAL', r.name);
  revalidatePath(`/eval/${token}`);
  return {};
}
