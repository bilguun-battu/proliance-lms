import 'server-only';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { all, one, run } from './db';
import { completeByAttendance, logActivity } from './progress';
import { appUrl } from './auth';

export type ExamRun = {
  id: string; exam_id: string; session_id: string | null; token: string; opened_at: string; closes_at: string; closed_at: string | null;
  title: string; course_id: string; module_key: string | null; duration_min: number; pass_score: number; shuffle: boolean; course: string;
  check_mode: 'AUTO' | 'MANUAL'; show_result: 'NOW' | 'LATER'; attempts_allowed: number; description: string; file_id: string | null;
};

export type QType = 'RADIO' | 'CHECKBOX' | 'SELECT' | 'TEXT' | 'TEXTAREA' | 'YESNO';
export const QTYPES: QType[] = ['RADIO', 'CHECKBOX', 'SELECT', 'TEXT', 'TEXTAREA', 'YESNO'];
export const QTYPE_LABEL: Record<QType, string> = {
  RADIO: 'Нэг сонголт', CHECKBOX: 'Олон сонголт', SELECT: 'Жагсаалтаас сонгох',
  TEXT: 'Богино бичвэр', TEXTAREA: 'Урт бичвэр', YESNO: 'Тийм / Үгүй / Тайлбар',
};
// Систем өөрөө дүгнэх боломжтой төрөл. Бичвэр хариултыг багш шалгана.
export const AUTO_TYPES: QType[] = ['RADIO', 'CHECKBOX', 'SELECT', 'YESNO'];
export const YESNO_OPTIONS = ['Тийм', 'Үгүй'];

export type ExamQ = {
  id: string; section_id: string | null; text: string; qtype: QType; options: string[]; correct: number[]; points: number; image_file: string | null;
};
export type Answer = number | number[] | string | { c: number; t: string } | null;

export function newToken() {
  // Богино, утсаар бичихэд хялбар токен (төөрөгдүүлэх тэмдэгтгүй)
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(10), b => abc[b % abc.length]).join('');
}

export async function runByToken(token: string) {
  return one<ExamRun>(`
    SELECT r.*, e.title, e.course_id, e.module_key, e.duration_min, e.pass_score, e.shuffle, e.check_mode, e.show_result,
           e.attempts_allowed, e.description, e.file_id, c.title AS course
      FROM exam_runs r JOIN exams e ON e.id=r.exam_id JOIN courses c ON c.id=e.course_id WHERE r.token=$1`, [token]);
}

export function runIsOpen(r: { closes_at: string; closed_at: string | null }) {
  return !r.closed_at && new Date(r.closes_at).getTime() > Date.now();
}

export function examUrl(token: string) {
  return appUrl(`/exam/${token}`);
}

export async function qrSvg(text: string) {
  return QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1e2843', light: '#ffffff' } });
}

function normQ(q: any): ExamQ {
  const options = q.qtype === 'YESNO' ? YESNO_OPTIONS : (q.options ?? []);
  const correct = Array.isArray(q.correct) ? q.correct : q.correct_index != null ? [q.correct_index] : [];
  return { id: q.id, section_id: q.section_id, text: q.text, qtype: q.qtype ?? 'RADIO', options, correct, points: q.points ?? 1, image_file: q.image_file ?? null };
}

export async function examQuestions(examId: string) {
  const rows = await all<any>(`SELECT q.*, s.position AS spos FROM exam_questions q JOIN exam_sections s ON s.id=q.section_id
     WHERE s.exam_id=$1 ORDER BY s.position, q.position`, [examId]);
  return rows.map(r => ({ ...normQ(r), spos: r.spos as number }));
}

export async function examSections(examId: string) {
  return all<{ id: string; position: number; draw_count: number; description: string; n: number }>(`
    SELECT s.*, (SELECT count(*)::int FROM exam_questions q WHERE q.section_id=s.id) AS n
      FROM exam_sections s WHERE s.exam_id=$1 ORDER BY s.position`, [examId]);
}

