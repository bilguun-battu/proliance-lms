import 'server-only';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { all, one, run } from './db';
import { completeByAttendance, logActivity } from './progress';
import { appUrl } from './auth';

export type ExamRun = {
  id: string; exam_id: string; session_id: string | null; token: string; opened_at: string; closes_at: string; closed_at: string | null;
  title: string; course_id: string; module_key: string | null; duration_min: number; pass_score: number; shuffle: boolean; course: string;
};

export function newToken() {
  // Богино, утсаар бичихэд хялбар токен (төөрөгдүүлэх тэмдэгтгүй)
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(10), b => abc[b % abc.length]).join('');
}

export async function runByToken(token: string) {
  return one<ExamRun>(`
    SELECT r.*, e.title, e.course_id, e.module_key, e.duration_min, e.pass_score, e.shuffle, c.title AS course
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

// Хариулт шалгахад хэрэгтэй асуултууд (attempt-ийн дарааллаар)
export async function attemptQuestions(questionIds: string[]) {
  const qs = await all<{ id: string; text: string; options: string[]; correct_index: number }>(
    'SELECT id, text, options, correct_index FROM exam_questions WHERE id = ANY($1)', [questionIds]);
  return questionIds.map(id => qs.find(q => q.id === id)!).filter(Boolean);
}

export function shuffled<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Тухайн оролцогчийн эцсийн хугацаа: холбоос хаагдах хугацаа ба эхэлснээс хойших үргэлжлэх хугацааны аль бага нь
export function attemptDeadline(run: ExamRun, startedAt: string) {
  return Math.min(new Date(run.closes_at).getTime(), new Date(startedAt).getTime() + run.duration_min * 60000);
}

// Дүгнэх: тэнцвэл хичээлийн ирцийг баталж, модулийг дууссанд тооцно
export async function gradeAttempt(attemptId: string, answers: number[] | null) {
  const a = await one<any>(`SELECT a.*, r.session_id, e.pass_score, e.course_id, e.module_key, e.title
      FROM exam_attempts a JOIN exam_runs r ON r.id=a.run_id JOIN exams e ON e.id=r.exam_id WHERE a.id=$1`, [attemptId]);
  if (!a || a.submitted_at) return;
  const final = answers ?? a.answers ?? [];
  const qs = await attemptQuestions(a.question_ids);
  const correct = qs.filter((q, i) => final[i] === q.correct_index).length;
  const score = qs.length ? Math.round((correct / qs.length) * 100) : 0;
  const passed = score >= a.pass_score;
  await run('UPDATE exam_attempts SET answers=$1, score=$2, passed=$3, submitted_at=now() WHERE id=$4', [JSON.stringify(final), score, passed, attemptId]);
  await logActivity(a.user_id, a.course_id, a.module_key, 'EXAM', `${a.title}: ${score}%${passed ? ' (тэнцсэн)' : ''}`);
  if (passed && a.module_key) {
    if (a.session_id) {
      await run(`INSERT INTO session_attendees (session_id,user_id,status,marked_at) VALUES ($1,$2,'ATTENDED',now())
                 ON CONFLICT (session_id,user_id) DO UPDATE SET status='ATTENDED', marked_at=now()`, [a.session_id, a.user_id]);
    }
    await completeByAttendance(a.user_id, a.course_id, a.module_key);
  }
}

