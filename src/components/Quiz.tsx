'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitQuiz, QuizResult } from '@/app/actions/learner';

export default function Quiz({ courseId, moduleKey, questions, passScore, best }: {
  courseId: string; moduleKey: string; questions: { text: string; options: string[] }[]; passScore: number; best: number | null;
}) {
  const [answers, setAnswers] = useState<number[]>(Array(questions.length).fill(-1));
  const [res, setRes] = useState<QuizResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ready = answers.every(a => a >= 0);

  function submit() {
    start(async () => {
      const r = await submitQuiz(courseId, moduleKey, answers);
      setRes(r);
      if ('passed' in r && r.passed) router.refresh();
    });
  }

  return (
    <div className="stack">
      {best !== null && <div className="alert ok">Та энэ тестэд {best}% авч тэнцсэн. Дахин өгч болно.</div>}
      {questions.map((q, i) => {
        const wrong = res && 'wrong' in res && res.wrong.includes(i);
        return (
          <fieldset key={i} className="q" style={{ border: 0, margin: 0, padding: '14px 0' }}>
            <legend style={{ fontWeight: 700, padding: 0 }}>{i + 1}. {q.text} {wrong && <span className="chip c-crit" style={{ marginLeft: 6 }}>Буруу</span>}</legend>
            {q.options.map((o, j) => (
              <label key={j} className="checks" style={{ gap: 8 }}>
                <input type="radio" name={`q${i}`} checked={answers[i] === j} onChange={() => { const a = [...answers]; a[i] = j; setAnswers(a); setRes(null); }} /> {o}
              </label>
            ))}
          </fieldset>
        );
      })}
      {res && 'error' in res && <div className="alert err">{res.error}</div>}
      {res && 'passed' in res && (res.passed
        ? <div className="alert ok">Баяр хүргэе! {res.score}% авч тэнцлээ.</div>
        : <div className="alert err">{res.score}% авлаа. Тэнцэхэд {res.passScore}% хэрэгтэй. Буруу хариултаа засаад дахин илгээнэ үү.</div>)}
      <div className="acts" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" disabled={!ready || pending} onClick={submit}>{pending ? 'Шалгаж байна…' : 'Хариулт илгээх'}</button>
        <span className="small muted">Тэнцэх оноо: {passScore}%</span>
      </div>
    </div>
  );
}
