'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

type Hit = {
  kind: 'CHUNK' | 'FAQ'; courseId: string | null; courseTitle: string; moduleKey: string | null; source: string;
  docTitle: string; heading: string; page: number | null; answer: string; context: string; question?: string; confidence: number; terms: string[];
};
type Turn = { q: string; id?: string; answered?: boolean; hits?: Hit[]; err?: string; helpful?: boolean };

const SRC: Record<string, string> = { PDF: 'Гарын авлага', MODULE: 'Модулийн тайлбар', COURSE: 'Сургалтын тайлбар', FAQ: 'Түгээмэл асуулт' };
const conf = (c: number) => c >= 0.75 ? ['Өндөр таарц', 'ok'] : c >= 0.55 ? ['Дунд таарц', 'info'] : ['Бага таарц', 'warn'];

// Үгсийн таарц (сервер дээрхтэй адил, src/lib/kb.ts)
function ms(t: string, d: string) {
  if (d === t) return 1;
  const mn = Math.min(t.length, d.length);
  if (mn >= 3 && Math.abs(t.length - d.length) <= 2 && (d.startsWith(t) || t.startsWith(d))) return 1;
  let cp = 0; while (cp < mn && t[cp] === d[cp]) cp++;
  return mn >= 4 && cp >= 3 && cp >= mn - 1 ? 0.6 : 0;
}
// Асуултын үгстэй таарах үгсийг тодруулна (эхний 5 үсгээр)
function Mark({ text, terms }: { text: string; terms: string[] }) {
  const parts = text.split(/([0-9A-Za-zА-Яа-яЁёӨөҮү]+)/);
  return <>{parts.map((p, i) => {
    const w = p.toLowerCase().replace(/ё/g, 'е').slice(0, 5);
    const hit = w.length > 1 && terms.some(t => ms(t, w) > 0);
    return hit ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>;
  })}</>;
}

function href(h: Hit) {
  if (!h.courseId) return null;
  if (!h.moduleKey) return `/portal/courses/${h.courseId}`;
  return `/portal/courses/${h.courseId}/m/${h.moduleKey}${h.page ? `?page=${h.page}` : ''}`;
}

function Source({ h, links }: { h: Hit; links: boolean }) {
  const l = links ? href(h) : null;
  const label = <>{SRC[h.source]}{h.kind === 'CHUNK' && <> · {h.docTitle}</>}{h.heading && h.source === 'PDF' ? <> · {h.heading}</> : null}{h.page ? <> · {h.page}-р хуудас</> : null}</>;
  return <div className="ask-src small">
    <span aria-hidden="true">{h.source === 'PDF' ? '📄' : h.source === 'FAQ' ? '💡' : '📘'}</span>
    <span>{l ? <Link className="link" href={l}>{label}</Link> : label}{h.courseTitle && <span className="muted"> · {h.courseTitle}</span>}</span>
  </div>;
}

