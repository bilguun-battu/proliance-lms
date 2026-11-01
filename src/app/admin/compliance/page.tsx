import Link from 'next/link';
import { all } from '@/lib/db';
import { createAssignment, deleteAssignment } from '@/app/actions/admin';
import { complianceRows, groupBy, rate, COMP_LABEL } from '@/lib/compliance';
import { TARGET_LABEL } from '@/lib/assign';
import { Flash, Chip } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import Submit from '@/components/Submit';
import RateBar from '@/components/RateBar';
import TargetPicker from './TargetPicker';
import AudTabs, { audOf, AUD_DB } from '@/components/AudTabs';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default async function Compliance({ searchParams }: { searchParams: { ok?: string; err?: string; course?: string; department?: string; status?: string; aud?: string } }) {
  const aud = audOf(searchParams.aud ?? 'internal');
  const A = AUD_DB(aud);
  const courses = await all<any>(`SELECT c.id, c.title, c.category FROM courses c WHERE c.audience=$1 AND EXISTS (SELECT 1 FROM course_versions v WHERE v.course_id=c.id AND v.status='PUBLISHED') ORDER BY c.category, c.title`, [A]);
  const depts = (await all<any>(`SELECT DISTINCT department FROM users WHERE department IS NOT NULL ORDER BY 1`)).map(d => d.department);
  const positions = (await all<any>(`SELECT DISTINCT position FROM users WHERE position IS NOT NULL ORDER BY 1`)).map(d => d.position);
  const orgs = await all<any>(`SELECT id, name FROM orgs WHERE NOT is_internal ORDER BY name`);
  const users = await all<any>(`SELECT u.id, u.name FROM users u LEFT JOIN orgs o ON o.id=u.org_id WHERE u.role <> 'ADMIN' AND u.active AND coalesce(o.is_internal,false)=$1 ORDER BY u.name`, [aud === 'internal']);
  const assigns = await all<any>(`SELECT a.*, c.title FROM assignments a JOIN courses c ON c.id=a.course_id WHERE c.audience=$1 ORDER BY c.title, a.created_at`, [A]);
  const valueLabel = (a: any) => a.target === 'ORG' ? orgs.find(o => o.id === a.target_value)?.name : a.target === 'USER' ? users.find(u => u.id === a.target_value)?.name : a.target_value;

  const all_ = await complianceRows({ course: searchParams.course, department: searchParams.department, audience: A });
  const rows = searchParams.status ? all_.filter(r => searchParams.status === 'late' ? ['OVERDUE', 'EXPIRED'].includes(r.status) : searchParams.status === 'soon' ? ['DUE_SOON', 'EXPIRING'].includes(r.status) : true) : all_;
  const overall = rate(all_);
  const late = all_.filter(r => r.status === 'OVERDUE' || r.status === 'EXPIRED').length;
  const soon = all_.filter(r => r.status === 'DUE_SOON' || r.status === 'EXPIRING').length;
  const byCourse = groupBy(all_, r => r.course);
  const byDept = groupBy(all_, r => (r.internal ? r.department || 'Хэлтэсгүй' : r.org || 'Байгууллагагүй'));
  const qs = (extra: Record<string, string>) => '?' + new URLSearchParams(Object.entries({ ...searchParams, ok: '', err: '', ...extra }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <div className="head">
        <div><h1>Заавал хамрагдах сургалт</h1><p className="muted">Сургалтыг ажилтан, хэлтэс, харилцагчдад заавал оноож, биелэлтийг (compliance) хянана.</p></div>
        <a className="btn" href={`${base}/api/compliance/export${qs({})}`}>Excel татах</a>
      </div>
      <AudTabs base="/admin/compliance" cur={aud} />
      <Flash sp={searchParams} />

      <div className="evtiles">
        <div className="evtile"><span className="small muted">Нийт биелэлт</span><strong style={{ color: overall === null ? undefined : overall >= 0.9 ? 'var(--ok)' : overall >= 0.7 ? 'var(--warn)' : 'var(--crit)' }}>{overall === null ? '—' : `${Math.round(overall * 100)}%`}</strong></div>
        <div className="evtile"><span className="small muted">Оноолт (хүн × сургалт)</span><strong>{all_.length}</strong></div>
        <Link href={`/admin/compliance${qs({ status: 'late' })}`} className="evtile" style={{ textDecoration: 'none' }}><span className="small muted">Хэтэрсэн / хүчингүй</span><strong style={{ color: late ? 'var(--crit)' : undefined }}>{late}</strong></Link>
        <Link href={`/admin/compliance${qs({ status: 'soon' })}`} className="evtile" style={{ textDecoration: 'none' }}><span className="small muted">Хугацаа дөхсөн</span><strong style={{ color: soon ? 'var(--warn)' : undefined }}>{soon}</strong></Link>
      </div>

      <div className="grid2">
        <section className="panel">
          <h2>Сургалтаар</h2>
          <div className="tablewrap"><table>
            <thead><tr><th>Сургалт</th><th>Биелэлт</th><th className="r">Хэтэрсэн</th></tr></thead>
            <tbody>{byCourse.map(g => <tr key={g.key}><td>{g.key}<div className="small muted">{g.compliant}/{g.total}</div></td><td><RateBar value={g.rate} /></td><td className="r">{g.overdue || '—'}</td></tr>)}
              {!byCourse.length && <tr><td colSpan={3} className="muted">Оноолт алга.</td></tr>}</tbody>
          </table></div>
        </section>
        <section className="panel">
          <h2>Хэлтэс / байгууллагаар</h2>
          <div className="tablewrap"><table>
            <thead><tr><th>Хэлтэс</th><th>Биелэлт</th><th className="r">Хэтэрсэн</th></tr></thead>
            <tbody>{byDept.map(g => <tr key={g.key}><td>{g.key}<div className="small muted">{g.compliant}/{g.total}</div></td><td><RateBar value={g.rate} /></td><td className="r">{g.overdue || '—'}</td></tr>)}
              {!byDept.length && <tr><td colSpan={3} className="muted">Оноолт алга.</td></tr>}</tbody>
          </table></div>
        </section>
      </div>

      <section className="panel">
        <div className="head"><h2>Хүн бүрээр ({rows.length})</h2>
          <form method="get" className="acts">
            <select name="course" defaultValue={searchParams.course ?? ''} style={{ width: 'auto' }}><option value="">Бүх сургалт</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
            {aud === 'internal' && <select name="department" defaultValue={searchParams.department ?? ''} style={{ width: 'auto' }}><option value="">Бүх хэлтэс</option>{depts.map(d => <option key={d}>{d}</option>)}</select>}
            <input type="hidden" name="aud" value={aud} /><select name="status" defaultValue={searchParams.status ?? ''} style={{ width: 'auto' }}><option value="">Бүх төлөв</option><option value="late">Хэтэрсэн</option><option value="soon">Дөхсөн</option></select>
            <button className="btn sm ghost">Шүүх</button>
          </form></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Хүн</th><th>Сургалт</th><th>Төлөв</th><th>Хугацаа</th><th className="r">Модуль</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}>
              <td><strong>{r.name}</strong><div className="small muted">{r.internal ? [r.department, r.position].filter(Boolean).join(' · ') : r.org}</div></td>
              <td>{r.course}{r.recurrence && <div className="small muted">{r.recurrence} сар тутам</div>}</td>
              <td><Chip label={COMP_LABEL[r.status][0]} tone={COMP_LABEL[r.status][1]} /></td>
              <td className="small num">{r.status === 'COMPLIANT' || r.status === 'EXPIRING' ? (r.validUntil ? `${fmtDate(r.validUntil)} хүртэл` : `${fmtDate(r.completedAt)} дууссан`) : r.status === 'EXPIRED' ? `${fmtDate(r.validUntil)}-нд дууссан` : fmtDate(r.due)}</td>
              <td className="r">{r.done}/{r.total}</td>
            </tr>))}
            {!rows.length && <tr><td colSpan={5} className="muted">Өгөгдөл алга.</td></tr>}
          </tbody></table></div>
      </section>

      <section className="panel">
        <h2>Заавал хамрагдах сургалт оноох</h2>
        <form action={createAssignment} className="form">
          <label className="fld"><span>Сургалт</span><select name="course_id" required>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
          <TargetPicker aud={aud} depts={depts} positions={positions} orgs={orgs} users={users} />
          <label className="fld"><span>Дуусгах хугацаа (хоног)</span><input type="number" name="due_days" defaultValue={30} min={1} /></label>
          <label className="fld"><span>Эсвэл тогтмол огноо</span><input type="date" name="due_date" /></label>
          <label className="fld"><span>Давтан суух</span><select name="recurrence_months" defaultValue=""><option value="">Нэг удаа</option><option value="6">6 сар тутам</option><option value="12">Жил бүр</option><option value="24">2 жил тутам</option><option value="36">3 жил тутам</option></select></label>
          <label className="fld"><span>Тайлбар</span><input type="text" name="note" placeholder="Ж: ХАБ-ын журмын дагуу" /></label>
          <div><Submit>Оноох</Submit></div>
        </form>
        <p className="small muted">Хугацааг оноосон өдрөөс эсвэл ажилд шинээр орсон бол бүртгэгдсэн өдрөөс тоолно. Давтан суух сургалтын гүйцэтгэл хугацаа нь дуусахад хүчингүй болж, дахин суух шаардлагатай болно.</p>
        {assigns.length > 0 && <div className="tablewrap"><table>
          <thead><tr><th>Сургалт</th><th>Хэнд</th><th>Хугацаа</th><th>Давтамж</th><th></th></tr></thead>
          <tbody>{assigns.map(a => (
            <tr key={a.id}>
              <td>{a.title}{a.note && <div className="small muted">{a.note}</div>}</td>
              <td>{TARGET_LABEL[a.target]}{a.target_value && <div className="small muted">{valueLabel(a)}</div>}</td>
              <td className="small">{a.due_date ? fmtDate(a.due_date) : `${a.due_days} хоногт`}</td>
              <td className="small">{a.recurrence_months ? `${a.recurrence_months} сар тутам` : 'Нэг удаа'}</td>
              <td>{a.source === 'MATRIX' ? <Link className="btn sm ghost" href="/admin/matrix">Матрицаас засах</Link> : <form action={deleteAssignment}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="aud" value={aud} /><Submit className="btn sm danger" confirmText="Оноолтыг устгах уу?">Устгах</Submit></form>}</td>
            </tr>))}</tbody>
        </table></div>}
      </section>
    </>
  );
}
