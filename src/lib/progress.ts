import 'server-only';
import { all, one, run } from './db';
import { APPLIES_SQL, recurrenceFor } from './assign';

export type ModuleRow = {
  id: string; module_key: string; position: number; title: string; description: string;
  duration_min: number; video_file: string | null; pdf_file: string | null; pass_score: number;
  mver: number; added_in: number; change: 'NEW' | 'CHANGED' | 'SAME'; mandatory: boolean; qcount: number;
  format: 'ELEARN' | 'INPERSON' | 'ONLINE' | 'OJT' | 'VOC';
};
export type VersionRow = { id: string; course_id: string; number: number; status: string; notes: string; removed: string[]; published_at: string | null };
export type ModState = 'done' | 'todo' | 'retake' | 'newmod' | 'recommended';
export const REQUIRED: ModState[] = ['todo', 'retake', 'newmod'];

export const STATE_LABEL: Record<ModState, [string, string]> = {
  done: ['Дууссан', 'ok'],
  todo: ['Үзэх шаардлагатай', 'crit'],
  retake: ['Шинэчлэгдсэн · дахин үзэх', 'warn'],
  newmod: ['Шинэ модуль', 'info'],
  recommended: ['Шинэчлэгдсэн · зөвлөмж', 'neutral'],
};
export const COURSE_LABEL: Record<string, [string, string]> = {
  notstarted: ['Эхлээгүй', 'neutral'],
  progress: ['Явагдаж буй', 'info'],
  update: ['Шинэчлэлт шаардлагатай', 'warn'],
  done: ['Дууссан', 'ok'],
};

export async function publishedVersion(courseId: string) {
  return one<VersionRow>(`SELECT * FROM course_versions WHERE course_id=$1 AND status='PUBLISHED' ORDER BY number DESC LIMIT 1`, [courseId]);
}

export async function versionModules(versionId: string) {
  return all<ModuleRow>(
    `SELECT m.*, (SELECT count(*)::int FROM questions q WHERE q.module_id=m.id) AS qcount
       FROM modules m WHERE m.version_id=$1 ORDER BY m.position`, [versionId]);
}

// Хэрэглэгчид нээгдсэн, нийтлэгдсэн хувилбартай сургалтууд:
// харилцагч → худалдаж авсан бүтээгдэхүүнээр; Proliance ажилтан → дотоод сургалтууд; мөн заавал оноогдсон сургалт
export async function learnerCourseIds(userId: string) {
  const rows = await all<{ id: string }>(
    `SELECT DISTINCT c.id, c.title FROM courses c, users u LEFT JOIN orgs o ON o.id=u.org_id
      WHERE u.id=$1 AND EXISTS (SELECT 1 FROM course_versions v WHERE v.course_id=c.id AND v.status='PUBLISHED')
        AND (
          (c.audience='CUSTOMER' AND NOT coalesce(o.is_internal,false) AND EXISTS (SELECT 1 FROM course_products cp JOIN org_products op ON op.product_id=cp.product_id
                                        WHERE cp.course_id=c.id AND op.org_id=u.org_id))
          OR (c.audience='INTERNAL' AND o.is_internal)
          OR EXISTS (SELECT 1 FROM assignments a WHERE a.course_id=c.id AND ${APPLIES_SQL})
        )
      ORDER BY c.title`, [userId]);
  return rows.map(r => r.id);
}

export async function canAccessCourse(userId: string, courseId: string) {
  return (await learnerCourseIds(userId)).includes(courseId);
}

export type CourseProgress = {
  version: VersionRow; modules: (ModuleRow & { state: ModState; unlocked: boolean })[];
  key: 'notstarted' | 'progress' | 'update' | 'done'; done: number; total: number; left: number; started: boolean;
  lastActivity: string | null;
};

