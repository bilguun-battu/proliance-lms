'use client';
import { useMemo, useState } from 'react';
import Submit from './Submit';

type Staff = { id: string; name: string; position: string | null };
type NewP = { name: string; position: string; email: string; phone: string };

const KINDS: [string, string, string][] = [
  ['NEW_STAFF', 'Шинэ ажилтны сургалт', 'Шинээр ажилд орсон хүмүүсийг бүртгүүлж, сургалтад хамруулах'],
  ['RETRAIN', 'Давтан сургалт', 'Өмнө нь хамрагдсан ажилтнуудыг дахин сургах'],
  ['ADDITIONAL', 'Нэмэлт сургалт', 'Шинэ тоног төхөөрөмж, нэмэлт хичээл, манай байгууллага дээр зохион байгуулах'],
  ['OTHER', 'Бусад', 'Сургалттай холбоотой бусад хүсэлт'],
];
const blank = (): NewP => ({ name: '', position: '', email: '', phone: '' });

export default function RequestForm({ action, courses, staff, status, init }: {
  action: (fd: FormData) => void; courses: { id: string; title: string }[]; staff: Staff[];
  status: Record<string, string>; // "userId|courseId" → заавал сургалтын төлөв
  init: { kind?: string; course?: string; users?: string[] };
}) {
  const [kind, setKind] = useState(init.kind && KINDS.some(k => k[0] === init.kind) ? init.kind : 'NEW_STAFF');
  const [course, setCourse] = useState(init.course ?? '');
  const [picked, setPicked] = useState<string[]>(init.users ?? []);
  const [fresh, setFresh] = useState<NewP[]>([blank()]);
  const [q, setQ] = useState('');
  const list = useMemo(() => staff.filter(p => !q || `${p.name} ${p.position ?? ''}`.toLowerCase().includes(q.toLowerCase())), [staff, q]);
  const showNew = kind === 'NEW_STAFF' || kind === 'ADDITIONAL' || kind === 'OTHER';
  const showStaff = kind !== 'NEW_STAFF';
  const needCourse = kind === 'NEW_STAFF' || kind === 'RETRAIN';
  const total = (showStaff ? picked.length : 0) + (showNew ? fresh.filter(p => p.name.trim()).length : 0);
  const set = (i: number, k: keyof NewP, v: string) => setFresh(f => f.map((p, j) => j === i ? { ...p, [k]: v } : p));

  return (
    <form action={action} className="stack">
      <section className="panel">
        <h2>1. Юу хүсэх вэ?</h2>
        <div className="rq-kinds" role="radiogroup">{KINDS.map(([k, l, d]) => (
          <label key={k} className={`rq-kind ${kind === k ? 'on' : ''}`}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
            <strong>{l}</strong><span className="small muted">{d}</span>
          </label>))}</div>
        <label className="fld"><span>Сургалт{needCourse ? '' : ' (байвал)'}</span>
          <select name="course_id" value={course} onChange={e => setCourse(e.target.value)} required={needCourse}>
            <option value="">{needCourse ? 'Сонгоно уу' : 'Жагсаалтад байхгүй / тодорхойгүй'}</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select></label>
        {(kind === 'ADDITIONAL' || kind === 'OTHER') && <label className="fld"><span>Сэдэв</span>
          <input name="topic" placeholder="Ж: Шинээр авсан Sysmex XN-1000 анализаторын сургалт" /></label>}
      </section>

      {showStaff && <section className="panel">
        <div className="head"><h2>2. {kind === 'RETRAIN' ? 'Давтан хамрагдах ажилтнууд' : 'Хамрагдах ажилтнууд (байвал)'}</h2>
          <span className="small muted">{picked.length} сонгосон</span></div>
        {staff.length > 6 && <input type="search" placeholder="Нэр, албан тушаалаар хайх" value={q} onChange={e => setQ(e.target.value)} />}
        <div className="rq-staff">{list.map(p => {
          const st = course ? status[`${p.id}|${course}`] : undefined;
          return <label key={p.id} className="rq-person">
            <input type="checkbox" name="user_ids" value={p.id} checked={picked.includes(p.id)}
              onChange={e => setPicked(x => e.target.checked ? [...x, p.id] : x.filter(y => y !== p.id))} />
            <span><strong>{p.name}</strong><span className="small muted">{p.position ?? '—'}{st ? ` · ${st}` : ''}</span></span>
          </label>;
        })}
          {!list.length && <p className="small muted">Ажилтан олдсонгүй.</p>}</div>
      </section>}

      {showNew && <section className="panel">
        <h2>{showStaff ? '3' : '2'}. {kind === 'NEW_STAFF' ? 'Шинэ ажилтнууд' : 'Системд бүртгэлгүй хүмүүс (байвал)'}</h2>
        {kind === 'NEW_STAFF' && <p className="small muted">Имэйлийг нь оруулбал Proliance системийн эрх үүсгэж, урилга илгээнэ. Ажилтан аль хэдийн системд бүртгэлтэй бол "Давтан сургалт" эсвэл "Нэмэлт сургалт"-аар сонгоно уу.</p>}
        <div className="stack">{fresh.map((p, i) => (
          <div key={i} className="rq-new">
            <label className="fld"><span>Нэр</span><input name="new_name" value={p.name} onChange={e => set(i, 'name', e.target.value)} required={kind === 'NEW_STAFF' && i === 0} /></label>
            <label className="fld"><span>Албан тушаал</span><input name="new_position" value={p.position} onChange={e => set(i, 'position', e.target.value)} /></label>
            <label className="fld"><span>Имэйл</span><input type="email" name="new_email" value={p.email} onChange={e => set(i, 'email', e.target.value)} /></label>
            <label className="fld"><span>Утас</span><input type="tel" name="new_phone" value={p.phone} onChange={e => set(i, 'phone', e.target.value)} /></label>
            {fresh.length > 1 && <button type="button" className="btn sm ghost" onClick={() => setFresh(f => f.filter((_, j) => j !== i))} aria-label={`${i + 1}-р мөрийг хасах`}>Хасах</button>}
          </div>))}</div>
        <div><button type="button" className="btn sm ghost" onClick={() => setFresh(f => [...f, blank()])}>+ Хүн нэмэх</button></div>
      </section>}

      <section className="panel">
        <h2>{showStaff && showNew ? '4' : '3'}. Хэлбэр, хугацаа</h2>
        <div className="form">
          <label className="fld"><span>Хаана</span><select name="format" defaultValue="ANY">
            <option value="ANY">Аль нь ч болно</option><option value="INPERSON">Proliance-ийн танхимд</option>
            <option value="ONSITE">Манай байгууллага дээр</option><option value="ONLINE">Онлайнаар</option></select></label>
          <label className="fld"><span>Боломжтой хугацаа: эхлэх</span><input type="date" name="preferred_from" /></label>
          <label className="fld"><span>дуусах</span><input type="date" name="preferred_to" /></label>
        </div>
        <label className="fld"><span>Нэмэлт тайлбар</span><textarea name="note" required={kind === 'OTHER'}
          placeholder="Ж: Шөнийн ээлжийн ажилтнууд тул 14:00-өөс хойш боломжтой. Хоёр ажилтан маань анализатор дээр анх удаа ажиллана." /></label>
      </section>

      <div className="acts" style={{ justifyContent: 'flex-start' }}>
        <Submit>Хүсэлт илгээх{total ? ` (${total} хүн)` : ''}</Submit>
        <span className="small muted">Proliance хариу өгөхөд мэдэгдэл болон имэйлээр мэдэгдэнэ.</span>
      </div>
    </form>
  );
}
