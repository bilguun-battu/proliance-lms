'use client';
import { useState } from 'react';

export default function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="acts" style={{ justifyContent: 'center' }}>
      <code style={{ fontSize: '1rem', fontWeight: 700, wordBreak: 'break-all' }}>{url}</code>
      <button type="button" className="btn sm ghost" onClick={async () => { try { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* сонгож хуулна */ } }}>{done ? 'Хуулагдлаа' : 'Хуулах'}</button>
    </div>
  );
}
