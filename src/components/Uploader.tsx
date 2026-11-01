'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Том видео файлыг шууд серверийн диск рүү урсгалаар илгээнэ
export default function Uploader({ moduleId, kind, accept, label }: { moduleId: string; kind: 'video' | 'pdf'; accept: string; label: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState('');

  function upload(file: File) {
    setErr(''); setPct(0);
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${base}/api/upload?module=${moduleId}&kind=${kind}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    xhr.upload.onprogress = e => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setPct(null);
      if (xhr.status >= 200 && xhr.status < 300) router.refresh();
      else setErr(xhr.responseText || 'Байршуулж чадсангүй.');
    };
    xhr.onerror = () => { setPct(null); setErr('Сүлжээний алдаа. Дахин оролдоно уу.'); };
    xhr.send(file);
  }

  return (
    <div className="stack">
      <input ref={input} type="file" accept={accept} hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
      <div><button type="button" className="btn sm ghost" disabled={pct !== null} onClick={() => input.current?.click()}>
        {pct !== null ? `Байршуулж байна… ${pct}%` : label}
      </button></div>
      {err && <div className="alert err">{err}</div>}
    </div>
  );
}
