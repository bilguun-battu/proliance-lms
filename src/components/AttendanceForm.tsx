'use client';
import { useRef, useState } from 'react';

type Person = { id: string; name: string; org: string; status: string };
const LABEL: Record<string, [string, string]> = {
  REGISTERED: ['Оруулаагүй', 'neutral'], ATTENDED: ['Ирсэн', 'ok'], PARTIAL: ['Хэсэгчлэн ирсэн', 'warn'], ABSENT: ['Ирээгүй', 'crit'],
};

// Хичээлийн ирцийг олноор нь сонгож бүртгэнэ: Ирсэн / Хэсэгчлэн ирсэн / Ирээгүй
export default function AttendanceForm({ action, offeringId, sessionId, back, people, started }: {
  action: (fd: FormData) => Promise<void>; offeringId: string; sessionId: string; back: string; people: Person[]; started: boolean;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const statusRef = useRef<HTMLInputElement>(null);
  const toggle = (id: string) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  if (!people.length) return <p className="small muted">Бүртгэгдсэн оролцогч алга.</p>;
  const set = (v: string) => () => { statusRef.current!.value = v; };
  return (
    <form action={action} className="stack">
      <input type="hidden" name="offering_id" value={offeringId} />
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="status" ref={statusRef} defaultValue="ATTENDED" />
      <div className="tablewrap"><table>
        <thead><tr><th style={{ width: 32 }}><input type="checkbox" aria-label="Бүгдийг сонгох" checked={sel.length === people.length} onChange={e => setSel(e.target.checked ? people.map(p => p.id) : [])} /></th><th>Нэр</th><th>Байгууллага</th><th>Ирц</th></tr></thead>
        <tbody>{people.map(p => (
          <tr key={p.id}>
            <td><input type="checkbox" name="user_id" value={p.id} checked={sel.includes(p.id)} onChange={() => toggle(p.id)} aria-label={p.name} /></td>
            <td><strong>{p.name}</strong></td><td className="small muted">{p.org}</td>
            <td><span className={`chip c-${(LABEL[p.status] ?? LABEL.REGISTERED)[1]}`}>{(LABEL[p.status] ?? LABEL.REGISTERED)[0]}</span></td>
          </tr>))}
        </tbody>
      </table></div>
      <div className="acts" style={{ justifyContent: 'flex-start' }}>
        <button className="btn sm" onClick={set('ATTENDED')} disabled={!sel.length}>Ирсэн ({sel.length})</button>
        <button className="btn sm ghost" onClick={set('PARTIAL')} disabled={!sel.length}>Хэсэгчлэн ирсэн</button>
        <button className="btn sm ghost" onClick={set('ABSENT')} disabled={!sel.length}>Ирээгүй</button>
        {!started && <span className="small muted">Хичээл эхлээгүй байна. Ирцийг хичээлийн үеэр эсвэл дараа нь бүртгэнэ.</span>}
      </div>
    </form>
  );
}
