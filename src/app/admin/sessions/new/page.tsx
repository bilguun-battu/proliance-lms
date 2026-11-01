import Link from 'next/link';
import { all, one } from '@/lib/db';
import { createOffering } from '@/app/actions/offerings';
import { Flash, Chip } from '@/components/ui';
import { FORMAT_LABEL, CATEGORY_LABEL, CAT_TONE } from '@/lib/progress';
import { fmtDuration, TZ } from '@/lib/format';
import AudTabs, { audOf, AUD_DB } from '@/components/AudTabs';
import InstructorPick from '@/components/InstructorPick';
import Submit from '@/components/Submit';

export default async function NewOffering(props: { searchParams: Promise<{ ok?: string; err?: string; aud?: string; course?: string }> }) {
  const sp = await props.searchParams;
  // Танхимын эсвэл онлайн шууд хичээлтэй (нийтлэгдсэн) сургалтууд
  const ilt = (courseId?: string) => all<any>(`
    SELECT c.id, c.title, c.category, c.audience, m.module_key, m.title AS module, m.format, m.duration_min
      FROM courses c JOIN course_versions v ON v.course_id=c.id AND v.status='PUBLISHED'
       AND v.number=(SELECT max(number) FROM course_versions x WHERE x.course_id=c.id AND x.status='PUBLISHED')
      JOIN modules m ON m.version_id=v.id
     WHERE m.format IN ('INPERSON','ONLINE') ${courseId ? 'AND c.id=$1' : 'AND c.audience=$1'} ORDER BY c.title, m.position`, [courseId ?? AUD_DB(audOf(sp.aud))]);
  if (!sp.course) {
    const aud = audOf(sp.aud);
    const rows = await ilt();
    const courses = [...new Map(rows.map(r => [r.id, r])).values()];
    return (
      <>
        <div><Link className="link small" href={`/admin/sessions?aud=${aud}`}>← Хуваарьт сургалт</Link></div>
        <div className="head"><div><h1>Хуваарь гаргах</h1><p className="muted">1. Сургалтаа сонгоно. 2. Хичээл бүрийн огноо, цаг, багш, суудлын тоог оруулна.</p></div></div>
        <AudTabs base="/admin/sessions/new" cur={aud} />
        <Flash sp={sp} />
        <div className="list">{courses.map(c => {
          const mods = rows.filter(r => r.id === c.id);
          return (
            <Link key={c.id} className="row" href={`/admin/sessions/new?course=${c.id}`}>
              <div><strong>{c.title}</strong>
                <div className="meta"><Chip label={CATEGORY_LABEL[c.category]} tone={CAT_TONE[c.category]} />
                  <span>{mods.map(m => `${m.module} (${FORMAT_LABEL[m.format]})`).join(' · ')}</span></div></div>
              <div className="acts"><span className="btn sm">Сонгох</span></div>
            </Link>);
        })}
          {!courses.length && <div className="empty">Танхимын эсвэл онлайн шууд хичээлтэй нийтлэгдсэн сургалт алга.</div>}
        </div>
      </>
    );
  }
  const mods = await ilt(sp.course);
  const c = await one<any>('SELECT id, title, audience, category FROM courses WHERE id=$1', [sp.course]);
  if (!c) return <p>Сургалт олдсонгүй.</p>;
  const trainers = await all<any>(`SELECT u.id, u.name FROM trainer_quals q JOIN users u ON u.id=q.user_id WHERE q.course_id=$1 AND u.active ORDER BY u.name`, [c.id]);
  const hasOnline = mods.some(m => m.format === 'ONLINE');
  const aud = c.audience === 'INTERNAL' ? 'internal' : 'customer';
  return (
    <>
      <div><Link className="link small" href={`/admin/sessions/new?aud=${aud}`}>← Сургалт сонгох</Link></div>
      <div className="head"><div><p className="small muted" style={{ margin: 0 }}>{CATEGORY_LABEL[c.category]}</p><h1>{c.title}: хуваарь гаргах</h1></div></div>
      <Flash sp={sp} />
      <form action={createOffering} className="stack">
        <input type="hidden" name="course_id" value={c.id} />
        <section className="panel">
          <h2>Хичээлийн цагууд</h2>
          <p className="small muted" style={{ margin: 0 }}>Хуваарьт орох хичээл бүрийн огноо, цагийг оруулна. Огноо оруулаагүй хичээл энэ хуваарьт орохгүй. Цаг: {TZ}</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Хичээл</th><th>Огноо</th><th>Цаг</th><th>Үргэлжлэх (мин)</th><th>Өөр багш (заавал биш)</th></tr></thead>
            <tbody>{mods.map(m => (
              <tr key={m.module_key}>
                <td><strong>{m.module}</strong><div className="small muted">{FORMAT_LABEL[m.format]} · {fmtDuration(m.duration_min)}</div></td>
                <td><input type="date" name={`date_${m.module_key}`} /></td>
                <td><input type="time" name={`time_${m.module_key}`} defaultValue="10:00" /></td>
                <td><input type="number" name={`dur_${m.module_key}`} defaultValue={m.duration_min || 60} min={15} style={{ width: 90 }} /></td>
                <td><select name={`instr_${m.module_key}`} defaultValue=""><option value="">Үндсэн багш</option>{trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
              </tr>))}</tbody>
          </table></div>
        </section>
        <section className="panel">
          <h2>Хуваарийн мэдээлэл</h2>
          <div className="form">
            <InstructorPick trainers={trainers} />
            <label className="fld"><span>Байршил</span><input type="text" name="location" placeholder="Proliance сургалтын танхим, Midtown оффис" /></label>
            <label className="fld"><span>Онлайн холбоос (Zoom, Meet){hasOnline ? ' *' : ''}</span><input type="text" name="link" placeholder="https://" required={hasOnline} /></label>
          </div>
        </section>
        <section className="panel">
          <h2>Багтаамж ба бүртгэл</h2>
          <div className="form">
            <label className="fld"><span>Дээд багтаамж (суудал)</span><input type="number" name="max_capacity" defaultValue={12} min={1} required /></label>
            <label className="fld"><span>Доод тал нь (хуваарь явагдах)</span><input type="number" name="min_capacity" defaultValue={0} min={0} /></label>
            <label className="fld"><span>Хүлээлгийн жагсаалтын багтаамж</span><input type="number" name="waitlist_capacity" defaultValue={10} min={0} /></label>
            <label className="fld"><span>Бүртгүүлэх эцсийн өдөр</span><input type="date" name="enroll_deadline" /></label>
            <label className="fld"><span>Бүртгэл цуцлах эцсийн өдөр</span><input type="date" name="drop_deadline" /></label>
            <label className="checks full"><label><input type="checkbox" name="auto_waitlist" defaultChecked /> Суудал чөлөөлөгдвөл хүлээлгийн жагсаалтаас дарааллаар нь автоматаар бүртгэх</label></label>
            <label className="fld full"><span>Нэмэлт мэдээлэл (суралцагчид харагдана)</span><textarea name="notes" rows={2} placeholder="Ж: Хамгаалах хувцас авчирна уу." /></label>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Эцсийн өдрүүдийг оруулаагүй бол эхний хичээл эхлэх хүртэл бүртгүүлж, цуцлах боломжтой.</p>
        </section>
        <div><Submit>Хуваарь гаргах</Submit></div>
      </form>
    </>
  );
}
