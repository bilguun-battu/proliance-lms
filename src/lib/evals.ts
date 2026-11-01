import 'server-only';
import { all, one } from './db';
import { appUrl } from './auth';

export type EvalQuestion = { id: string; position: number; section: string; kind: 'RATING' | 'CHOICE' | 'TEXT'; text: string; options: string[]; required: boolean };
export type EvalAnswer = { qid: string; section: string; kind: EvalQuestion['kind']; text: string; value: number | string | null };

export const KIND_LABEL: Record<string, string> = { RATING: '1–5 оноо', CHOICE: 'Сонголт', TEXT: 'Сэтгэгдэл' };
export const RATING_LABELS = ['Маш муу', 'Муу', 'Дунд', 'Сайн', 'Маш сайн'];

export const DEFAULT_QUESTIONS: Omit<EvalQuestion, 'id' | 'position'>[] = [
  { section: 'Хичээлийн агуулга', kind: 'RATING', text: 'Хичээлийн агуулга ажилд тань хэр хэрэгтэй байсан бэ?', options: [], required: true },
  { section: 'Хичээлийн агуулга', kind: 'RATING', text: 'Материал ойлгомжтой, хангалттай байсан уу?', options: [], required: true },
  { section: 'Багшийн заах арга', kind: 'RATING', text: 'Багш сэдвээ хэр сайн тайлбарласан бэ?', options: [], required: true },
  { section: 'Багшийн заах арга', kind: 'RATING', text: 'Асуултад тодорхой, хангалттай хариулсан уу?', options: [], required: true },
  { section: 'Багшийн заах арга', kind: 'RATING', text: 'Дадлага, жишээ хангалттай байсан уу?', options: [], required: true },
  { section: 'Зохион байгуулалт', kind: 'CHOICE', text: 'Хичээлийн үргэлжлэх хугацаа', options: ['Хэт богино', 'Тохиромжтой', 'Хэт урт'], required: true },
  { section: 'Зохион байгуулалт', kind: 'RATING', text: 'Орчин, тоног төхөөрөмжийн бэлэн байдал', options: [], required: true },
  { section: 'Санал', kind: 'TEXT', text: 'Юуг сайжруулбал зохих вэ?', options: [], required: false },
];

export async function evalRunByToken(token: string) {
  return one<any>(`
    SELECT r.*, t.name, t.anonymous, t.intro, c.title AS course,
      (SELECT m.title FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=s.course_id AND m.module_key=s.module_key ORDER BY v.number DESC LIMIT 1) AS module,
      s.starts_at AS session_at
      FROM eval_runs r JOIN eval_templates t ON t.id=r.template_id
      LEFT JOIN courses c ON c.id=r.course_id LEFT JOIN sessions s ON s.id=r.session_id
     WHERE r.token=$1`, [token]);
}

export async function templateQuestions(templateId: string) {
  return all<EvalQuestion>('SELECT * FROM eval_questions WHERE template_id=$1 ORDER BY position', [templateId]);
}

export function evalUrl(token: string) {
  return appUrl(`/eval/${token}`);
}

// Тухайн хичээлд тохирох маягтуудыг эрэмбэлнэ: сургалт+төрөл > сургалт > төрөл > ерөнхий
export async function matchingTemplates(courseId: string | null, format: string | null) {
  const ts = await all<any>('SELECT id, name, format, course_id FROM eval_templates ORDER BY name');
  const score = (t: any) => (t.course_id && t.course_id !== courseId) || (t.format && t.format !== format) ? -1
    : (t.course_id ? 2 : 0) + (t.format ? 1 : 0);
  return ts.map(t => ({ ...t, score: score(t) })).filter(t => t.score >= 0).sort((a, b) => b.score - a.score);
}

export type QuestionStat = { qid: string; section: string; kind: string; text: string; n: number; avg: number | null; dist: number[]; choices: Record<string, number>; comments: { text: string; who: string | null }[] };

// Олон удаагийн хариултыг асуулт тус бүрээр нэгтгэнэ (асуултын текстээр нь — маягт засагдсан ч өмнөх үр дүн алдагдахгүй)
export async function summarize(runIds: string[], showNames: boolean) {
  const rows = await all<{ answers: EvalAnswer[]; name: string }>(`
    SELECT r.answers, u.name FROM eval_responses r JOIN users u ON u.id=r.user_id WHERE r.run_id = ANY($1) ORDER BY r.submitted_at`, [runIds]);
  const map = new Map<string, QuestionStat>();
  for (const row of rows) {
    for (const a of row.answers) {
      const key = `${a.section}|${a.kind}|${a.text}`;
      const st = map.get(key) ?? { qid: a.qid, section: a.section, kind: a.kind, text: a.text, n: 0, avg: null, dist: [0, 0, 0, 0, 0], choices: {}, comments: [] };
      if (a.value === null || a.value === '') { map.set(key, st); continue; }
      st.n++;
      if (a.kind === 'RATING') st.dist[Number(a.value) - 1]++;
      else if (a.kind === 'CHOICE') st.choices[String(a.value)] = (st.choices[String(a.value)] ?? 0) + 1;
      else st.comments.push({ text: String(a.value), who: showNames ? row.name : null });
      map.set(key, st);
    }
  }
  const stats = Array.from(map.values());
  for (const s of stats) if (s.kind === 'RATING' && s.n) s.avg = s.dist.reduce((a, c, i) => a + c * (i + 1), 0) / s.n;
  const sections = new Map<string, number[]>();
  for (const s of stats) if (s.avg !== null) sections.set(s.section, [...(sections.get(s.section) ?? []), s.avg]);
  const sectionAvg = Array.from(sections.entries()).map(([section, v]) => ({ section, avg: v.reduce((a, b) => a + b, 0) / v.length }));
  const all5 = stats.filter(s => s.avg !== null);
  const overall = all5.length ? all5.reduce((a, s) => a + s.avg! * s.n, 0) / all5.reduce((a, s) => a + s.n, 0) : null;
  return { responses: rows.length, stats, sectionAvg, overall };
}
