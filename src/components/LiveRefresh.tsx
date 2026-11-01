'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Шалгалт явж байх үед үр дүнг 5 секунд тутам шинэчилж, үлдсэн хугацааг харуулна
export default function LiveRefresh({ until, active }: { until: string; active: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, new Date(until).getTime() - now);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    const r = setInterval(() => router.refresh(), 5000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [active, router]);
  useEffect(() => { if (active && left === 0) router.refresh(); }, [active, left === 0, router]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!active) return null;
  if (left === 0) return <span className="chip c-crit">Хугацаа дууслаа</span>;
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return <span className="chip c-ok" style={{ fontSize: '1rem', padding: '4px 14px' }}>Холбоос хаагдахад: {m}:{String(s).padStart(2, '0')}</span>;
}
