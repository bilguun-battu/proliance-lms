'use client';
import { useState } from 'react';

type P = { id: string; code: string; name: string; on?: boolean };
type C = { id: string; title: string; audience: string; on?: boolean };

const CATS: [string, string, string, boolean][] = [
  ['ELEARN', 'Цахим сургалт', 'Бие даан үзэх видео, PDF гарын авлага, тест', false],
  ['ONLINE', 'Онлайн шууд сургалт', 'Багш онлайнаар цагийн хуваарьтай заана', false],
  ['INPERSON', 'Танхимын сургалт', 'Багш биечлэн заана, ирц, QR шалгалттай', false],
  ['BLENDED', 'Хосолсон сургалт', 'Цахим, танхим, онлайн модулийг хослуулна', false],
  ['OJT', 'On the Job (OJT)', 'Ажлын байран дээр даалгавар гүйцэтгэж, хянагч баталгаажуулна', true],
  ['VOC', 'Verification of Competency (VoC)', 'Үнэлэгч ур чадварыг шалгуураар баталгаажуулна', true],
  ['TTT', 'Train the Trainer (TtT)', 'Дуусгасан хүн сонгосон сургалтуудыг заах, үнэлэх эрх авна', true],
];

// Сургалтын хүрээ (дотоод / харилцагч), төрөл, бүтээгдэхүүн, TtT-ийн эрх олгох сургалтууд
export default function CourseSetupFields({ products, courses, audience = 'CUSTOMER', category = 'ELEARN', selfId }: { products: P[]; courses: C[]; audience?: string; category?: string; selfId?: string }) {
  const [aud, setAud] = useState(audience);
  const [cat, setCat] = useState(category);
  return (
    <>
      <div className="fld full"><span className="fmt">Хэнд зориулсан</span>
        <div className="checks">
          <label><input type="radio" name="audience" value="CUSTOMER" checked={aud === 'CUSTOMER'} onChange={() => { setAud('CUSTOMER'); if (['OJT', 'VOC', 'TTT'].includes(cat)) setCat('ELEARN'); }} /> Харилцагч байгууллагын ажилтнууд</label>
          <label><input type="radio" name="audience" value="INTERNAL" checked={aud === 'INTERNAL'} onChange={() => setAud('INTERNAL')} /> Proliance-ийн ажилтнууд (дотоод)</label>
        </div>
        <span className="small muted">Дотоод болон харилцагчийн сургалт хоорондоо холилдохгүй: нэг нь нөгөөд харагдахгүй, оноогдохгүй.</span>
      </div>
      <div className="fld full"><span className="fmt">Сургалтын төрөл</span>
        <div className="stack" style={{ gap: 6 }}>{CATS.filter(([, , , internalOnly]) => aud === 'INTERNAL' || !internalOnly).map(([v, l, d]) => (
          <label key={v} className="checks" style={{ alignItems: 'flex-start' }}><label style={{ alignItems: 'flex-start' }}>
            <input type="radio" name="category" value={v} checked={cat === v} onChange={() => setCat(v)} style={{ marginTop: 4 }} />
            <span><strong>{l}</strong> <span className="small muted">— {d}</span></span></label></label>))}
        </div>
      </div>
      {aud === 'CUSTOMER' && <div className="fld full"><span className="fmt">Холбогдох бүтээгдэхүүн (худалдаж авсан байгууллагад нээгдэнэ)</span>
        <div className="checks">{products.map(p => <label key={p.id}><input type="checkbox" name="products" value={p.id} defaultChecked={p.on} /> <span className="num">{p.code}</span> · {p.name}</label>)}</div>
      </div>}
      {cat === 'TTT' && <div className="fld full"><span className="fmt">Дуусгасан хүнд аль сургалтыг заах/үнэлэх эрх олгох вэ</span>
        <div className="checks">{courses.filter(c => c.id !== selfId).map(c => <label key={c.id}><input type="checkbox" name="targets" value={c.id} defaultChecked={c.on} /> {c.title} <span className="small muted">({c.audience === 'INTERNAL' ? 'дотоод' : 'харилцагч'})</span></label>)}</div>
      </div>}
    </>
  );
}
