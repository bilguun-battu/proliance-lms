import 'server-only';
import { all } from './db';
import { APPLIES_SQL } from './assign';
import { courseProgress } from './progress';

export type CompStatus = 'COMPLIANT' | 'EXPIRING' | 'DUE_SOON' | 'ASSIGNED' | 'OVERDUE' | 'EXPIRED';
export const COMP_LABEL: Record<CompStatus, [string, string]> = {
  COMPLIANT: ['Хүчинтэй', 'ok'],
  EXPIRING: ['Удахгүй дуусна', 'warn'],
  ASSIGNED: ['Оноогдсон', 'info'],
  DUE_SOON: ['Хугацаа дөхсөн', 'warn'],
  OVERDUE: ['Хугацаа хэтэрсэн', 'crit'],
  EXPIRED: ['Хүчингүй болсон', 'crit'],
};
export const COMPLIANT_SET: CompStatus[] = ['COMPLIANT', 'EXPIRING'];
const DAY = 864e5;
const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

export type CompRow = {
  user_id: string; name: string; email: string; department: string | null; position: string | null; org: string | null; internal: boolean;
  course_id: string; course: string; status: CompStatus; due: Date | null; completedAt: Date | null; validUntil: Date | null;
  recurrence: number | null; done: number; total: number;
};

export type CompFilter = { course?: string; org?: string; department?: string; user?: string; audience?: 'CUSTOMER' | 'INTERNAL' };

// Заавал хамрагдах сургалтын төлөвийг хэрэглэгч × сургалт бүрээр тооцно
export async function complianceRows(f: CompFilter = {}): Promise<CompRow[]> {
  const pairs = await all<any>(`
    SELECT u.id AS user_id, u.name, u.email, u.department, u.position, u.created_at AS user_created, u.position_since, o.name AS org, coalesce(o.is_internal,false) AS internal,
           c.id AS course_id, c.title AS course, c.due_days AS course_due_days,
           a.target, a.due_days, a.due_date::text AS due_date, a.recurrence_months, a.created_at AS assigned_at
      FROM assignments a JOIN courses c ON c.id=a.course_id
      JOIN users u ON u.active AND u.role <> 'ADMIN' LEFT JOIN orgs o ON o.id=u.org_id
     WHERE ${APPLIES_SQL}
       AND EXISTS (SELECT 1 FROM course_versions v WHERE v.course_id=c.id AND v.status='PUBLISHED')
       AND ($1::uuid IS NULL OR c.id=$1) AND ($2::uuid IS NULL OR u.org_id=$2) AND ($3::text IS NULL OR u.department=$3) AND ($4::uuid IS NULL OR u.id=$4) AND ($5::text IS NULL OR c.audience=$5)`,
    [f.course || null, f.org || null, f.department || null, f.user || null, f.audience || null]);

  // Нэг хүнд нэг сургалт хэд хэдэн дүрмээр оноогдвол хамгийн хатуу нөхцөлийг авна
  const merged = new Map<string, any>();
  for (const p of pairs) {
    // Албан тушаал/хэлтсээр оноогдсон бол тухайн албан тушаалд орсон өдрөөс тоолно
    const since = (p.target === 'POSITION' || p.target === 'DEPARTMENT') && p.position_since ? new Date(p.position_since).getTime() : 0;
    const base = new Date(Math.max(new Date(p.assigned_at).getTime(), new Date(p.user_created).getTime(), since));
    const due = p.due_date ? new Date(`${p.due_date}T23:59:59+08:00`) : new Date(base.getTime() + p.due_days * DAY);
    const key = `${p.user_id}|${p.course_id}`;
    const m = merged.get(key);
    if (!m) merged.set(key, { ...p, due, recurrence: p.recurrence_months });
    else {
      if (due < m.due) m.due = due;
      if (p.recurrence_months && (!m.recurrence || p.recurrence_months < m.recurrence)) m.recurrence = p.recurrence_months;
    }
  }

  const now = Date.now();
  const out: CompRow[] = [];
  for (const m of merged.values()) {
    const prog = await courseProgress(m.user_id, m.course_id);
    if (!prog) continue;
    const keys = prog.modules.map(x => x.module_key);
    const comps = await all<{ module_key: string; mver: number; completed_at: string }>(
      'SELECT module_key, mver, completed_at FROM completions WHERE user_id=$1 AND course_id=$2', [m.user_id, m.course_id]);
    // Модуль бүрийн одоогийн хувилбарын хамгийн сүүлийн гүйцэтгэл
    const lastPerModule = prog.modules.map(md => {
      const c = comps.filter(x => x.module_key === md.module_key && x.mver >= md.mver).map(x => new Date(x.completed_at).getTime());
      return c.length ? Math.max(...c) : null;
    });
    const allDone = keys.length > 0 && lastPerModule.every(x => x !== null);
    const completedAt = allDone ? new Date(Math.max(...(lastPerModule as number[]))) : null;
    const earliest = allDone ? new Date(Math.min(...(lastPerModule as number[]))) : null;
    const validUntil = earliest && m.recurrence ? addMonths(earliest, m.recurrence) : null;
    let status: CompStatus;
    let due: Date | null = m.due;
    if (allDone && (!validUntil || validUntil.getTime() > now)) {
      status = validUntil && validUntil.getTime() - now < 30 * DAY ? 'EXPIRING' : 'COMPLIANT';
      due = validUntil;
    } else if (allDone && validUntil) {
      status = 'EXPIRED'; due = validUntil;
    } else {
      // Өмнө нь бүрэн дуусгаж байсан боловч шинэ хувилбар гарсан бол хувилбарын хугацаагаар
      if (prog.key === 'update') {
        const pub = new Date(prog.version.published_at!).getTime() + m.course_due_days * DAY;
        if (due && pub > due.getTime()) due = new Date(pub);
      }
      status = due && due.getTime() < now ? 'OVERDUE' : due && due.getTime() - now < 14 * DAY ? 'DUE_SOON' : 'ASSIGNED';
    }
    out.push({
      user_id: m.user_id, name: m.name, email: m.email, department: m.department, position: m.position, org: m.org, internal: m.internal,
      course_id: m.course_id, course: m.course, status, due, completedAt, validUntil, recurrence: m.recurrence, done: prog.done, total: prog.total,
    });
  }
  const order: CompStatus[] = ['OVERDUE', 'EXPIRED', 'DUE_SOON', 'EXPIRING', 'ASSIGNED', 'COMPLIANT'];
  return out.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0));
}

export function rate(rows: CompRow[]) {
  return rows.length ? rows.filter(r => COMPLIANT_SET.includes(r.status)).length / rows.length : null;
}

export function groupBy<T extends string>(rows: CompRow[], key: (r: CompRow) => T) {
  const m = new Map<T, CompRow[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return Array.from(m.entries()).map(([k, rs]) => ({
    key: k, total: rs.length, rate: rate(rs)!,
    compliant: rs.filter(r => COMPLIANT_SET.includes(r.status)).length,
    overdue: rs.filter(r => r.status === 'OVERDUE' || r.status === 'EXPIRED').length,
    soon: rs.filter(r => r.status === 'DUE_SOON' || r.status === 'EXPIRING').length,
  })).sort((a, b) => a.rate - b.rate);
}
