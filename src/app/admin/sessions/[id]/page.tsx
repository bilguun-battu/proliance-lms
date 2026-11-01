import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all } from '@/lib/db';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { getOffering, offeringSessions } from '@/lib/offerings';
import { updateOffering, updateSessionTime, cancelOfferingAction } from '@/app/actions/offerings';
import { Flash } from '@/components/ui';
import { ymd, hm } from '@/lib/format';
import OfferingManage from '@/components/OfferingManage';
import InstructorPick from '@/components/InstructorPick';
import Submit from '@/components/Submit';

export default async function OfferingPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireUser(...STAFF_ROLES);
  const { id } = await props.params;
  const sp = await props.searchParams;
  const o = await getOffering(id);
  if (!o) notFound();
  const sessions = await offeringSessions([id]);
  const trainers = await all<any>(`SELECT DISTINCT u.id, u.name FROM users u WHERE u.active AND (u.role IN ('TRAINER','TRAINING_ADMIN') OR EXISTS (SELECT 1 FROM trainer_quals q WHERE q.user_id=u.id AND q.course_id=$1)) ORDER BY u.name`, [o.course_id]);
  const started = sessions.some(s => new Date(s.starts_at).getTime() <= Date.now());
  return (
    <>
      <div><Link className="link small" href={`/admin/sessions?aud=${o.audience === 'INTERNAL' ? 'internal' : 'customer'}`}>← Хуваарьт сургалт</Link></div>
      <Flash sp={sp} />
      <OfferingManage id={id} me={me} base="/admin/sessions" examBase="/admin/exams/live" />
      {o.status === 'SCHEDULED' && <details className="panel">
        <summary className="link" style={{ cursor: 'pointer' }}>Хуваарь засах</summary>
        <form action={updateOffering} className="form" style={{ marginTop: 14 }}>
          <input type="hidden" name="offering_id" value={o.id} />
          <InstructorPick trainers={trainers} value={o.instructor_id} extName={o.instructor_id ? null : o.instructor} />
          <label className="fld"><span>Байршил</span><input type="text" name="location" defaultValue={o.location} /></label>
          <label className="fld"><span>Онлайн холбоос</span><input type="text" name="link" defaultValue={o.link ?? ''} /></label>
          <label className="fld"><span>Дээд багтаамж</span><input type="number" name="max_capacity" defaultValue={o.max_capacity} min={1} /></label>
          <label className="fld"><span>Доод тал нь</span><input type="number" name="min_capacity" defaultValue={o.min_capacity} min={0} /></label>
          <label className="fld"><span>Хүлээлгийн багтаамж</span><input type="number" name="waitlist_capacity" defaultValue={o.waitlist_capacity} min={0} /></label>
          <label className="fld"><span>Бүртгүүлэх эцсийн өдөр</span><input type="date" name="enroll_deadline" defaultValue={o.enroll_deadline ? ymd(o.enroll_deadline) : ''} /></label>
          <label className="fld"><span>Цуцлах эцсийн өдөр</span><input type="date" name="drop_deadline" defaultValue={o.drop_deadline ? ymd(o.drop_deadline) : ''} /></label>
          <label className="checks full"><label><input type="checkbox" name="auto_waitlist" defaultChecked={o.auto_waitlist} /> Суудал чөлөөлөгдвөл хүлээлгээс автоматаар бүртгэх</label></label>
          <label className="fld full"><span>Нэмэлт мэдээлэл</span><textarea name="notes" rows={2} defaultValue={o.notes} /></label>
          <div><Submit>Хадгалах</Submit></div>
        </form>
        <h3 style={{ marginTop: 18 }}>Хичээлийн цаг өөрчлөх</h3>
        {sessions.map(s => (
          <form key={s.id} action={updateSessionTime} className="form" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <input type="hidden" name="session_id" value={s.id} />
            <div className="fld"><span>Хичээл</span><strong>{s.module}</strong></div>
            <label className="fld"><span>Огноо</span><input type="date" name="date" defaultValue={ymd(s.starts_at)} required /></label>
            <label className="fld"><span>Цаг</span><input type="time" name="time" defaultValue={hm(s.starts_at)} required /></label>
            <label className="fld"><span>Үргэлжлэх (мин)</span><input type="number" name="duration_min" defaultValue={s.duration_min} min={15} /></label>
            <label className="fld"><span>Багш</span><select name="instructor_id" defaultValue={s.instructor_id === o.instructor_id ? '' : s.instructor_id ?? ''}>
              <option value="">Үндсэн багш</option>{trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <div><Submit className="btn sm ghost">Хадгалах</Submit></div>
          </form>))}
      </details>}
      {o.status === 'SCHEDULED' && !started && <form action={cancelOfferingAction}>
        <input type="hidden" name="offering_id" value={o.id} />
        <Submit className="btn sm danger" confirmText="Хуваарийг цуцалж, бүртгэгдсэн болон хүлээлгийн жагсаалтад байгаа хүмүүст мэдэгдэх үү?">Хуваарь цуцлах</Submit>
      </form>}
    </>
  );
}
