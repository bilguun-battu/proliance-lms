import Link from 'next/link';
import { all } from '@/lib/db';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { complianceRows, groupBy, rate, COMP_LABEL } from '@/lib/compliance';
import { Flash, Chip } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import RateBar from '@/components/RateBar';
import AudTabs, { audOf, AUD_DB } from '@/components/AudTabs';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default async function Compliance(
  props: { searchParams: Promise<{ ok?: string; err?: string; course?: string; department?: string; org?: string; q?: string; status?: string; aud?: string }> }
) {
  const searchParams = await props.searchParams;
  const me = await requireUser(...STAFF_ROLES);
  const ta = me.role === 'TRAINING_ADMIN';
  const aud = ta ? 'customer' : audOf(searchParams.aud ?? 'internal');
  const A = AUD_DB(aud);
  const courses = await all<any>(`SELECT c.id, c.title, c.category FROM courses c WHERE c.audience=$1 AND EXISTS (SELECT 1 FROM course_versions v WHERE v.course_id=c.id AND v.status='PUBLISHED') ORDER BY c.category, c.title`, [A]);
  const depts = (await all<any>(`SELECT DISTINCT department FROM users WHERE department IS NOT NULL ORDER BY 1`)).map(d => d.department);
  const orgs = await all<any>(`SELECT id, name FROM orgs WHERE NOT is_internal ORDER BY name`);
  const sp = searchParams;
  const q = (sp.q ?? '').trim().toLowerCase();
  // Шүүлтүүр (сургалт, хэлтэс, байгууллага, нэр) нь бүх үзүүлэлт, хүснэгтэд нэгэн зэрэг үйлчилнэ
  const all_ = (await complianceRows({ course: sp.course, department: aud === 'internal' ? sp.department : undefined, org: aud === 'customer' ? sp.org : undefined, audience: A }))
    .filter(r => !q || `${r.name} ${r.email ?? ''}`.toLowerCase().includes(q));
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
        <div><h1>Заавал хамрагдах сургалтын тайлан</h1><p className="muted">Биелэлтийг (compliance) сургалт, хэлтэс, байгууллагаар шүүж хянана. Оноолтыг <Link className="link" href={`/admin/assignments?aud=${aud}`}>Заавал сургалт оноох</Link> хэсгээс хийнэ.</p></div>
        <a className="btn" href={`${base}/api/compliance/export${qs({})}`}>Excel татах</a>
      </div>
      {!ta && <AudTabs base="/admin/compliance" cur={aud} />}
      <Flash sp={searchParams} />
      <form method="get" className="filterbar panel">
        <input type="hidden" name="aud" value={aud} />
        <label className="fld"><span>Сургалт</span><select name="course" defaultValue={sp.course ?? ''}><option value="">Бүх сургалт</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        {aud === 'internal'
          ? <label className="fld"><span>Хэлтэс</span><select name="department" defaultValue={sp.department ?? ''}><option value="">Бүх хэлтэс</option>{depts.map(d => <option key={d}>{d}</option>)}</select></label>
          : <label className="fld"><span>Байгууллага</span><select name="org" defaultValue={sp.org ?? ''}><option value="">Бүх байгууллага</option>{orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
        <label className="fld"><span>Төлөв</span><select name="status" defaultValue={sp.status ?? ''}><option value="">Бүх төлөв</option><option value="late">Хэтэрсэн / хүчингүй</option><option value="soon">Хугацаа дөхсөн</option></select></label>
        <label className="fld"><span>Хүн хайх</span><input type="search" name="q" defaultValue={sp.q ?? ''} placeholder="Нэр эсвэл имэйл" /></label>
        <div className="acts"><button className="btn sm">Хайх</button>{(sp.course || sp.department || sp.org || sp.status || sp.q) && <Link className="btn sm ghost" href={`/admin/compliance?aud=${aud}`}>Цэвэрлэх</Link>}</div>
      </form>

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
        <div className="head"><h2>Хүн бүрээр ({rows.length})</h2></div>
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

    </>
  );
}