// Нэг оролцогчид харагдах асуултын тоо
export function shownCount(sections: { draw_count: number; n: number }[]) {
  return sections.reduce((t, s) => t + (s.draw_count > 0 ? Math.min(s.draw_count, s.n) : s.n), 0);
}

// Хариулт шалгахад хэрэгтэй асуултууд (attempt-ийн дарааллаар)
export async function attemptQuestions(questionIds: string[]) {
  const qs = (await all<any>('SELECT * FROM exam_questions WHERE id = ANY($1)', [questionIds])).map(normQ);
  return questionIds.map(id => qs.find(q => q.id === id)!).filter(Boolean);
}

// Давтагдах санамсаргүй тоо (хэвлэх хувилбар ба түлхүүр адилхан гарахын тулд)
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(arr: T[], rnd: () => number = () => crypto.randomInt(1 << 30) / (1 << 30)) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Бүлэг бүрээс тохируулсан тооны асуултыг санамсаргүй сонгоно. Бүлгүүд дарааллаараа, бүлэг дотор холилдоно.
export async function drawQuestions(examId: string, shuffle: boolean, rnd?: () => number) {
  const qs = await examQuestions(examId);
  const sections = await examSections(examId);
  const out: typeof qs = [];
  for (const s of sections) {
    const pool = qs.filter(q => q.section_id === s.id);
    const take = s.draw_count > 0 ? Math.min(s.draw_count, pool.length) : pool.length;
    const picked = take < pool.length ? shuffled(pool, rnd).slice(0, take) : pool;
    out.push(...(shuffle ? shuffled(picked, rnd) : pool.filter(q => picked.includes(q))));
  }
  return out;
}

export function isAnswered(q: ExamQ, a: Answer) {
  if (a == null) return false;
  if (q.qtype === 'CHECKBOX') return Array.isArray(a) && a.length > 0;
  if (q.qtype === 'TEXT' || q.qtype === 'TEXTAREA') return typeof a === 'string' && a.trim() !== '';
  if (q.qtype === 'YESNO') return typeof a === 'object' && !Array.isArray(a) ? a.c >= 0 : typeof a === 'number' && a >= 0;
  return typeof a === 'number' && a >= 0;
}

// Автоматаар дүгнэх: зөв бол тухайн асуултын оноо, буруу бол 0. Бичвэр хариулт null (багш шалгана).
export function autoMark(q: ExamQ, a: Answer): number | null {
  if (!AUTO_TYPES.includes(q.qtype)) return null;
  if (q.qtype === 'CHECKBOX') {
    const got = Array.isArray(a) ? [...new Set(a)].sort() : [];
    const want = [...q.correct].sort();
    return got.length === want.length && got.every((x, i) => x === want[i]) ? q.points : 0;
  }
  const pick = q.qtype === 'YESNO' && a && typeof a === 'object' && !Array.isArray(a) ? a.c : a;
  return typeof pick === 'number' && q.correct.includes(pick) ? q.points : 0;
}

export function answerText(q: ExamQ, a: Answer) {
  if (!isAnswered(q, a)) return '—';
  if (q.qtype === 'TEXT' || q.qtype === 'TEXTAREA') return String(a);
  if (q.qtype === 'CHECKBOX') return (a as number[]).map(i => q.options[i]).join('; ');
  if (q.qtype === 'YESNO' && typeof a === 'object' && !Array.isArray(a)) return `${q.options[a!.c] ?? ''}${a!.t ? ` — ${a!.t}` : ''}`;
  return q.options[a as number] ?? '—';
}

// Тухайн оролцогчийн эцсийн хугацаа: холбоос хаагдах хугацаа ба эхэлснээс хойших хугацааны аль бага нь (0 = хязгааргүй)
export function attemptDeadline(run: Pick<ExamRun, 'closes_at' | 'duration_min'>, startedAt: string) {
  const close = new Date(run.closes_at).getTime();
  return run.duration_min > 0 ? Math.min(close, new Date(startedAt).getTime() + run.duration_min * 60000) : close;
}

