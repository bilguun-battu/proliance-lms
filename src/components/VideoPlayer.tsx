'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Үзсэн хугацааг бодитоор тоолно: урагш гүйлгэсэн хэсэг тооцогдохгүй
export default function VideoPlayer({ src, courseId, moduleKey, start, initialPct }: { src: string; courseId: string; moduleKey: string; start: number; initialPct: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const played = useRef(0);
  const lastT = useRef<number | null>(null);
  const [pct, setPct] = useState(initialPct);
  const done = useRef(initialPct >= 0.9);
  const router = useRouter();

  async function flush() {
    const v = ref.current;
    if (!v || !v.duration) return;
    const delta = played.current;
    played.current = 0;
    try {
      const r = await fetch(`${base}/api/progress`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ courseId, key: moduleKey, position: v.currentTime, delta, duration: v.duration }),
      });
      if (r.ok) {
        const j = await r.json();
        setPct(j.pct);
        if (j.videoOk && !done.current) { done.current = true; router.refresh(); }
      }
    } catch { /* дараагийн удаа дахин илгээнэ */ }
  }

  useEffect(() => {
    const v = ref.current!;
    const onTime = () => {
      const t = v.currentTime;
      if (lastT.current !== null && !v.seeking) {
        const d = t - lastT.current;
        if (d > 0 && d < 2) played.current += d;
      }
      lastT.current = t;
    };
    const onSeek = () => { lastT.current = v.currentTime; };
    const onMeta = () => { if (start > 2 && start < v.duration - 5) v.currentTime = start; };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('seeked', onSeek);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('pause', flush);
    v.addEventListener('ended', flush);
    const iv = setInterval(() => { if (!v.paused) flush(); }, 10000);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(iv);
      v.removeEventListener('timeupdate', onTime); v.removeEventListener('seeked', onSeek); v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('pause', flush); v.removeEventListener('ended', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="player stack">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={ref} src={src} controls controlsList="nodownload" disablePictureInPicture playsInline preload="metadata" onContextMenu={e => e.preventDefault()} />
      <div className="acts" style={{ justifyContent: 'space-between' }}>
        <div className="bar" style={{ maxWidth: 320 }}><span style={{ width: `${Math.round(pct * 100)}%` }} /></div>
        <span className="small muted">Үзсэн: {Math.round(pct * 100)}%{pct < 0.9 ? ' · 90%-ийг үзэхэд дуусна' : ' ✓'}</span>
      </div>
    </div>
  );
}
