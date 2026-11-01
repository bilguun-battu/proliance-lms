import Link from 'next/link';
import { all } from '@/lib/db';
import { requireUser, PORTAL_ROLES } from '@/lib/auth';
import { listOfferings, offeringSessions, offCode } from '@/lib/offerings';
import { TEACH_WHERE } from '@/lib/teach';
import { Chip } from '@/components/ui';
import { fmtSession, ymd } from '@/lib/format';
import { FORMAT_LABEL } from '@/lib/progress';
import OfferingList from '@/components/OfferingList';
import MonthCalendar from '@/components/MonthCalendar';

// Сургагч багшийн самбар: заах хуваарь, ирц бүртгэх шаардлагатай хичээл, хуанли
export default async function Teach(props: { searchParams: Promise<{ view?: string; m?: string; show?: string }> }) {
  const sp = await props.searchParams;
  const u = await requireUser(...PORTAL_ROLES);
  const all_ = await listOfferings(`x.status='SCHEDULED' AND ${TEACH_WHERE(1)}`, [u.id], 'first_at ASC NULLS LAST');
  const upcoming = all_.filter(o => !o.last_at || new Date(o.last_at).getTime() >= Date.now() - 864e5);
  const past = all_.filter(o => !upcoming.includes(o)).reverse();
  const sess = (await offeringSessions(all_.map(o => o.id))).filter(s => s.status === 'SCHEDULED');
  const mine = sess.filter(s => s.instructor_id === u.id);
  const week = mine.filter(s => { const t = new Date(s.starts_at).getTime(); return t >= Date.now() && t < Date.now() + 7 * 864e5; });
  const todo = await all<any>(`
    SELECT s.id, s.offering_id, s.starts_at, (SELECT count(*)::int FROM session_attendees a WHERE a.session_id=s.id AND a.status='REGISTERED') AS n,
      (SELECT m.title FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=s.course_id AND m.module_key=s.module_key ORDER BY v.number DESC LIMIT 1) AS module,
      c.title AS course
      FROM sessions s JOIN offerings o ON o.id=s.offering_id JOIN courses c ON c.id=o.course_id
     WHERE s.status='SCHEDULED' AND o.status='SCHEDULED' AND s.starts_at < now() AND s.starts_at > now() - interval '60 days' AND coalesce(s.instructor_id, o.instructor_id)=$1
       AND EXISTS (SELECT 1 FROM session_attendees a WHERE a.session_id=s.id AND a.status='REGISTERED') ORDER BY s.starts_at`, [u.id]);
  const waiting = upcoming.reduce((t, o) => t + o.waiting, 0);
  const view = sp.view === 'cal' ? 'cal' : 'list';
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? sp.m! : ymd(new Date()).slice(0, 7);
  const next = mine.find(s => new Date(s.starts_at).getTime() >= Date.now());
  return (
    <>
      <div className="hello"><h1>Заах хуваарь</h1><p className="muted">Таны заах танхимын болон онлайн шууд хичээлүүд, оролцогчид, ирц.</p></div>
      <div className="offstats">
        <div><span>Ирэх хуваарь</span><strong className="num">{upcoming.length}</strong></div>
        <div><span>Энэ 7 хоногт заах хичээл</span><strong className="num">{week.length}</strong></div>
        <div><span>Ирц бүртгэх</span><strong className="num" style={{ color: todo.length ? 'var(--crit)' : undefined }}>{todo.length}</strong></div>
        <div><span>Хүлээлгийн жагсаалтад</span><strong className="num">{waiting}</strong></div>
      </div>
      {next && <Link className="resume" href={`/portal/teach/${next.offering_id}#s-${next.id}`}>
        <span className="resume-l">Дараагийн хичээл · {fmtSession(next.starts_at)}</span>
        <strong>{next.module}</strong>
        <span className="small muted">{FORMAT_LABEL[next.format]} · {next.location}</span>
        <span className="resume-go" aria-hidden="true">▶</span>
      </Link>}
      {todo.length > 0 && <section className="panel">
        <h2>Ирц бүртгэх шаардлагатай</h2>
        <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>{todo.map(t => (
          <Link key={t.id} className="row req" href={`/portal/teach/${t.offering_id}#s-${t.id}`}>
            <div><strong>{t.module}</strong><div className="meta"><span className="num">{fmtSession(t.starts_at)}</span><span>{t.course}</span></div></div>
            <div className="acts"><Chip label={`${t.n} хүний ирц оруулаагүй`} tone="crit" /></div>
          </Link>))}</div>
      </section>}
      <div className="chipnav">
        <Link href="/portal/teach" className={view === 'list' ? 'on' : ''}>Жагсаалт</Link>
        <Link href="/portal/teach?view=cal" className={view === 'cal' ? 'on' : ''}>Хуанли</Link>
      </div>
      {view === 'list' ? <>
        <section className="stack"><h2>Ирэх хуваарь</h2>
          <OfferingList rows={upcoming} href={id => `/portal/teach/${id}`} empty="Танд оноогдсон ирэх хуваарь алга." /></section>
        {past.length > 0 && <section className="stack"><h2>Өнгөрсөн хуваарь</h2>
          <OfferingList rows={past.slice(0, 20)} href={id => `/portal/teach/${id}`} empty="" /></section>}
      </> : <MonthCalendar month={month} link={m => `/portal/teach?view=cal&m=${m}`}
        items={sess.filter(s => ymd(s.starts_at).startsWith(month)).map(s => ({ at: s.starts_at, title: s.module, sub: `${offCode(all_.find(o => o.id === s.offering_id)!.num)} · ${s.location}`,
          href: `/portal/teach/${s.offering_id}#s-${s.id}`, tone: s.instructor_id === u.id ? (s.format === 'ONLINE' ? 'online' : 'inperson') : 'neutral' }))} />}
    </>
  );
}
