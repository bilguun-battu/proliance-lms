'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { enrollSelf, dropSelf } from '@/app/actions/offerings';

type S = { when: string; module: string; format: string; location: string; mine: boolean };
type O = {
  id: string; code: string; location: string; instructor: string | null; notes: string; link: string | null; left: number; waitLeft: number;
  canEnroll: boolean; canDrop: boolean; enrollBy: string | null; dropBy: string | null; my: string | null; waitPos: number | null; sessions: S[];
};
const FMT: Record<string, string> = { INPERSON: 'Танхим', ONLINE: 'Онлайн шууд' };

// Хуваарь сонгож бүртгүүлэх: суудал дүүрсэн бол хүлээлгийн жагсаалтад орно
export default function OfferingPicker({ offerings }: { offerings: O[] }) {
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const act = (fn: () => Promise<{ error?: string; ok?: string }>) => start(async () => { setMsg(await fn()); router.refresh(); });
  if (!offerings.length) return <p className="muted">Ирэх хуваарь одоогоор зарлагдаагүй байна. Хуваарь гарахад танд мэдэгдэнэ.</p>;
  const enrolled = offerings.find(o => o.my === 'ENROLLED' || o.my === 'COMPLETED');
  return (
    <div className="stack">
      {msg.error && <div className="alert err">{msg.error}</div>}
      {msg.ok && <div className="alert ok">{msg.ok}</div>}
      {offerings.map(o => (
        <div key={o.id} className={`opick ${o.my === 'ENROLLED' ? 'is-mine' : o.my === 'WAITLISTED' ? 'is-wait' : ''}`}>
          <div className="opick-h">
            <div><span className="small muted num">{o.code}</span> <strong>{o.location}</strong>{o.instructor && <span className="small muted"> · Багш: {o.instructor}</span>}</div>
            {o.my === 'ENROLLED' ? <span className="chip c-ok">Бүртгэгдсэн</span>
              : o.my === 'WAITLISTED' ? <span className="chip c-warn">Хүлээлгийн жагсаалтад · {o.waitPos}-р</span>
              : o.my === 'COMPLETED' ? <span className="chip c-ok">Дүүргэсэн</span>
              : o.left > 0 ? <span className="chip c-info">{o.left} суудал үлдсэн</span>
              : o.waitLeft > 0 ? <span className="chip c-warn">Суудал дүүрсэн · хүлээлгийн жагсаалт нээлттэй</span>
              : <span className="chip c-crit">Дүүрсэн</span>}
          </div>
          <ol className="opick-s">{o.sessions.map((s, i) => (
            <li key={i} className={s.mine ? 'mine' : ''}><span className="num">{s.when}</span><span>{s.module}</span><span className="small muted">{FMT[s.format] ?? ''}</span></li>))}</ol>
          {o.notes && <p className="small muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{o.notes}</p>}
          {o.link && <a className="link small" href={o.link} target="_blank" rel="noreferrer">Онлайн хичээлд нэгдэх холбоос</a>}
          <div className="acts" style={{ justifyContent: 'space-between' }}>
            <span className="small muted">{o.my ? (o.canDrop ? `Цуцлах эцсийн хугацаа: ${o.dropBy}` : 'Цуцлах хугацаа дууссан') : o.canEnroll ? `Бүртгүүлэх эцсийн хугацаа: ${o.enrollBy}` : 'Бүртгэл хаагдсан'}</span>
            {o.my === 'ENROLLED' || o.my === 'WAITLISTED'
              ? o.canDrop && <button className="btn sm ghost" disabled={pending} onClick={() => { if (confirm(o.my === 'WAITLISTED' ? 'Хүлээлгийн жагсаалтаас гарах уу?' : 'Бүртгэлээ цуцлах уу?')) act(() => dropSelf(o.id)); }}>{o.my === 'WAITLISTED' ? 'Жагсаалтаас гарах' : 'Бүртгэл цуцлах'}</button>
              : o.canEnroll && (o.left > 0 || o.waitLeft > 0) && <button className="btn sm" disabled={pending}
                  onClick={() => { if (!enrolled || confirm(o.left > 0 ? `Та ${enrolled.code} хуваарьт бүртгэлтэй байна. Энэ хуваарь руу шилжих үү?` : `${enrolled.code} хуваарийн бүртгэл тань хэвээр үлдэнэ. Энд суудал гарвал автоматаар шилжинэ. Хүлээлгийн жагсаалтад орох уу?`)) act(() => enrollSelf(o.id)); }}>
                  {o.left > 0 ? (enrolled ? 'Энэ хуваарь руу шилжих' : 'Бүртгүүлэх') : 'Хүлээлгийн жагсаалтад орох'}</button>}
          </div>
        </div>))}
    </div>
  );
}
