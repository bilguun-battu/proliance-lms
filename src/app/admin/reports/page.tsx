import { all } from '@/lib/db';
import Link from 'next/link';
import { progressRows, activityRows, personRows, certificateRows } from '@/lib/reports';
import { certState } from '@/lib/certs';
import AudTabs, { audOf } from '@/components/AudTabs';
import { Chip } from '@/components/ui';
import { COURSE_LABEL, CATEGORY_LABEL, CAT_TONE } from '@/lib/progress';
import { fmtDateTime, fmtDate, ACTION_LABEL } from '@/lib/format';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default async function Reports({ searchParams }: { searchParams: { course?: string; org?: string; from?: string; to?: string; aud?: string; kind?: string } }) {
  const aud = audOf(searchParams.aud);
  searchParams = { ...searchParams, aud };
  const courses = await all<any>('SELECT id, title FROM courses WHERE audience=$1 ORDER BY title', [aud === 'internal' ? 'INTERNAL' : 'CUSTOMER']);
  const orgs = await all<any>('SELECT id, name FROM orgs WHERE is_internal=$1 ORDER BY name', [aud === 'internal']);
  const rows = await progressRows(searchParams);
  const acts = await activityRows(searchParams, 100);
  const people = await personRows(searchParams);
  const certs = await certificateRows(searchParams, 50);
  const qs = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <div className="head">
        <div><h1>Тайлан</h1><p className="muted">Хэн, хэзээ, ямар сургалт үзсэн, хэр явцтай байгаа</p></div>
        <a className="btn" href={`${base}/api/reports/export${qs ? '?' + qs : ''}`}>Excel татах</a>
      </div>
      <AudTabs base="/admin/reports" cur={aud} />
      <form className="panel form" method="get">
        <input type="hidden" name="aud" value={aud} />
        <label className="fld"><span>Сургалт</span><select name="course" defaultValue={searchParams.course ?? ''}><option value="">Бүгд</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <label className="fld"><span>Байгууллага</span><select name="org" defaultValue={searchParams.org ?? ''}><option value="">Бүгд</option>{orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        <label className="fld"><span>Ангилал</span><select name="kind" defaultValue={searchParams.kind ?? ''}><option value="">Нийт суусан сургалт</option><option value="mand">Заавал хамрагдах</option><option value="other">Сонгон (заавал биш)</option></select></label>
        <label className="fld"><span>Үйлдэл: эхлэх огноо</span><input type="date" name="from" defaultValue={searchParams.from ?? ''} /></label>
        <label className="fld"><span>Дуусах огноо</span><input type="date" name="to" defaultValue={searchParams.to ?? ''} /></label>
        <div><button className="btn ghost">Шүүх</button></div>
      </form>
      <section className="panel">
        <h2>Хүн бүрээр ({people.length})</h2>
        <p className="small muted">Заавал хамрагдах сургалтын биелэлт ба нийт дуусгасан сургалт (заавал + сонгон).</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Нэр</th><th>Албан тушаал</th><th className="r">Заавал хамрагдах: хүчинтэй</th><th className="r">Хэтэрсэн</th><th className="r">Нийт дуусгасан</th><th className="r">Үүнээс сонгон</th><th className="r">Гэрчилгээ</th></tr></thead>
          <tbody>{people.map(p => (
            <tr key={p.id}><td><Link className="link" href={`/admin/learners/${p.id}`}><strong>{p.name}</strong></Link><div className="small muted">{p.org}</div></td>
              <td className="small">{p.position ?? '—'}{p.department && <div className="muted">{p.department}</div>}</td>
              <td className="r num">{p.mandTotal ? `${p.mandOk}/${p.mandTotal}` : '—'}</td>
              <td className="r num">{p.mandLate ? <Chip label={String(p.mandLate)} tone="crit" /> : '—'}</td>
              <td className="r num">{p.completed}</td><td className="r num">{p.optional}</td><td className="r num">{p.certs}</td></tr>))}
            {!people.length && <tr><td colSpan={7} className="muted">Өгөгдөл алга.</td></tr>}
          </tbody></table></div>
      </section>
      <section className="panel">
        <h2>Явц ({rows.length})</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Суралцагч</th><th>Сургалт</th><th>Ангилал</th><th>Төлөв</th><th className="r">Модуль</th><th className="r">Дундаж оноо</th><th>Сүүлд</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}><td><strong>{r.name}</strong><div className="small muted">{r.org}</div></td><td>{r.title} <span className="small muted">v{r.version}</span><div><Chip label={CATEGORY_LABEL[r.category]} tone={CAT_TONE[r.category]} /></div></td>
              <td>{r.mandatory ? <Chip label="Заавал хамрагдах" tone="brand" /> : <span className="small muted">Сонгон</span>}</td>
              <td><Chip label={r.status} tone={COURSE_LABEL[r.statusKey][1]} /></td><td className="r">{r.done}/{r.total}</td>
              <td className="r">{r.avg ?? '—'}</td><td className="small muted">{fmtDateTime(r.last)}</td></tr>))}
            {!rows.length && <tr><td colSpan={7} className="muted">Өгөгдөл алга.</td></tr>}
          </tbody></table></div>
      </section>
      <section className="panel">
        <h2>Олгосон гэрчилгээ <span className="small muted">(сүүлийн 50)</span></h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Дугаар</th><th>Нэр</th><th>Сургалт</th><th>Олгосон</th><th>Хүчинтэй</th><th></th></tr></thead>
          <tbody>{certs.map(c => { const [l, t] = certState(c); return (
            <tr key={c.id}><td className="small num">{c.number}</td><td>{c.user_name}<div className="small muted">{c.position}</div></td><td>{c.course_title}{c.mandatory && <div className="small muted">Заавал хамрагдах</div>}</td>
              <td className="small num">{fmtDate(c.issued_at)}</td><td><Chip label={l} tone={t} /><div className="small muted num">{c.valid_until ? fmtDate(c.valid_until) : 'Хугацаагүй'}</div></td>
              <td><Link className="btn sm ghost" href={`/cert/${c.id}`}>Харах</Link></td></tr>); })}
            {!certs.length && <tr><td colSpan={6} className="muted">Гэрчилгээ алга.</td></tr>}
          </tbody></table></div>
      </section>
      <section className="panel">
        <h2>Үйлдлийн бүртгэл <span className="small muted">(сүүлийн 100, бүгдийг Excel-ээс)</span></h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Огноо</th><th>Суралцагч</th><th>Сургалт</th><th>Үйлдэл</th></tr></thead>
          <tbody>{acts.map((a, i) => (
            <tr key={i}><td className="small num">{fmtDateTime(a.at)}</td><td>{a.name}<div className="small muted">{a.org}</div></td><td>{a.course ?? '—'}</td>
              <td>{ACTION_LABEL[a.action] ?? a.action}{a.detail && <div className="small muted">{a.detail}</div>}</td></tr>))}
            {!acts.length && <tr><td colSpan={4} className="muted">Бүртгэл алга.</td></tr>}
          </tbody></table></div>
      </section>
    </>
  );
}
