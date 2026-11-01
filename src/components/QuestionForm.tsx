'use client';
import { useState } from 'react';
import Submit from '@/components/Submit';

type Q = { id?: string; section_id: string; text: string; qtype: string; options: string[]; correct: number[]; points: number; image_file: string | null; position?: number };
const TYPES: [string, string, string][] = [
  ['RADIO', 'Нэг сонголт', 'нэг зөв хариулттай'],
  ['CHECKBOX', 'Олон сонголт', 'хэд хэдэн зөв хариулттай, бүгдийг нь зөв сонговол оноо авна'],
  ['SELECT', 'Жагсаалтаас сонгох', 'унждаг жагсаалт, нэг зөв хариулт'],
  ['TEXT', 'Богино бичвэр', 'багш шалгана'],
  ['TEXTAREA', 'Урт бичвэр', 'багш шалгана'],
  ['YESNO', 'Тийм / Үгүй / Тайлбар', 'тийм эсвэл үгүй сонгоод тайлбар бичнэ'],
];
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Шалгалтын асуулт оруулах: төрлөөс хамаарч хариултын хэсэг өөрчлөгдөнө
export default function QuestionForm({ action, examId, q, sections }: {
  action: (fd: FormData) => Promise<void>; examId: string; q: Q; sections: { id: string; position: number }[];
}) {
  const [type, setType] = useState(q.qtype);
  const [correct, setCorrect] = useState<number[]>(q.correct);
  const choice = ['RADIO', 'CHECKBOX', 'SELECT'].includes(type);
  const multi = type === 'CHECKBOX';
  const toggle = (i: number) => setCorrect(multi ? (correct.includes(i) ? correct.filter(x => x !== i) : [...correct, i]) : [i]);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="exam_id" value={examId} />
      {q.id && <input type="hidden" name="question_id" value={q.id} />}
      <section className="panel">
        <div className="form">
          <label className="fld"><span>Бүлэг</span>
            <select name="section_id" defaultValue={q.section_id}>{sections.map(s => <option key={s.id} value={s.id}>Бүлэг {s.position}</option>)}</select></label>
          <label className="fld"><span>Оноо</span><input type="number" name="points" min={0} max={100} defaultValue={q.points} /></label>
          <label className="fld"><span>Дараалал (заавал биш)</span><input type="number" name="position" min={1} defaultValue={q.position} /></label>
        </div>
        <label className="fld"><span>Асуултын текст</span><textarea name="text" rows={4} required defaultValue={q.text} /></label>
        <label className="fld"><span>Асуултад зураг нэмэх (PNG, JPG, WebP, 5MB хүртэл)</span><input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" />
          {q.image_file && <span className="small">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${base}/api/files/${q.image_file}`} alt="" style={{ maxHeight: 120, display: 'block', margin: '6px 0', borderRadius: 8 }} />
            <label><input type="checkbox" name="remove_image" /> зургийг устгах</label></span>}</label>
        <div className="fld"><span>Хариултын төрөл</span>
          <div className="checks col">{TYPES.map(([v, l, h]) => (
            <label key={v}><input type="radio" name="qtype" value={v} checked={type === v} onChange={() => { setType(v); if (v !== 'CHECKBOX') setCorrect(correct.slice(0, 1)); }} /> {l} <span className="small muted">— {h}</span></label>))}
          </div></div>
      </section>

      {choice && <section className="panel">
        <h2>Хариултууд</h2>
        <p className="small muted" style={{ margin: 0 }}>Хоосон мөрийг тооцохгүй. {multi ? 'Бүх зөв хариултыг тэмдэглэнэ.' : 'Нэг зөв хариултыг сонгоно.'}</p>
        <div className="anslist">{Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="ansrow">
            <span className="num">{i + 1}.</span>
            <input type="text" name={`opt${i + 1}`} defaultValue={q.options[i] ?? ''} aria-label={`Хариулт ${i + 1}`} />
            <label className="small"><input type={multi ? 'checkbox' : 'radio'} name={multi ? `c${i + 1}` : 'correct'} value={multi ? 'on' : String(i + 1)}
              checked={correct.includes(i)} onChange={() => toggle(i)} /> Зөв хариулт</label>
          </div>))}</div>
      </section>}

      {type === 'YESNO' && <section className="panel">
        <h2>Зөв хариулт</h2>
        <div className="checks">
          <label><input type="radio" name="yn" value="0" defaultChecked={q.correct[0] === 0} /> Тийм</label>
          <label><input type="radio" name="yn" value="1" defaultChecked={q.correct[0] === 1} /> Үгүй</label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Оролцогч тийм/үгүй сонгоод тайлбар бичнэ. Оноог тийм/үгүйгээр автоматаар өгнө, тайлбарыг багш харна.</p>
      </section>}

      {(type === 'TEXT' || type === 'TEXTAREA') && <div className="notice soft"><span className="small">Бичвэр хариултыг шалгалт илгээсний дараа багш "Шалгах" хэсгээс оноо өгч дүгнэнэ.</span></div>}

      <div className="acts" style={{ justifyContent: 'flex-start' }}>
        <Submit>Хадгалах</Submit>
        {!q.id && <button className="btn ghost" name="again" value="1">Хадгалаад дараагийнхыг нэмэх</button>}
        <a className="btn ghost" href={`${base}/admin/exams/${examId}`}>Буцах</a>
      </div>
    </form>
  );
}
