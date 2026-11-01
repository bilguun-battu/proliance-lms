'use client';
import { useTransition } from 'react';
import { markRead } from '@/app/actions/learner';

export default function MarkRead({ courseId, moduleKey }: { courseId: string; moduleKey: string }) {
  const [pending, start] = useTransition();
  return <button className="btn" disabled={pending} onClick={() => start(() => markRead(courseId, moduleKey))}>{pending ? 'Хадгалж байна…' : 'Уншиж дуусгалаа'}</button>;
}
