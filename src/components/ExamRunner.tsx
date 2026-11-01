'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveDraftAnswers, submitAttempt } from '@/app/actions/exams';

type Answer = number | number[] | string | { c: number; t: string } | null;
type Q = { text: string; qtype: string; options: string[]; image: string | null; section: string | null };
const L = 'АБВГДЕЖЗИК';
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

function answered(q: Q, a: Answer) {
  if (a == null) return false;
  if (q.qtype === 'CHECKBOX') return Array.isArray(a) && a.length > 0;
  if (q.qtype === 'TEXT' || q.qtype === 'TEXTAREA') return typeof a === 'string' && a.trim() !== '';
  if (q.qtype === 'YESNO') return typeof a === 'object' && !Array.isArray(a) && a.c >= 0;
  return typeof a === 'number' && a >= 0;
}

// Утсанд зориулсан шалгалт: нэг асуулт нэг дэлгэцэнд, хугацаа тоологч, автоматаар хадгалах
export default function ExamRunner({ token, questions, initial, deadline }: { token: string; questions: Q[]; initial: Answer[]; deadline: number }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answer[]>(() => questions.map((_, i) => initial[i] ?? null));
  const [i, setI] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const sent = useRef(false);
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const left = Math.max(0, deadline - now);
  const done = questions.filter((q, k) => answered(q, answers[k])).length;

  function submit() {
    if (sent.current) return;
    sent.current = true;
    start(async () => {
      const r = await submitAttempt(token, answers);
      if (r.error) { setErr(r.error); sent.current = false; } else router.refresh();
    });
  }

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (left === 0) submit(); }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(v: Answer, delay = 0) {
    const a = [...answers]; a[i] = v; setAnswers(a);
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(() => { saveDraftAnswers(token, a).catch(() => {}); }, delay);
  }

  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  const q = questions[i];
  const a = answers[i];
  const yn = q.qtype === 'YESNO' && a && typeof a === 'object' && !Array.isArray(a) ? a : { c: -1, t: '' };
  const showSec = q.section && (i === 0 || questions[i - 1].section !== q.section);
  const long = deadline - Date.now() > 24 * 3600000;
  return (
    <div className="stack">
      <div className="exam-bar">
        <span className="num"><strong>{i + 1}</strong>/{questions.length}</span>
        {!long && <span className={`chip ${left < 60000 ? 'c-crit' : 'c-ok'} num`} style={{ fontSize: '.95rem' }}>⏱ {m}:{String(s).padStart(2, '0')}</span>}
      </div>
      <div className="dots">{questions.map((qq, k) => (
        <button key={k} type="button" aria-label={`${k + 1}-р асуулт`} className={`dot ${k === i ? 'cur' : ''} ${answered(qq, answers[k]) ? 'done' : ''}`} onClick={() => setI(k)}>{k + 1}</button>))}
      </div>
      <section className="panel">
        {showSec && <div className="exam-sec">{q.section}</div>}
        <h2 style={{ fontSize: '1.15rem', whiteSpace: 'pre-wrap' }}>{q.text}</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {q.image && <img className="exam-img" src={`${base}/api/files/${q.image}`} alt="" />}
        {q.qtype === 'CHECKBOX' && <p className="small muted" style={{ margin: 0 }}>Бүх зөв хариултыг сонгоно уу.</p>}
        {(q.qtype === 'RADIO' || q.qtype === 'CHECKBOX') && <div className="stack">
          {q.options.map((o, j) => {
            const sel = q.qtype === 'CHECKBOX' ? Array.isArray(a) && a.includes(j) : a === j;
            return (
              <button key={j} type="button" className={`opt ${q.qtype === 'CHECKBOX' ? 'multi' : ''} ${sel ? 'sel' : ''}`} aria-pressed={sel}
                onClick={() => {
                  if (q.qtype !== 'CHECKBOX') return set(j);
                  const cur = Array.isArray(a) ? a : [];
                  set(cur.includes(j) ? cur.filter(x => x !== j) : [...cur, j].sort());
                }}>
                <span className="opt-l">{q.qtype === 'CHECKBOX' && sel ? '✓' : L[j]}</span><span>{o}</span>
              </button>);
          })}
        </div>}
        {q.qtype === 'SELECT' && <select value={typeof a === 'number' ? a : -1} onChange={ev => set(Number(ev.target.value))} style={{ padding: 12, fontSize: '1rem' }}>
          <option value={-1} disabled>Сонгоно уу</option>
          {q.options.map((o, j) => <option key={j} value={j}>{o}</option>)}
        </select>}
        {q.qtype === 'TEXT' && <input className="exam-text" type="text" value={typeof a === 'string' ? a : ''} onChange={ev => set(ev.target.value, 800)} placeholder="Хариултаа бичнэ үү" />}
        {q.qtype === 'TEXTAREA' && <textarea className="exam-text" rows={6} value={typeof a === 'string' ? a : ''} onChange={ev => set(ev.target.value, 800)} placeholder="Хариултаа бичнэ үү" />}
        {q.qtype === 'YESNO' && <div className="stack">
          <div className="exam-nav">{q.options.map((o, j) => (
            <button key={j} type="button" className={`opt ${yn.c === j ? 'sel' : ''}`} style={{ justifyContent: 'center' }} onClick={() => set({ c: j, t: yn.t })}>{o}</button>))}</div>
          <textarea className="exam-text" rows={3} value={yn.t} onChange={ev => set({ c: yn.c, t: ev.target.value }, 800)} placeholder="Тайлбар (заавал биш)" />
        </div>}
      </section>
      {err && <div className="alert err">{err}</div>}
      <div className="exam-nav">
        <button type="button" className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>← Өмнөх</button>
        {i < questions.length - 1
          ? <button type="button" className="btn" onClick={() => setI(i + 1)}>Дараах →</button>
          : <button type="button" className="btn" disabled={pending} onClick={() => setConfirm(true)}>Дуусгах</button>}
      </div>
      {confirm && <div className="notice soft">
        <strong>{done < questions.length ? `${questions.length - done} асуултад хариулаагүй байна.` : 'Бүх асуултад хариулсан байна.'} Илгээх үү?</strong>
        <span className="small muted">Илгээсний дараа өөрчлөх боломжгүй.</span>
        <div className="acts" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn" disabled={pending} onClick={submit}>{pending ? 'Илгээж байна…' : 'Илгээх'}</button>
          <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Буцах</button>
        </div>
      </div>}
    </div>
  );
}
