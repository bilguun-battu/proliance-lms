import Link from 'next/link';
import { all } from '@/lib/db';
import { listOfferings, offeringSessions } from '@/lib/offerings';
import { Flash } from '@/components/ui';
import { TZ, ymd } from '@/lib/format';
import AudTabs, { audOf, AUD_DB } from '@/components/AudTabs';
import OfferingList from '@/components/OfferingList';
import MonthCalendar from '@/components/MonthCalendar';

export default async function Offerings(
  props: { searchParams: Promise<{ ok?: string; err?: string; show?: string; aud?: string; course?: string; view?: string; m?: string; inst?: string }> }
) {
  const sp = await props.searchParams;
  const aud = audOf(sp.aud);
  const show = sp.show === 'past' || sp.show === 'cancelled' ? sp.show : 'upcoming';
  const view = sp.view === 'cal' ? 'cal' : 'list';
  const where = ['x.audience=$1'], params: unknown[] = [AUD_DB(aud)];
  if (sp.course) { params.push(sp.course); where.push(`x.course_id=$${params.length}`); }
  // Багшаар шүүх: хуваарийн үндсэн багш эсвэл аль нэг хичээлийн багш (бүртгэлтэй хэрэглэгч эсвэл гадны багшийн нэр)
  if (sp.inst?.startsWith('u:')) { params.push(sp.inst.slice(2)); where.push(`(x.instructor_id::text=$${params.length} OR EXISTS (SELECT 1 FROM sessions s WHERE s.offering_id=x.id AND s.instructor_id::text=$${params.length}))`); }
  else if (sp.inst?.startsWith('n:')) { params.push(sp.inst.slice(2)); where.push(`(x.instructor_name=$${params.length} OR EXISTS (SELECT 1 FROM sessions s WHERE s.offering_id=x.id AND s.instructor=$${params.length}))`); }
  if (view === 'list') {
    if (show === 'cancelled') where.push(`x.status='CANCELLED'`);
    else if (show === 'past') where.push(`x.status='SCHEDULED' AND x.last_at < now()`);
    else where.push(`x.status='SCHEDULED' AND (x.last_at IS NULL OR x.last_at >= now() - interval '1 day')`);
  }
  const rows = await listOfferings(where.join(' AND '), params, show === 'upcoming' ? 'first_at ASC NULLS LAST' : 'first_at DESC NULLS LAST');
  const courses = await all<any>(`SELECT DISTINCT c.id, c.title FROM courses c JOIN offerings o ON o.course_id=c.id WHERE c.audience=$1 ORDER BY c.title`, [AUD_DB(aud)]);
  const instructors = await all<{ v: string; name: string }>(`
    SELECT DISTINCT ON (v) v, name FROM (
      SELECT 'u:' || u.id AS v, u.name FROM users u WHERE u.id IN (SELECT instructor_id FROM offerings WHERE instructor_id IS NOT NULL UNION SELECT instructor_id FROM sessions WHERE instructor_id IS NOT NULL)
      UNION ALL SELECT 'n:' || instructor_name, instructor_name || ' (гадны)' FROM offerings WHERE instructor_id IS NULL AND coalesce(instructor_name,'') <> ''
    ) t ORDER BY v`);
  instructors.sort((a, b) => a.name.localeCompare(b.name));
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? sp.m! : ymd(new Date()).slice(0, 7);
  const sess = view === 'cal' ? (await offeringSessions(rows.filter(r => r.status === 'SCHEDULED').map(r => r.id))).filter(s => ymd(s.starts_at).startsWith(month)
    && (!sp.inst || (sp.inst.startsWith('u:') ? s.instructor_id === sp.inst.slice(2) : s.instructor === sp.inst.slice(2)))) : [];
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ aud, show: show === 'upcoming' ? undefined : show, course: sp.course, inst: sp.inst, view: view === 'cal' ? 'cal' : undefined, ...o })) if (v) p.set(k, v);
    return `/admin/sessions?${p}`;
  };
  return (
    <>
      <div className="head">
        <div><h1>Хуваарьт сургалт</h1><p className="muted">Танхимын болон онлайн шууд хичээлтэй сургалтын хуваарь. Суралцагч хуваарьт бүхэлд нь бүртгүүлнэ; суудал дүүрвэл хүлээлгийн жагсаалтад орно. Цаг: {TZ}</p></div>
        <Link className="btn" href={`/admin/sessions/new?aud=${aud}`}>+ Хуваарь гаргах</Link>
      </div>
      <AudTabs base="/admin/sessions" cur={aud} />
      <Flash sp={sp} />
      <div className="acts" style={{ justifyContent: 'space-between' }}>
        <div className="chipnav">
          <Link href={q({ view: undefined })} className={view === 'list' ? 'on' : ''}>Жагсаалт</Link>
          <Link href={q({ view: 'cal', show: undefined })} className={view === 'cal' ? 'on' : ''}>Хуанли</Link>
        </div>
        {view === 'list' && <div className="chipnav">
          <Link href={q({ show: undefined })} className={show === 'upcoming' ? 'on' : ''}>Ирэх</Link>
          <Link href={q({ show: 'past' })} className={show === 'past' ? 'on' : ''}>Өнгөрсөн</Link>
          <Link href={q({ show: 'cancelled' })} className={show === 'cancelled' ? 'on' : ''}>Цуцлагдсан</Link>
        </div>}
        {(courses.length > 1 || instructors.length > 0) && <form className="acts" action={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/admin/sessions`}>
          <input type="hidden" name="aud" value={aud} />{view === 'cal' && <input type="hidden" name="view" value="cal" />}{show !== 'upcoming' && view === 'list' && <input type="hidden" name="show" value={show} />}
          <select name="course" defaultValue={sp.course ?? ''} style={{ width: 'auto' }}><option value="">Бүх сургалт</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
          <select name="inst" defaultValue={sp.inst ?? ''} style={{ width: 'auto' }} aria-label="Багш"><option value="">Бүх багш</option>{instructors.map(i => <option key={i.v} value={i.v}>{i.name}</option>)}</select>
          <button className="btn sm ghost">Шүүх</button></form>}
      </div>
      {view === 'list'
        ? <OfferingList rows={rows} href={id => `/admin/sessions/${id}`} empty={show === 'upcoming' ? 'Ирэх хуваарь алга. "+ Хуваарь гаргах" дарж нэмнэ үү.' : 'Хуваарь алга.'} />
        : <MonthCalendar month={month} link={m => q({ m })} items={sess.map(s => ({ at: s.starts_at, title: s.module, sub: [s.instructor, s.location].filter(Boolean).join(' · '), href: `/admin/sessions/${s.offering_id}#s-${s.id}`, tone: s.format === 'ONLINE' ? 'online' : 'inperson' }))} />}
    </>
  );
}