// Хариулт илгээх: авто асуултыг дүгнэж, бичвэр эсвэл гараар шалгах бол багшид шилжүүлнэ
export async function gradeAttempt(attemptId: string, answers: Answer[] | null) {
  const a = await one<any>(`SELECT a.*, e.check_mode FROM exam_attempts a JOIN exam_runs r ON r.id=a.run_id JOIN exams e ON e.id=r.exam_id WHERE a.id=$1`, [attemptId]);
  if (!a || a.submitted_at) return;
  const final: Answer[] = answers ?? a.answers ?? [];
  const qs = await attemptQuestions(a.question_ids);
  const marks = qs.map((q, i) => (a.check_mode === 'MANUAL' ? null : autoMark(q, final[i] ?? null)));
  const max = qs.reduce((t, q) => t + q.points, 0);
  const pts = marks.reduce<number>((t, m) => t + (m ?? 0), 0);
  const pending = a.check_mode === 'MANUAL' || !qs.length || marks.some(m => m === null);
  await run(`UPDATE exam_attempts SET answers=$1, marks=$2, points=$3, max_points=$4, submitted_at=now(), review_status=$5 WHERE id=$6`,
    [JSON.stringify(final), JSON.stringify(marks), pts, max, pending ? 'PENDING' : 'NONE', attemptId]);
  if (!pending) await finalizeAttempt(attemptId);
}

// Эцсийн дүн: онооны шатлал байвал түүгээр, үгүй бол тэнцэх хувиар. override нь багшийн шийдвэр.
export async function finalizeAttempt(attemptId: string, override?: { passed: boolean; label?: string }) {
  const a = await one<any>(`SELECT a.*, r.session_id, e.id AS exam_id, e.pass_score, e.course_id, e.module_key, e.title
      FROM exam_attempts a JOIN exam_runs r ON r.id=a.run_id JOIN exams e ON e.id=r.exam_id WHERE a.id=$1`, [attemptId]);
  if (!a) return;
  const pts = Number(a.points ?? 0), max = Number(a.max_points ?? 0);
  const score = max > 0 ? Math.round((pts / max) * 100) : override?.passed ? 100 : 0;
  let passed: boolean, label: string;
  if (override) {
    passed = override.passed;
    label = override.label || (passed ? 'Тэнцсэн' : 'Тэнцээгүй');
  } else {
    const band = await one<any>('SELECT * FROM exam_bands WHERE exam_id=$1 AND $2 BETWEEN min_points AND max_points ORDER BY min_points DESC LIMIT 1', [a.exam_id, pts]);
    passed = band ? band.passed : score >= a.pass_score;
    label = band ? band.label : passed ? 'Тэнцсэн' : 'Тэнцээгүй';
  }
  await run('UPDATE exam_attempts SET score=$1, passed=$2, result_label=$3 WHERE id=$4', [score, passed, label, attemptId]);
  await logActivity(a.user_id, a.course_id, a.module_key, 'EXAM', `${a.title}: ${max > 0 ? `${pts}/${max} оноо, ` : ''}${label}`);
  if (passed && a.module_key) {
    if (a.session_id) {
      await run(`INSERT INTO session_attendees (session_id,user_id,status,marked_at) VALUES ($1,$2,'ATTENDED',now())
                 ON CONFLICT (session_id,user_id) DO UPDATE SET status='ATTENDED', marked_at=now()`, [a.session_id, a.user_id]);
    }
    await completeByAttendance(a.user_id, a.course_id, a.module_key);
  }
}

// Дүнг оролцогчид харуулах эсэх: багш шалгаж дуусаад, "Дараа" тохиргоотой бол холбоос хаагдсаны дараа
export function resultVisible(r: Pick<ExamRun, 'show_result' | 'closes_at' | 'closed_at'>, a: { review_status: string; passed: boolean | null }) {
  if (a.review_status === 'PENDING' || a.passed === null) return false;
  return r.show_result === 'NOW' || !runIsOpen(r);
}

export async function latestAttempt(runId: string, userId: string) {
  return one<any>('SELECT * FROM exam_attempts WHERE run_id=$1 AND user_id=$2 ORDER BY attempt_no DESC LIMIT 1', [runId, userId]);
}
