import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { Chip } from '@/components/ui';
import { fmtSession } from '@/lib/format';

const ST: Record<string, [string, string]> = { REGISTERED: ['Бүртгүүлсэн', 'info'], ATTENDED: ['Ирсэн', 'ok'], ABSENT: ['Ирээгүй', 'crit'] };

export default async function MySchedule() {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const rows = await all<any>(`
    SELECT s.*, a.status AS my, c.title AS course,
      (SELECT m.title FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=s.course_id AND m.module_key=s.module_key ORDER BY v.number DESC LIMIT 1) AS module
      FROM session_attendees a JOIN sessions s ON s.id=a.session_id JOIN courses c ON c.id=s.course_id
     WHERE a.user_id=$1 ORDER BY s.starts_at DESC LIMIT 50`, [u.id]);
  const now = Date.now();
  const upcoming = rows.filter(r => new Date(r.starts_at).getTime() > now).reverse();
  const past = rows.filter(r => new Date(r.starts_at).getTime() <= now);
  const item = (r: any) => (
    <div key={r.id} className={`row ${r.status === 'CANCELLED' ? 'locked' : ''}`}>
      <div><strong className="num">{fmtSession(r.starts_at)}</strong> <span className="muted small">· {r.duration_min} мин</span>
        <div><Link className="link" href={`/portal/courses/${r.course_id}/m/${r.module_key}`}>{r.module}</Link> <span className="muted small">· {r.course}</span></div>
        <div className="meta"><span>{r.location}</span>{r.instructor && <span>{r.instructor}</span>}
          {r.link && r.status !== 'CANCELLED' && new Date(r.starts_at).getTime() > now - 3 * 3600e3 && <a className="link" href={r.link} target="_blank" rel="noreferrer">Онлайн хичээлд нэгдэх</a>}</div></div>
      <div className="acts">{r.status === 'CANCELLED' ? <Chip label="Цуцлагдсан" tone="crit" /> : <Chip label={ST[r.my][0]} tone={ST[r.my][1]} />}</div>
    </div>);
  return (
    <>
      <div className="head"><div><h1>Миний хуваарь</h1><p className="muted">Биечлэн болон онлайн шууд хичээлд бүртгүүлсэн байдал</p></div></div>
      <h2>Ирэх хичээл</h2>
      <div className="list">{upcoming.length ? upcoming.map(item) : <div className="empty">Ирэх хичээлд бүртгэлгүй байна. Сургалтын хуудаснаас хуваарь сонгоно уу.</div>}</div>
      {past.length > 0 && <><h2>Өнгөрсөн</h2><div className="list">{past.map(item)}</div></>}
    </>
  );
}
