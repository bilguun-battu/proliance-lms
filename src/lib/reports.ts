import 'server-only';
import { all } from './db';
import { ACCESS_SQL, APPLIES_SQL } from './assign';
import { complianceRows, COMPLIANT_SET } from './compliance';
import { CATEGORY_LABEL } from './progress';
import { courseProgress, COURSE_LABEL } from './progress';

export type ReportFilter = { course?: string; org?: string; from?: string; to?: string; aud?: string; kind?: string };
const audDb = (a?: string) => (a === 'internal' ? 'INTERNAL' : a === 'customer' ? 'CUSTOMER' : null);

export async function progressRows(f: ReportFilter) {
  const pairs = await all<any>(`
    SELECT u.id AS uid, u.name, u.email, u.position, u.department, o.id AS oid, o.name AS org, c.id AS cid, c.title, c.category,
           EXISTS (SELECT 1 FROM assignments a WHERE a.course_id=c.id AND ${APPLIES_SQL}) AS mandatory
      FROM (${ACCESS_SQL}) acc JOIN users u ON u.id=acc.uid LEFT JOIN orgs o ON o.id=u.org_id JOIN courses c ON c.id=acc.cid
     WHERE ($1::uuid IS NULL OR c.id=$1) AND ($2::uuid IS NULL OR o.id=$2) AND ($3::text IS NULL OR c.audience=$3)
     ORDER BY o.name, u.name, c.title`, [f.course || null, f.org || null, audDb(f.aud)]);
  const filtered = f.kind === 'mand' ? pairs.filter(p => p.mandatory) : f.kind === 'other' ? pairs.filter(p => !p.mandatory) : pairs;
  const scores = await all<any>(`SELECT user_id, course_id, round(avg(score))::int AS avg FROM completions WHERE score IS NOT NULL GROUP BY 1,2`);
  const out = [];
  for (const p of filtered) {
    const pr = await courseProgress(p.uid, p.cid);
    if (!pr) continue;
    out.push({
      ...p, kindLabel: p.mandatory ? 'Заавал хамрагдах' : 'Сонгон', categoryLabel: CATEGORY_LABEL[p.category] ?? p.category, version: pr.version.number, status: COURSE_LABEL[pr.key][0], statusKey: pr.key,
      done: pr.done, total: pr.total, left: pr.left, last: pr.lastActivity,
      avg: scores.find(s => s.user_id === p.uid && s.course_id === p.cid)?.avg ?? null,
    });
  }
  return out;
}

export async function activityRows(f: ReportFilter, limit = 500) {
  return all<any>(`
    SELECT a.at, a.action, a.detail, u.name, u.email, o.name AS org, c.title AS course
      FROM activity_log a JOIN users u ON u.id=a.user_id LEFT JOIN orgs o ON o.id=u.org_id LEFT JOIN courses c ON c.id=a.course_id
     WHERE u.role <> 'ADMIN'
       AND ($1::uuid IS NULL OR a.course_id=$1) AND ($2::uuid IS NULL OR u.org_id=$2)
       AND ($6::text IS NULL OR coalesce(o.is_internal,false) = ($6='INTERNAL'))
       AND ($3::date IS NULL OR a.at >= $3::date) AND ($4::date IS NULL OR a.at < $4::date + 1)
     ORDER BY a.at DESC LIMIT $5`, [f.course || null, f.org || null, f.from || null, f.to || null, limit, audDb(f.aud)]);
}

// Хүн бүрээр: заавал хамрагдах сургалтын биелэлт ба нийт дуусгасан сургалт
export async function personRows(f: ReportFilter) {
  const people = await all<any>(`
    SELECT u.id, u.name, u.email, u.position, u.department, o.name AS org,
      (SELECT count(DISTINCT ce.course_id)::int FROM certificates ce JOIN courses c ON c.id=ce.course_id WHERE ce.user_id=u.id AND NOT ce.revoked AND ($3::text IS NULL OR c.audience=$3)) AS completed,
      (SELECT count(*)::int FROM certificates ce JOIN courses c ON c.id=ce.course_id WHERE ce.user_id=u.id AND ($3::text IS NULL OR c.audience=$3)) AS certs
      FROM users u LEFT JOIN orgs o ON o.id=u.org_id
     WHERE u.active AND u.role <> 'ADMIN' AND ($1::uuid IS NULL OR u.org_id=$1)
       AND ($3::text IS NULL OR coalesce(o.is_internal,false) = ($3='INTERNAL'))
       AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM (${ACCESS_SQL}) acc WHERE acc.uid=u.id AND acc.cid=$2))
     ORDER BY o.name, u.name`, [f.org || null, f.course || null, audDb(f.aud)]);
  const comp = await complianceRows({ org: f.org, course: f.course, audience: (audDb(f.aud) ?? undefined) as any });
  const optional = await all<any>(`
    SELECT ce.user_id, count(DISTINCT ce.course_id)::int AS n FROM certificates ce JOIN courses c ON c.id=ce.course_id
     WHERE NOT ce.revoked AND NOT ce.mandatory AND ($1::text IS NULL OR c.audience=$1)
     GROUP BY 1`, [audDb(f.aud)]);
  return people.map(p => {
    const mine = comp.filter(r => r.user_id === p.id);
    return {
      ...p, mandTotal: mine.length, mandOk: mine.filter(r => COMPLIANT_SET.includes(r.status)).length,
      mandLate: mine.filter(r => r.status === 'OVERDUE' || r.status === 'EXPIRED').length,
      optional: optional.find(o => o.user_id === p.id)?.n ?? 0,
    };
  });
}

export async function certificateRows(f: ReportFilter, limit = 100) {
  return all<any>(`
    SELECT ce.* FROM certificates ce JOIN courses c ON c.id=ce.course_id JOIN users u ON u.id=ce.user_id LEFT JOIN orgs o ON o.id=u.org_id
     WHERE ($1::uuid IS NULL OR ce.course_id=$1) AND ($2::uuid IS NULL OR u.org_id=$2) AND ($3::text IS NULL OR c.audience=$3)
       AND ($4::date IS NULL OR ce.issued_at >= $4::date) AND ($5::date IS NULL OR ce.issued_at < $5::date + 1)
     ORDER BY ce.issued_at DESC LIMIT $6`, [f.course || null, f.org || null, audDb(f.aud), f.from || null, f.to || null, limit]);
}
