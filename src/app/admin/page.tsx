import Link from 'next/link';
import { all } from '@/lib/db';
import { ACCESS_SQL } from '@/lib/assign';
import AudTabs, { audOf, AUD_DB } from '@/components/AudTabs';
import { complianceRows, rate } from '@/lib/compliance';
import RateBar from '@/components/RateBar';
import { courseProgress } from '@/lib/progress';
import { fmtDateTime, fmtSession, ACTION_LABEL } from '@/lib/format';

export default async function AdminHome(props: { searchParams: Promise<{ aud?: string }> }) {
  const searchParams = await props.searchParams;
  const aud = audOf(searchParams.aud);
  const A = AUD_DB(aud);
  const courses = await all<any>(`
    SELECT c.id, c.title, (SELECT max(number) FROM course_versions v WHERE v.course_id=c.id AND v.status='PUBLISHED') AS ver,
           EXISTS (SELECT 1 FROM course_versions v WHERE v.course_id=c.id AND v.status='DRAFT') AS has_draft
      FROM courses c WHERE c.audience=$1 ORDER BY c.title`, [A]);
  const learners = await all<any>(`
    SELECT u.id, u.name, o.name AS org, acc.cid AS course_id
      FROM (${ACCESS_SQL}) acc JOIN users u ON u.id=acc.uid LEFT JOIN orgs o ON o.id=u.org_id`);
  const stats = new Map<string, Record<string, number>>();
  const attention: { name: string; org: string; course: string; left: number; cid: string }[] = [];
  for (const l of learners) {
    const c = courses.find(x => x.id === l.course_id);
    if (!c?.ver) continue;
    const p = await courseProgress(l.id, l.course_id);
    if (!p) continue;
    const s = stats.get(l.course_id) ?? { total: 0, done: 0, update: 0, progress: 0, notstarted: 0 };
    s.total++; s[p.key]++;
    stats.set(l.course_id, s);
    if (p.key === 'update') attention.push({ name: l.name, org: l.org, course: c.title, left: p.left, cid: c.id });
  }
  const upcoming = await all<any>(`
    SELECT s.id, s.starts_at, s.seats, s.location, c.title AS course,
      (SELECT m.title FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=s.course_id AND m.module_key=s.module_key ORDER BY v.number DESC LIMIT 1) AS module,
      (SELECT count(*)::int FROM session_attendees a WHERE a.session_id=s.id) AS taken
      FROM sessions s JOIN courses c ON c.id=s.course_id WHERE c.audience=$1 AND s.status='SCHEDULED' AND s.starts_at > now() ORDER BY s.starts_at LIMIT 5`, [A]);
  const pendingAtt = (await all<any>(`SELECT count(*)::int AS n FROM session_attendees a JOIN sessions s ON s.id=a.session_id
     JOIN courses c ON c.id=s.course_id WHERE c.audience=$1 AND a.status='REGISTERED' AND s.status='SCHEDULED' AND s.starts_at < now()`, [A]))[0].n;
  const practical = (await all<any>(`SELECT count(*)::int AS n FROM practical_records r JOIN courses c ON c.id=r.course_id WHERE c.audience=$1 AND r.status IN ('SUBMITTED','REQUESTED')`, [A]))[0].n;
  const comp = await complianceRows({ audience: A });
  const lateN = comp.filter(r => r.status === 'OVERDUE' || r.status === 'EXPIRED').length;
  const soonN = comp.filter(r => r.status === 'DUE_SOON' || r.status === 'EXPIRING').length;
  const recent = await all<any>(`
    SELECT a.at, a.action, a.detail, u.name, c.title FROM activity_log a JOIN users u ON u.id=a.user_id
      LEFT JOIN orgs o ON o.id=u.org_id LEFT JOIN courses c ON c.id=a.course_id
     WHERE a.action <> 'LOGIN' AND coalesce(o.is_internal,false)=$1 ORDER BY a.at DESC LIMIT 8`, [aud === 'internal']);
  return (
    <>
      <div className="head"><div><h1>Тойм</h1><p className="muted">{aud === 'internal' ? 'Proliance-ийн ажилтнуудын дотоод сургалтын явц' : 'Харилцагч байгууллагуудын ажилтнуудын сургалтын явц'}</p></div></div>
      <AudTabs base="/admin" cur={aud} />
      {practical > 0 && <div className="notice soft"><strong>{practical} OJT / VoC үнэлгээ хүлээгдэж байна</strong><span className="small"><Link className="link" href="/admin/assess">Үнэлгээ хийх</Link></span></div>}
      <section className="panel">
        <h2>Сургалт бүрийн явц</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Сургалт</th><th className="r">Суралцагч</th><th className="r">Дууссан</th><th className="r">Шинэчлэлт</th><th className="r">Явагдаж буй</th><th className="r">Эхлээгүй</th></tr></thead>
          <tbody>
            {courses.map(c => { const s = stats.get(c.id) ?? { total: 0, done: 0, update: 0, progress: 0, notstarted: 0 }; return (
              <tr key={c.id}>
                <td><Link className="link" href={`/admin/courses/${c.id}`}>{c.title}</Link><div className="small muted">{c.ver ? `v${c.ver}` : 'Нийтлэгдээгүй'}{c.has_draft ? ' · ноорог бий' : ''}</div></td>
                <td className="r">{s.total}</td><td className="r">{s.done}</td><td className="r">{s.update}</td><td className="r">{s.progress}</td><td className="r">{s.notstarted}</td>
              </tr>); })}
            {!courses.length && <tr><td colSpan={6} className="muted">Сургалт алга. <Link className="link" href="/admin/courses/new">Эхний сургалтаа үүсгэх</Link></td></tr>}
          </tbody>
        </table></div>
      </section>
      {comp.length > 0 && <section className="panel">
        <div className="head"><h2>Заавал хамрагдах сургалтын биелэлт</h2><Link className="link small" href={`/admin/compliance?aud=${aud}`}>Дэлгэрэнгүй</Link></div>
        <div className="acts" style={{ justifyContent: 'flex-start', gap: 24 }}>
          <RateBar value={rate(comp)} />
          <span className="small">{comp.length} оноолт</span>
          {lateN > 0 && <Link className="chip c-crit" href={`/admin/compliance?aud=${aud}&status=late`}>{lateN} хэтэрсэн</Link>}
          {soonN > 0 && <Link className="chip c-warn" href={`/admin/compliance?aud=${aud}&status=soon`}>{soonN} дөхсөн</Link>}
        </div>
      </section>}
      <section className="panel">
        <div className="head"><h2>Ойрын хичээл</h2><Link className="link small" href={`/admin/sessions?aud=${aud}`}>Бүх хуваарь</Link></div>
        {pendingAtt > 0 && <div className="alert err">Өнгөрсөн хичээлүүдэд {pendingAtt} хүний ирц батлагдаагүй байна. <Link className="link" href="/admin/sessions?show=past">Ирц батлах</Link></div>}
        {upcoming.length ? <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>{upcoming.map(s => (
          <div key={s.id} className="row"><div><strong className="num">{fmtSession(s.starts_at)}</strong> · {s.module}
            <div className="meta"><span>{s.course}</span><span>{s.location}</span></div></div>
            <div className="acts"><span className="chip c-brand">{s.taken}/{s.seats}</span></div></div>))}</div>
          : <p className="muted">Ирэх хичээл алга.</p>}
      </section>
      <div className="grid2">
        <section className="panel">
          <h2>Шинэ хувилбар нөхөж үзэх шаардлагатай</h2>
          {attention.length ? <div className="list">{attention.map((a, i) => (
            <div key={i} className="row req" style={{ ['--c' as any]: 'var(--warn)' }}>
              <div><strong>{a.name}</strong><div className="meta"><span>{a.org}</span><span>{a.course}</span></div></div>
              <div className="acts"><span className="chip c-warn">{a.left} модуль</span></div>
            </div>))}</div> : <p className="muted">Одоогоор шинэчлэлт хүлээгдэж буй суралцагч алга.</p>}
        </section>
        <section className="panel">
          <h2>Сүүлийн үйлдлүүд</h2>
          {recent.length ? <div className="list">{recent.map((r, i) => (
            <div key={i} className="row"><div><strong>{r.name}</strong> <span className="muted">· {ACTION_LABEL[r.action] ?? r.action}</span>
              <div className="meta"><span>{r.title}</span>{r.detail && <span>{r.detail}</span>}<span>{fmtDateTime(r.at)}</span></div></div></div>))}</div>
            : <p className="muted">Үйлдэл бүртгэгдээгүй байна.</p>}
        </section>
      </div>
    </>
  );
}
