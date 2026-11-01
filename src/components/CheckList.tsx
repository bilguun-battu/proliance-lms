'use client';
import { useState } from 'react';

// Урт жагсаалтаас хайж олон мөр сонгох (матриц, оноолт)
export default function CheckList({ name, items, height = 220, placeholder = 'Хайх…' }:
  { name: string; items: { value: string; label: string; hint?: string }[]; height?: number; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const shown = items.filter(i => !q || `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const allOn = shown.length > 0 && shown.every(i => sel.has(i.value));
  const toggle = (v: string) => setSel(s => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  return (
    <div className="checklist">
      <div className="acts" style={{ gap: 8 }}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} style={{ flex: 1 }} />
        <button type="button" className="btn sm ghost" onClick={() => setSel(s => { const n = new Set(s); shown.forEach(i => (allOn ? n.delete(i.value) : n.add(i.value))); return n; })}>{allOn ? 'Болих' : 'Бүгдийг'}</button>
      </div>
      <div className="checklist-box" style={{ maxHeight: height }}>
        {shown.map(i => <label key={i.value}><input type="checkbox" name={name} value={i.value} checked={sel.has(i.value)} onChange={() => toggle(i.value)} /> <span>{i.label}{i.hint && <span className="small muted"> · {i.hint}</span>}</span></label>)}
        {!shown.length && <span className="small muted">Олдсонгүй.</span>}
      </div>
      {/* Хайлтаар нуугдсан ч сонгосон мөрүүдийг илгээнэ */}
      {[...sel].filter(v => !shown.some(i => i.value === v)).map(v => <input key={v} type="hidden" name={name} value={v} />)}
      <span className="small muted">{sel.size} сонгосон</span>
    </div>
  );
}
