'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveDraftAnswers, submitAttempt } from '@/app/actions/exams';

type Q = { text: string; options: string[] };

// Утсанд зориулсан шалгалт: нэг асуулт нэг дэлгэцэнд, хугацаа тоологч, автоматаар хадгалах
export default function ExamRunner({ token, questions, initial, deadline }: { token: string; questions: Q[]; initial: number[]; deadline: number }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<number[]>(() => questions.map((_, i) => initial[i] ?? -1));
  const [i, setI] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const sent = useRef(false);
  const left = Math.max(0, deadline - now);
  const answered = answers.filter(a => a >= 0).length;

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

  function pick(j: number) {
    const a = [...answers]; a[i] = j; setAnswers(a);
    saveDraftAnswers(token, a).catch(() => {});
  }

  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  const q = questions[i];
  return (
    <div className="stack">
      <div className="exam-bar">
        <span className="num"><strong>{i + 1}</strong>/{questions.length}</span>
        <span className={`chip ${left < 60000 ? 'c-crit' : 'c-ok'} num`} style={{ fontSize: '.95rem' }}>⏱ {m}:{String(s).padStart(2, '0')}</span>
      </div>
      <div className="dots">{questions.map((_, k) => (
        <button key={k} type="button" aria-label={`${k + 1}-р асуулт`} className={`dot ${k === i ? 'cur' : ''} ${answers[k] >= 0 ? 'done' : ''}`} onClick={() => setI(k)}>{k + 1}</button>))}
      </div>
      <section className="panel">
        <h2 style={{ fontSize: '1.15rem' }}>{q.text}</h2>
        <div className="stack">
          {q.options.map((o, j) => (
            <button key={j} type="button" className={`opt ${answers[i] === j ? 'sel' : ''}`} onClick={() => pick(j)}>
              <span className="opt-l">{'АБВГД'[j]}</span><span>{o}</span>
            </button>))}
        </div>
      </section>
      {err && <div className="alert err">{err}</div>}
      <div className="exam-nav">
        <button type="button" className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>← Өмнөх</button>
        {i < questions.length - 1
          ? <button type="button" className="btn" onClick={() => setI(i + 1)}>Дараах →</button>
          : <button type="button" className="btn" disabled={pending} onClick={() => setConfirm(true)}>Дуусгах</button>}
      </div>
      {confirm && <div className="notice soft">
        <strong>{answered < questions.length ? `${questions.length - answered} асуултад хариулаагүй байна.` : 'Бүх асуултад хариулсан байна.'} Илгээх үү?</strong>
        <span className="small muted">Илгээсний дараа өөрчлөх боломжгүй.</span>
        <div className="acts" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn" disabled={pending} onClick={submit}>{pending ? 'Илгээж байна…' : 'Илгээх'}</button>
          <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Буцах</button>
        </div>
      </div>}
    </div>
  );
}
