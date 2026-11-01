'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
const DWELL_MS = 1500; // хуудас дэлгэцэнд дор хаяж 1.5 секунд харагдсан байж "үзсэн" болно

// PDF-ийг хуудас хуудсаар нь харуулж, дэлгэцэнд гарсан хуудсуудыг тоолно.
// Цахим хичээлд бүх хуудсыг үзэж байж материал дууссанд тооцогдоно.
export default function PdfViewer({ fileId, courseId, moduleKey, track, initialSeen }:
  { fileId: string; courseId: string; moduleKey: string; track: boolean; initialSeen: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [total, setTotal] = useState(0);
  const [seenCount, setSeenCount] = useState(initialSeen);
  const [err, setErr] = useState('');
  const seen = useRef(new Set<number>());
  const pending = useRef(new Set<number>());
  const done = useRef(false);
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    let doc: any;
    let io: IntersectionObserver | undefined;
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    const rendered = new Set<number>();
    let sendT: ReturnType<typeof setTimeout> | undefined;

    async function send(n: number) {
      if (!track || !pending.current.size) return;
      const pages = [...pending.current]; pending.current.clear();
      try {
        const r = await fetch(`${base}/api/pdf-progress`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
          body: JSON.stringify({ courseId, key: moduleKey, pages, total: n }),
        });
        if (r.ok) {
          const j = await r.json();
          if (alive) setSeenCount(j.seen);
          if (j.pdfOk && !done.current) { done.current = true; router.refresh(); }
        } else pages.forEach(p => pending.current.add(p));
      } catch { pages.forEach(p => pending.current.add(p)); }
    }

    (async () => {
      try {
        const pdfjs: any = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.mjs`;
        doc = await pdfjs.getDocument({ url: `${base}/api/files/${fileId}`, withCredentials: true }).promise;
        if (!alive) return;
        const n = doc.numPages;
        setTotal(n);
        const first = await doc.getPage(1);
        const vp0 = first.getViewport({ scale: 1 });
        const root = box.current!;
        root.innerHTML = '';
        const els: HTMLDivElement[] = [];
        for (let i = 1; i <= n; i++) {
          const el = document.createElement('div');
          el.className = 'pdfv-page';
          el.dataset.page = String(i);
          el.style.aspectRatio = `${vp0.width} / ${vp0.height}`;
          const num = document.createElement('span'); num.className = 'pdfv-num'; num.textContent = `${i} / ${n}`;
          el.appendChild(num);
          root.appendChild(el); els.push(el);
        }
        const render = async (i: number) => {
          if (rendered.has(i)) return;
          rendered.add(i);
          const page = await doc.getPage(i);
          const el = els[i - 1];
          const w = el.clientWidth || 800;
          const vp1 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (w / vp1.width) * Math.min(2, window.devicePixelRatio || 1) });
          el.style.aspectRatio = `${vp1.width} / ${vp1.height}`;
          const c = document.createElement('canvas');
          c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
          el.insertBefore(c, el.firstChild);
          await page.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c }).promise;
        };
        const markSeen = (i: number) => {
          if (seen.current.has(i)) return;
          seen.current.add(i); pending.current.add(i);
          els[i - 1].classList.add('seen');
          clearTimeout(sendT);
          sendT = setTimeout(() => send(n), seen.current.size >= n ? 0 : 1200);
        };
        io = new IntersectionObserver(entries => {
          for (const e of entries) {
            const i = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) render(i).catch(() => {});
            // Хуудасны ихэнх хэсэг (эсвэл дэлгэцийн ихэнхийг эзэлсэн) харагдаж байвал үзэж байна гэж тооцно
            const visible = e.intersectionRatio >= 0.5 || (e.intersectionRect.height >= (e.rootBounds?.height ?? 1) * 0.6);
            if (visible && !seen.current.has(i) && !timers.has(i)) timers.set(i, setTimeout(() => { timers.delete(i); markSeen(i); }, DWELL_MS));
            if (!visible && timers.has(i)) { clearTimeout(timers.get(i)); timers.delete(i); }
          }
        }, { root, threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '200px 0px' });
        els.forEach(el => io!.observe(el));
      } catch {
        if (alive) setErr('PDF файлыг нээж чадсангүй. Хуудсыг дахин ачаална уу.');
      }
    })();
    return () => {
      alive = false; io?.disconnect(); timers.forEach(t => clearTimeout(t)); clearTimeout(sendT);
      if (pending.current.size && total) send(total);
      doc?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const pct = total ? Math.round((Math.max(seenCount, seen.current.size) / total) * 100) : 0;
  const all = total > 0 && pct >= 100;
  return (
    <div className="stack">
      {err && <div className="alert err">{err}</div>}
      <div ref={box} className="pdfv" aria-label="PDF гарын авлага"><span className="small muted">PDF ачаалж байна…</span></div>
      <div className="pdfv-bar">
        {track ? <>
          <div className="bar" style={{ maxWidth: 320, flex: 1 }}><span style={{ width: `${pct}%` }} /></div>
          <span className="small muted">Үзсэн хуудас: {Math.min(total, Math.max(seenCount, seen.current.size))}/{total || '…'}{all ? ' ✓' : ' · бүх хуудсыг гүйлгэж үзэхэд тооцогдоно'}</span>
        </> : <span />}
        <a className="link small" href={`${base}/api/files/${fileId}`} target="_blank" rel="noreferrer">Шинэ цонхонд нээх</a>
      </div>
    </div>
  );
}
