import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { coordinatorAddLearner, resendInvite } from '@/app/actions/admin';
import { progressRows } from '@/lib/reports';
import { Flash, Chip } from '@/components/ui';
import { COURSE_LABEL } from '@/lib/progress';
import { fmtDateTime, fmtSession, fmtDate } from '@/lib/format';
import { complianceRows, COMP_LABEL, COMPLIANT_SET, rate } from '@/lib/compliance';
import RateBar from '@/components/RateBar';
import Submit from '@/components/Submit';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default async function OrgHome({ searchParams }: { searchParams: { ok?: string; err?: string } }) {
  const u = await requireUser('COORDINATOR');
  const org = await one<any>('SELECT name FROM orgs WHERE id=$1', [u.orgId]);
  const people = await all<any>(`SELECT id, name, email, position, (password_hash IS NOT NULL) AS activated FROM users WHERE org_id=$1 AND active ORDER BY name`, [u.orgId]);
  const rows = await progressRows({ org: u.orgId! });
  const needUpdate = rows.filter(r => r.left > 0).length;
  const comp = await complianceRows({ org: u.orgId! });
  const sessions = await all<any>(`
    SELECT s.starts_at, s.location, u.name, c.title AS course,
      (SELECT m.title FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=s.course_id AND m.module_key=s.module_key ORDER BY v.number DESC LIMIT 1) AS module
      FROM session_attendees a JOIN sessions s ON s.id=a.session_id JOIN users u ON u.id=a.user_id JOIN courses c ON c.id=s.course_id
     WHERE u.org_id=$1 AND a.status='REGISTERED' AND s.status='SCHEDULED' AND s.starts_at > now() ORDER BY s.starts_at`, [u.orgId]);
  return (
    <>
      <div className="head">
        <div><h1>{org?.name}</h1><p className="muted">{people.length} ажилтан · {needUpdate} сургалт дутуу</p></div>
        <a className="btn ghost" href={`${base}/api/reports/export`}>Excel татах</a>
      </div>
      <Flash sp={searchParams} />
      <section className="panel">
        <h2>Ажилтан нэмэх</h2>
        <form action={coordinatorAddLearner} className="form">
          <label className="fld"><span>Нэр</span><input type="text" name="name" required /></label>
          <label className="fld"><span>Албан тушаал</span><input type="text" name="position" /></label>
          <label className="fld"><span>Имэйл</span><input type="email" name="email" required /></label>
          <label className="fld"><span>Утас (SMS)</span><input type="tel" name="phone" /></label>
          <div><Submit>Нэмж, урилга илгээх</Submit></div>
        </form>
      </section>
      <section className="panel">
        <h2>Сургалтын явц</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Ажилтан</th><th>Сургалт</th><th>Төлөв</th><th className="r">Модуль</th><th>Сүүлд</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}><td><strong>{r.name}</strong><div className="small muted">{r.position}</div></td><td>{r.title}</td>
              <td><Chip label={r.status} tone={COURSE_LABEL[r.statusKey][1]} /></td><td className="r">{r.done}/{r.total}</td>
              <td className="small muted">{fmtDateTime(r.last)}</td></tr>))}
            {!rows.length && <tr><td colSpan={5} className="muted">Сургалт нээгдээгүй байна.</td></tr>}
          </tbody></table></div>
      </section>
      {comp.length > 0 && <section className="panel">
        <div className="head"><h2>Заавал хамрагдах сургалт</h2><RateBar value={rate(comp)} /></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Ажилтан</th><th>Сургалт</th><th>Төлөв</th><th>Хугацаа</th></tr></thead>
          <tbody>{comp.map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.course}</td><td><Chip label={COMP_LABEL[r.status][0]} tone={COMP_LABEL[r.status][1]} /></td>
            <td className="small num">{COMPLIANT_SET.includes(r.status) ? (r.validUntil ? `${fmtDate(r.validUntil)} хүртэл` : 'Дууссан') : fmtDate(r.due)}</td></tr>)}</tbody>
        </table></div>
      </section>}
      <section className="panel">
        <h2>Ажилтнуудын ирэх хичээл</h2>
        {sessions.length ? <div className="tablewrap"><table>
          <thead><tr><th>Огноо</th><th>Ажилтан</th><th>Хичээл</th><th>Байршил</th></tr></thead>
          <tbody>{sessions.map((s, i) => <tr key={i}><td className="num">{fmtSession(s.starts_at)}</td><td>{s.name}</td><td>{s.module}<div className="small muted">{s.course}</div></td><td className="small">{s.location}</td></tr>)}</tbody>
        </table></div> : <p className="muted">Бүртгэлтэй ирэх хичээл алга.</p>}
      </section>
      {people.some(p => !p.activated) && <section className="panel">
        <h2>Урилга хүлээж буй</h2>
        <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>{people.filter(p => !p.activated).map(p => (
          <div key={p.id} className="row"><div><strong>{p.name}</strong><div className="meta">{p.email}</div></div>
            <div className="acts"><form action={resendInvite}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value="/org" /><Submit className="btn sm ghost">Дахин илгээх</Submit></form></div></div>))}</div>
      </section>}
      <section className="panel">
        <h2>Ажилтнуудын профайл ({people.length})</h2>
        <p className="small muted">Ажилтан бүрийн заавал хамрагдах сургалт, гэрчилгээ, албан тушаалын түүх.</p>
        <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>{people.map(p => (
          <Link key={p.id} href={`/org/people/${p.id}`} className="row"><div><strong>{p.name}</strong><div className="meta"><span>{p.position ?? '—'}</span><span>{p.email}</span></div></div><span className="link small">Профайл →</span></Link>))}</div>
      </section>
    </>
  );
}