export async function courseProgress(userId: string, courseId: string): Promise<CourseProgress | null> {
  const version = await publishedVersion(courseId);
  if (!version) return null;
  const modules = await versionModules(version.id);
  // Давтан суух заавал хамрагдах сургалтад хугацаа нь өнгөрсөн гүйцэтгэлийг тооцохгүй
  const months = await recurrenceFor(userId, courseId);
  const comps = await all<{ module_key: string; mver: number; completed_at: string }>(
    `SELECT module_key, mver, completed_at FROM completions WHERE user_id=$1 AND course_id=$2
       AND ($3::int IS NULL OR completed_at > now() - ($3::int * interval '1 month'))`, [userId, courseId, months]);
  const versions = await all<{ number: number; published_at: string }>(
    `SELECT number, published_at FROM course_versions WHERE course_id=$1 AND status='PUBLISHED'`, [courseId]);
  const pubAt = new Map(versions.map(v => [v.number, new Date(v.published_at).getTime()]));
  const last = await one<{ at: string }>('SELECT max(at) AS at FROM activity_log WHERE user_id=$1 AND course_id=$2', [userId, courseId]);
  const sequential = (await one<{ sequential: boolean }>('SELECT sequential FROM courses WHERE id=$1', [courseId]))?.sequential ?? false;

  let blocked = false;
  const out = modules.map(m => {
    const mine = comps.filter(c => c.module_key === m.module_key);
    const best = mine.reduce<number>((a, c) => Math.max(a, c.mver), 0);
    let state: ModState;
    if (best >= m.mver) state = 'done';
    else if (best > 0) state = m.mandatory ? 'retake' : 'recommended';
    else if (m.added_in > 1 && comps.some(c => new Date(c.completed_at).getTime() < (pubAt.get(m.added_in) ?? 0))) state = 'newmod';
    else state = 'todo';
    const unlocked = !sequential || !blocked;
    if (REQUIRED.includes(state)) blocked = true;
    return { ...m, state, unlocked };
  });
  const done = out.filter(m => m.state === 'done').length;
  const left = out.filter(m => REQUIRED.includes(m.state)).length;
  const started = comps.length > 0;
  const key = !started ? 'notstarted' : left === 0 ? 'done' : out.some(m => m.state === 'retake' || m.state === 'newmod') ? 'update' : 'progress';
  return { version, modules: out, key, done, total: out.length, left, started, lastActivity: last?.at ?? null };
}

export async function logActivity(userId: string, courseId: string | null, moduleKey: string | null, action: string, detail?: string) {
  await run('INSERT INTO activity_log (user_id,course_id,module_key,action,detail) VALUES ($1,$2,$3,$4,$5)', [userId, courseId, moduleKey, action, detail ?? null]);
}

export const WATCH_THRESHOLD = 0.9;

// Модуль дуусгах нөхцөл: видео 90%+ үзсэн (байвал), тестэд тэнцсэн (байвал)
export async function requirementStatus(userId: string, courseId: string, m: ModuleRow) {
  const vp = m.video_file
    ? await one<{ watched_s: number; duration_s: number; position_s: number }>(
        'SELECT watched_s, duration_s, position_s FROM video_progress WHERE user_id=$1 AND course_id=$2 AND module_key=$3 AND mver=$4',
        [userId, courseId, m.module_key, m.mver])
    : undefined;
  const videoPct = vp && vp.duration_s > 0 ? Math.min(1, vp.watched_s / vp.duration_s) : 0;
  const videoOk = !m.video_file || videoPct >= WATCH_THRESHOLD;
  const best = m.qcount
    ? await one<{ score: number }>(
        'SELECT max(score)::int AS score FROM quiz_attempts WHERE user_id=$1 AND course_id=$2 AND module_key=$3 AND mver=$4 AND passed',
        [userId, courseId, m.module_key, m.mver])
    : undefined;
  const quizOk = !m.qcount || (best?.score ?? null) !== null;
  return { videoPct, videoOk, quizOk, quizScore: best?.score ?? null, position: vp?.position_s ?? 0, manual: !m.video_file && !m.qcount };
}

export async function tryComplete(userId: string, courseId: string, m: ModuleRow, manual = false) {
  if (m.format !== 'ELEARN') return false; // биечлэн/онлайн хичээл зөвхөн ирцээр дуусна
  const r = await requirementStatus(userId, courseId, m);
  if (r.manual && !manual) return false;
  if (!r.videoOk || !r.quizOk) return false;
  if (await recordCompletion(userId, courseId, m.module_key, m.mver, r.quizScore)) await logActivity(userId, courseId, m.module_key, 'COMPLETE', m.title);
  return true;
}