function Answer({ t, onRate, links }: { t: Turn; onRate: (v: boolean) => void; links: boolean }) {
  const [open, setOpen] = useState(false);
  if (t.err) return <div className="ask-a"><div className="alert err">{t.err}</div></div>;
  if (!t.hits) return <div className="ask-a"><span className="ask-typing" aria-label="Хайж байна"><i /><i /><i /></span></div>;
  if (!t.answered) return <div className="ask-a">
    <p><strong>Сургалтын материалаас энэ асуултад тохирох хариулт олдсонгүй.</strong></p>
    <p className="small muted">Асуултаа өөр үгээр, жишээ нь тоног төхөөрөмж, үйлдлийн нэрийг оруулж бичээд үзнэ үү. Таны асуулт сургалтын админд очсон тул хариултыг материалд нэмж оруулна.</p>
  </div>;
  const [top, ...rest] = t.hits;
  const [cl, ct] = conf(top.confidence);
  return <div className="ask-a">
    <div className="ask-ahead"><span className="small muted">{top.kind === 'FAQ' ? 'Бэлтгэсэн хариулт' : 'Материалаас олдсон хамгийн тохирох хэсэг'}</span><span className={`chip c-${ct}`}>{cl}</span></div>
    {top.question && <p className="small"><strong>{top.question}</strong></p>}
    <blockquote className="ask-quote"><Mark text={top.answer} terms={top.terms} /></blockquote>
    <Source h={top} links={links} />
    {top.kind === 'CHUNK' && top.context !== top.answer && <>
      <button type="button" className="linkbtn small" style={{ justifySelf: "start" }} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Хураах' : 'Тэр хэсгийг бүтнээр нь харах'}</button>
      {open && <p className="small ask-ctx"><Mark text={top.context} terms={top.terms} /></p>}
    </>}
    {rest.length > 0 && <details className="ask-more"><summary className="small">Холбоотой бусад {rest.length} хэсэг</summary>
      {rest.map((h, i) => <div key={i} className="ask-alt"><p className="small"><Mark text={h.answer} terms={h.terms} /></p><Source h={h} links={links} /></div>)}
    </details>}
    <div className="ask-rate small">
      {t.helpful === undefined ? <>
        <span className="muted">Хариулт тус болсон уу?</span>
        <button type="button" className="btn ghost sm" onClick={() => onRate(true)}>👍 Тийм</button>
        <button type="button" className="btn ghost sm" onClick={() => onRate(false)}>👎 Үгүй</button>
      </> : <span className="muted">{t.helpful ? 'Баярлалаа!' : 'Баярлалаа. Сургалтын админ энэ асуултыг хянаж, хариултыг сайжруулна.'}</span>}
    </div>
  </div>;
}

export default function AskAssistant({ courses, initialCourse, examples, links = true }: {
  courses: { id: string; title: string }[]; initialCourse: string; examples: string[]; links?: boolean;
}) {
  const [course, setCourse] = useState(initialCourse);
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (turns.length) end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [turns]);

  async function ask(text: string) {
    const question = text.trim();
    if (question.length < 3 || busy) return;
    setBusy(true); setQ('');
    const i = turns.length;
    setTurns(t => [...t, { q: question }]);
    try {
      const r = await fetch(`${base}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: question, course: course || null }) });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setTurns(t => t.map((x, j) => j === i ? { ...x, ...d } : x));
    } catch (e: any) {
      setTurns(t => t.map((x, j) => j === i ? { ...x, err: e?.message || 'Алдаа гарлаа. Дахин оролдоно уу.' } : x));
    } finally { setBusy(false); }
  }
  async function rate(i: number, helpful: boolean) {
    const id = turns[i].id;
    setTurns(t => t.map((x, j) => j === i ? { ...x, helpful } : x));
    if (id) fetch(`${base}/api/ask`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, helpful }) }).catch(() => {});
  }

  return (
    <div className="ask">
      <div className="ask-log" aria-live="polite">
        {!turns.length && <div className="ask-intro">
          <p className="small muted">Асуултаа бичихэд туслах таны сургалтын гарын авлага, модулийн тайлбараас хамгийн тохирох хэсгийг олж, эх сурвалжийн хамт харуулна.</p>
          {examples.length > 0 && <div className="ask-ex">{examples.map(e => <button key={e} type="button" className="btn ghost sm" onClick={() => ask(e)}>{e}</button>)}</div>}
        </div>}
        {turns.map((t, i) => <div key={i} className="ask-turn">
          <div className="ask-q">{t.q}</div>
          <Answer t={t} onRate={v => rate(i, v)} links={links} />
        </div>)}
        <div ref={end} />
      </div>
      <form className="ask-form" onSubmit={e => { e.preventDefault(); ask(q); }}>
        {courses.length > 1 && <label className="fld ask-scope"><span className="small">Хайх хүрээ</span>
          <select value={course} onChange={e => setCourse(e.target.value)}>
            <option value="">Миний бүх сургалт</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select></label>}
        <div className="ask-in">
          <textarea value={q} onChange={e => setQ(e.target.value)} rows={2} maxLength={500} placeholder="Жишээ нь: Чанарын хяналтыг хэзээ хийх вэ?"
            aria-label="Асуулт" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q); } }} />
          <button className="btn" disabled={busy || q.trim().length < 3}>Асуух</button>
        </div>
      </form>
    </div>
  );
}
