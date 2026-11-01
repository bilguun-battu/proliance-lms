'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startAttempt } from '@/app/actions/exams';

export default function StartExam({ token }: { token: string }) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  return (
    <div className="stack">
      {err && <div className="alert err">{err}</div>}
      <button className="btn" style={{ padding: '14px 18px', fontSize: '1rem' }} disabled={pending}
        onClick={() => start(async () => { const r = await startAttempt(token); if (r.error) setErr(r.error); else router.refresh(); })}>
        {pending ? 'Бэлтгэж байна…' : 'Шалгалт эхлүүлэх'}
      </button>
    </div>
  );
}
