'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VideoSource } from '@/lib/video';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Тоглуулагчийн нийтлэг хэрэгцээ: одоогийн байрлал, нийт урт, тоглож байгаа эсэх, байрлал солих
type Engine = { time(): number; duration(): number; playing(): boolean; seek(t: number): void; destroy(): void };

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }
let ytReady: Promise<any> | null = null;
function loadYouTube() {
  if (ytReady) return ytReady;
  ytReady = new Promise(resolve => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return ytReady;
}

// Видеог эхнээс нь дуустал бодитоор үзэхийг шаардана: урагш гүйлгэж алгасахыг хориглож, үзсэн хэсгийг тоолно.
// Өөрийн сервер дээрх файл, өөр сервер дээрх MP4/WebM холбоос, YouTube бичлэг гурвыг дэмжинэ.
export default function VideoPlayer({ source, courseId, moduleKey, start, maxS, initialPct }:
  { source: VideoSource; courseId: string; moduleKey: string; start: number; maxS: number; initialPct: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytRef = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const played = useRef(0);
  const lastT = useRef<number | null>(null);
  const reached = useRef(maxS);
  const [pct, setPct] = useState(initialPct);
  const [warn, setWarn] = useState('');
  const done = useRef(initialPct >= 1);
  const router = useRouter();

  async function flush() {
    const e = engine.current;
    if (!e || !e.duration()) return;
    const delta = played.current;
    played.current = 0;
    try {
      const r = await fetch(`${base}/api/progress`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ courseId, key: moduleKey, position: e.time(), delta, duration: e.duration() }),
      });
      if (r.ok) {
        const j = await r.json();
        setPct(j.pct);
        if (j.videoOk && !done.current) { done.current = true; router.refresh(); }
      }
    } catch { /* дараагийн удаа дахин илгээнэ */ }
  }

  // Байрлал өөрчлөгдөх бүрт: тасралтгүй тоглуулсан бол тоолно, үзээгүй хэсэг рүү үсэрвэл буцаана
  function tick(t: number, seeking = false) {
    const e = engine.current!;
    if (!done.current && t > reached.current + 1.5) {
      e.seek(reached.current);
      lastT.current = reached.current;
      setWarn('Үзээгүй хэсэг рүү гүйлгэх боломжгүй. Видеог эхнээс нь дуустал үзнэ үү.');
      return;
    }
    if (lastT.current !== null && !seeking) {
      const d = t - lastT.current;
      if (d > 0 && d < 2) {
        played.current += d;
        if (t > reached.current) reached.current = t;
      }
    }
    lastT.current = t;
  }

  useEffect(() => {
    let iv: ReturnType<typeof setInterval> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let cleanup = () => {};
    const resume = (dur: number) => (start > 2 && start < dur - 5 ? Math.min(start, reached.current) : 0);

    if (source.kind === 'youtube') {
      let alive = true;
      loadYouTube().then(YT => {
        if (!alive || !ytRef.current) return;
        let p: any;
        const startAt = Math.floor(start > 2 ? Math.min(start, reached.current) : 0);
        p = new YT.Player(ytRef.current, {
          videoId: source.id, width: '100%', height: '100%',
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, start: startAt, origin: window.location.origin },
          events: {
            onReady: () => {
              engine.current = {
                time: () => p.getCurrentTime?.() ?? 0, duration: () => p.getDuration?.() ?? 0,
                playing: () => p.getPlayerState?.() === YT.PlayerState.PLAYING,
                seek: t => p.seekTo(t, true), destroy: () => p.destroy(),
              };
              lastT.current = startAt;
              // YouTube-д timeupdate үйл явдал байхгүй тул 0.25 секунд тутам шалгана
              poll = setInterval(() => { if (engine.current?.playing()) tick(engine.current.time()); }, 250);
            },
            onStateChange: (ev: any) => {
              if (ev.data === YT.PlayerState.PAUSED || ev.data === YT.PlayerState.ENDED) {
                if (engine.current) tick(engine.current.time());
                flush();
              }
              if (ev.data === YT.PlayerState.PLAYING && engine.current) {
                const t = engine.current.time();
                if (!done.current && t > reached.current + 1.5) tick(t); else lastT.current = t;
              }
            },
            onPlaybackRateChange: () => { if (p.getPlaybackRate() > 2) p.setPlaybackRate(2); },
          },
        });
      });
      cleanup = () => { alive = false; engine.current?.destroy(); };
    } else {
      const v = videoRef.current!;
      engine.current = { time: () => v.currentTime, duration: () => v.duration || 0, playing: () => !v.paused, seek: t => { v.currentTime = t; }, destroy: () => {} };
      const onTime = () => tick(v.currentTime, v.seeking);
      const onSeeking = () => { if (!done.current && v.currentTime > reached.current + 1.5) tick(v.currentTime); };
      const onSeeked = () => { lastT.current = v.currentTime; };
      const onMeta = () => { const s = resume(v.duration); if (s) { v.currentTime = s; lastT.current = s; } };
      const onRate = () => { if (v.playbackRate > 2) v.playbackRate = 2; };
      v.addEventListener('timeupdate', onTime); v.addEventListener('seeking', onSeeking); v.addEventListener('seeked', onSeeked);
      v.addEventListener('loadedmetadata', onMeta); v.addEventListener('ratechange', onRate);
      v.addEventListener('pause', flush); v.addEventListener('ended', flush);
      cleanup = () => {
        v.removeEventListener('timeupdate', onTime); v.removeEventListener('seeking', onSeeking); v.removeEventListener('seeked', onSeeked);
        v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('ratechange', onRate);
        v.removeEventListener('pause', flush); v.removeEventListener('ended', flush);
      };
    }
    iv = setInterval(() => { if (engine.current?.playing()) flush(); }, 10000);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(iv); clearInterval(poll);
      document.removeEventListener('visibilitychange', onHide);
      flush();
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!warn) return; const t = setTimeout(() => setWarn(''), 4000); return () => clearTimeout(t); }, [warn]);

  const src = source.kind === 'direct' ? source.url : '';
  return (
    <div className="player stack">
      {source.kind === 'youtube'
        ? <div className="yt-wrap"><div ref={ytRef} /></div>
        // eslint-disable-next-line jsx-a11y/media-has-caption
        : <video ref={videoRef} src={src} controls controlsList="nodownload noplaybackrate" disablePictureInPicture playsInline preload="metadata" onContextMenu={e => e.preventDefault()} />}
      {warn && <div className="alert err small" role="status">{warn}</div>}
      <div className="acts" style={{ justifyContent: 'space-between' }}>
        <div className="bar" style={{ maxWidth: 320 }}><span style={{ width: `${Math.round(pct * 100)}%` }} /></div>
        <span className="small muted">Үзсэн: {Math.floor(pct * 100)}%{pct < 1 ? ' · бүрэн үзэж дуусгахад тооцогдоно' : ' ✓'}</span>
      </div>
    </div>
  );
}
