import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { Chip } from '@/components/ui';
import { fmtSession, fmtDate, fmtDuration } from '@/lib/format';
import { FORMAT_LABEL } from '@/lib/progress';
import { offCode, ENR_LABEL, ATT_LABEL, type EnrStatus } from '@/lib/offerings';

// Миний хуваарь: бүртгэлтэй хуваарьт сургалт, хүлээлгийн жагсаалт, ирэх хичээлүүд, заах хичээлүүд, түүх
export default async function MySchedule() {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const enr = await all<any>(`
    SELECT e.*, o.num, o.location, o.link, o.course_id, o.status AS ostatus, c.title AS course,
      (SELECT min(s.starts_at) FROM sessions s WHERE s.offering_id=o.id) AS first_at,
      (SELECT max(s.starts_at) FROM sessions s WHERE s.offering_id=o.id) AS last_at,
      (SELECT count(*)::int FROM offering_enrollments w WHERE w.offering_id=o.id AND w.status='WAITLISTED' AND w.waitlisted_at <= e.waitlisted_at) AS pos
      FROM offering_enrollments e JOIN offerings o ON o.id=e.offering_id JOIN courses c ON c.id=o.course_id
     WHERE e.user_id=$1 ORDER BY first_at DESC NULLS LAST LIMIT 100`, [u.id]);
  const sess = await all<any>(`
    SELECT s.*, a.status AS my, c.title AS course,
      (SELECT m.title FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=s.course_id AND m.module_key=s.module_key ORDER BY v.number DESC LIMIT 1) AS module,
      (SELECT m.format FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=s.course_id AND m.module_key=s.module_key ORDER BY v.number DESC LIMIT 1) AS format
      FROM session_attendees a JOIN sessions s ON s.id=a.session_id JOIN courses c ON c.id=s.course_id
     WHERE a.user_id=$1 AND s.status='SCHEDULED' AND s.starts_at > now() - interval '3 hours' ORDER BY s.starts_at`, [u.id]);
  const teach = await all<any>(`
    SELECT s.*, c.title AS course, o.num,
      (SELECT m.title FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=s.course_id AND m.module_key=s.module_key ORDER BY v.number DESC LIMIT 1) AS module,
      (SELECT count(*)::int FROM session_attendees a WHERE a.session_id=s.id) AS n
      FROM sessions s JOIN offerings o ON o.id=s.offering_id JOIN courses c ON c.id=o.course_id
     WHERE s.status='SCHEDULED' AND o.status='SCHEDULED' AND coalesce(s.instructor_id, o.instructor_id)=$1 AND s.starts_at > now() - interval '3 hours'
     ORDER BY s.starts_at LIMIT 30`, [u.id]);
  const now = Date.now();
  const active = enr.filter(e => ['ENROLLED', 'WAITLISTED'].includes(e.status) && e.ostatus === 'SCHEDULED');
  const history = enr.filter(e => !active.includes(e));
  return (
    <>
      <div className="hello"><h1>Миний хуваарь</h1><p className="muted">Танхимын болон онлайн шууд сургалтын бүртгэл, ирэх хичээлүүд</p></div>

      {teach.length > 0 && <section className="stack">
        <div className="head"><h2>Миний заах хичээл</h2><Link className="link small" href="/portal/teach">Заах хуваарь →</Link></div>
        <div className="list">{teach.map(s => (
          <Link key={s.id} className="row req" style={{ ['--c' as any]: 'var(--green)' }} href={`/portal/teach/${s.offering_id}#s-${s.id}`}>
            <div><strong className="num">{fmtSession(s.starts_at)}</strong> <span className="muted small">· {fmtDuration(s.duration_min)}</span>
              <div><strong>{s.module}</strong> <span className="muted small">· {s.course}</span></div>
              <div className="meta"><span className="num">{offCode(s.num)}</span><span>{s.location}</span></div></div>
            <div className="acts"><Chip label="Заах" tone="ok" /><Chip label={`${s.n} оролцогч`} tone="info" /></div>
          </Link>))}</div>
      </section>}

      <section className="stack">
        <h2>Ирэх хичээл</h2>
        <div className="list">{sess.length ? sess.map(s => (
          <div key={s.id} className="row">
            <div><strong className="num">{fmtSession(s.starts_at)}</strong> <span className="muted small">· {fmtDuration(s.duration_min)}</span>
              <div><Link className="link" href={`/portal/courses/${s.course_id}/m/${s.module_key}`}>{s.module}</Link> <span className="muted small">· {s.course}</span></div>
              <div className="meta"><span className="fmt">{FORMAT_LABEL[s.format]}</span><span>{s.location}</span>
                {s.link && new Date(s.starts_at).getTime() > now - 3 * 3600e3 && <a className="link" href={s.link} target="_blank" rel="noreferrer">Онлайн хичээлд нэгдэх</a>}</div></div>
            <div className="acts"><Chip label={ATT_LABEL[s.my]?.[0] === 'Оруулаагүй' ? 'Бүртгэгдсэн' : ATT_LABEL[s.my][0]} tone={s.my === 'REGISTERED' ? 'info' : ATT_LABEL[s.my][1]} /></div>
          </div>)) : <div className="empty">Ирэх хичээлд бүртгэлгүй байна. Сургалтын хуудаснаас хуваарь сонгоно уу.</div>}</div>
      </section>

      {active.length > 0 && <section className="stack">
        <h2>Бүртгэлтэй хуваарьт сургалт</h2>
        <div className="list">{active.map(e => (
          <Link key={e.offering_id} className="row" href={`/portal/courses/${e.course_id}#offerings`}>
            <div><strong>{e.course}</strong>
              <div className="meta"><span className="num">{offCode(e.num)}</span><span>{e.first_at ? `${fmtDate(e.first_at)}${e.last_at && fmtDate(e.last_at) !== fmtDate(e.first_at) ? ` – ${fmtDate(e.last_at)}` : ''}` : ''}</span><span>{e.location}</span></div></div>
            <div className="acts"><Chip label={e.status === 'WAITLISTED' ? `Хүлээлгийн жагсаалтад · ${e.pos}-р` : ENR_LABEL[e.status as EnrStatus][0]} tone={ENR_LABEL[e.status as EnrStatus][1]} /></div>
          </Link>))}</div>
      </section>}

      {history.length > 0 && <section className="stack">
        <h2>Түүх</h2>
        <div className="list">{history.map(e => (
          <div key={e.offering_id} className="row">
            <div><strong>{e.course}</strong>
              <div className="meta"><span className="num">{offCode(e.num)}</span><span>{fmtDate(e.first_at)}</span><span>{e.location}</span>{e.score != null && <span>Оноо: {Number(e.score)}</span>}</div></div>
            <div className="acts">{e.ostatus === 'CANCELLED' && e.status === 'DROPPED' ? <Chip label="Хуваарь цуцлагдсан" tone="crit" /> : <Chip label={ENR_LABEL[e.status as EnrStatus][0]} tone={ENR_LABEL[e.status as EnrStatus][1]} />}</div>
          </div>))}</div>
      </section>}
    </>
  );
}