export const FORMAT_LABEL: Record<string, string> = { ELEARN: 'Цахим', INPERSON: 'Танхим', ONLINE: 'Онлайн шууд', OJT: 'Ажлын байран дээр (OJT)', VOC: 'Ур чадварын баталгаажуулалт (VoC)' };
export const CATEGORY_LABEL: Record<string, string> = {
  ELEARN: 'Цахим сургалт', ONLINE: 'Онлайн шууд сургалт', INPERSON: 'Танхимын сургалт', BLENDED: 'Хосолсон сургалт',
  OJT: 'On the Job (OJT)', VOC: 'Verification of Competency (VoC)', TTT: 'Train the Trainer (TtT)',
};
export const CAT_TONE: Record<string, string> = { ELEARN: 'elearn', ONLINE: 'online', INPERSON: 'inperson', BLENDED: 'neutral', OJT: 'ojt', VOC: 'voc', TTT: 'ttt' };
export const CATEGORIES = Object.keys(CATEGORY_LABEL);
// Сургалтын төрөл бүрт ямар хэлбэрийн модуль нэмж болох вэ
export const CATEGORY_FORMATS: Record<string, string[]> = {
  ELEARN: ['ELEARN'], ONLINE: ['ONLINE'], INPERSON: ['INPERSON'], BLENDED: ['ELEARN', 'INPERSON', 'ONLINE'],
  OJT: ['OJT', 'ELEARN'], VOC: ['VOC', 'ELEARN'], TTT: ['ELEARN', 'INPERSON', 'ONLINE'],
};
export const AUDIENCE_LABEL: Record<string, string> = { CUSTOMER: 'Харилцагчийн сургалт', INTERNAL: 'Дотоод сургалт' };

// Ирц батлагдахад модулийг одоогийн хувилбараар нь дууссанд тооцно
export async function completeByAttendance(userId: string, courseId: string, moduleKey: string) {
  const v = await publishedVersion(courseId);
  const m = v && (await versionModules(v.id)).find(x => x.module_key === moduleKey);
  if (!m) return false;
  if (await recordCompletion(userId, courseId, moduleKey, m.mver, null)) await logActivity(userId, courseId, moduleKey, 'ATTEND', m.title);
  return true;
}

// Гүйцэтгэл бүртгэх. Хүчинтэй гүйцэтгэл байвал юу ч хийхгүй; давтан суух сургалтын хугацаа
// нь дууссан гүйцэтгэлийг шинэ огноогоор сэргээнэ. Шинээр бичсэн бол true.
export async function recordCompletion(userId: string, courseId: string, moduleKey: string, mver: number, score: number | null) {
  const months = await recurrenceFor(userId, courseId);
  const valid = await one(`SELECT 1 FROM completions WHERE user_id=$1 AND course_id=$2 AND module_key=$3 AND mver >= $4
     AND ($5::int IS NULL OR completed_at > now() - ($5::int * interval '1 month'))`, [userId, courseId, moduleKey, mver, months]);
  if (valid) return false;
  await run(`INSERT INTO completions (user_id,course_id,module_key,mver,score) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id,course_id,module_key,mver) DO UPDATE SET completed_at=now(), score=coalesce(EXCLUDED.score, completions.score)`,
    [userId, courseId, moduleKey, mver, score]);
  await grantTrainerIfDone(userId, courseId);
  const { issueCertificateIfDone } = await import('./certs');
  await issueCertificateIfDone(userId, courseId);
  return true;
}

// Train the Trainer сургалтыг бүрэн дуусгахад холбосон сургалтуудыг заах/үнэлэх эрх олгоно
async function grantTrainerIfDone(userId: string, courseId: string) {
  const c = await one<{ category: string }>('SELECT category FROM courses WHERE id=$1', [courseId]);
  if (c?.category !== 'TTT') return;
  const p = await courseProgress(userId, courseId);
  if (!p || p.left > 0 || p.done < p.total) return;
  const targets = await all<{ target_course_id: string; title: string }>(
    'SELECT t.target_course_id, c.title FROM course_trainer_targets t JOIN courses c ON c.id=t.target_course_id WHERE t.course_id=$1', [courseId]);
  for (const t of targets) {
    const r = await run(`INSERT INTO trainer_quals (user_id,course_id,source) VALUES ($1,$2,'TTT') ON CONFLICT DO NOTHING`, [userId, t.target_course_id]);
    if (r.rowCount) await logActivity(userId, t.target_course_id, null, 'TRAINER', t.title);
  }
}

// Тухайн сургалтыг заах, OJT/VoC үнэлэх эрхтэй эсэх
export async function canAssess(userId: string, role: string, courseId: string) {
  if (role === 'ADMIN') return true;
  return !!(await one('SELECT 1 FROM trainer_quals WHERE user_id=$1 AND course_id=$2', [userId, courseId]));
}
