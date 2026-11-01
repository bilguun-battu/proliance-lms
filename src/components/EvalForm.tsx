'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitEvaluation } from '@/app/actions/evals';

type Q = { id: string; section: string; kind: 'RATING' | 'CHOICE' | 'TEXT'; text: string; options: string[]; required: boolean };
const LABELS = ['Маш муу', 'Муу', 'Дунд', 'Сайн', 'Маш сайн'];

export default function EvalForm({ token, questions }: { token: string; questions: Q[] }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, number | string>>({});
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (id: string, v: number | string) => setVals(x => ({ ...x, [id]: v }));
  const missing = questions.filter(q => q.required && (vals[q.id] === undefined || vals[q.id] === '')).length;
  const sections = Array.from(new Set(questions.map(q => q.section)));
  return (
    <div className="stack">
      {sections.map(sec => (
        <section key={sec} className="panel">
          <h2 className="fmt" style={{ fontSize: '.8rem' }}>{sec}</h2>
          {questions.filter(q => q.section === sec).map(q => (
            <div key={q.id} className="stack" style={{ gap: 8 }}>
              <strong>{q.text}{!q.required && <span className="small muted"> (заавал биш)</span>}</strong>
              {q.kind === 'RATING' && <div className="rate">{[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" className={vals[q.id] === n ? 'sel' : ''} onClick={() => set(q.id, n)} aria-label={`${n} — ${LABELS[n - 1]}`}>
                  <strong>{n}</strong><span>{LABELS[n - 1]}</span>
                </button>))}</div>}
              {q.kind === 'CHOICE' && <div className="stack" style={{ gap: 6 }}>{q.options.map(o => (
                <button key={o} type="button" className={`opt ${vals[q.id] === o ? 'sel' : ''}`} style={{ minHeight: 46, padding: 10 }} onClick={() => set(q.id, o)}>{o}</button>))}</div>}
              {q.kind === 'TEXT' && <textarea rows={3} value={String(vals[q.id] ?? '')} onChange={e => set(q.id, e.target.value)} maxLength={2000} />}
            </div>))}
        </section>))}
      {err && <div className="alert err">{err}</div>}
      <button className="btn" style={{ padding: 14, fontSize: '1rem' }} disabled={pending || missing > 0}
        onClick={() => start(async () => { const r = await submitEvaluation(token, vals); if (r.error) setErr(r.error); else router.refresh(); })}>
        {pending ? 'Илгээж байна…' : missing ? `${missing} асуулт үлдсэн` : 'Үнэлгээ илгээх'}
      </button>
    </div>
  );
}
