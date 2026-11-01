'use client';
import { useRef, useState } from 'react';
import { markAttendance } from '@/app/actions/admin';

type Person = { id: string; name: string; org: string; status: string };
const LABEL: Record<string, [string, string]> = { REGISTERED: ['Бүртгүүлсэн', 'info'], ATTENDED: ['Ирсэн', 'ok'], ABSENT: ['Ирээгүй', 'crit'] };

// Ирцийг олноор нь сонгож батална
export default function AttendanceForm({ sessionId, people, started }: { sessionId: string; people: Person[]; started: boolean }) {
  const [sel, setSel] = useState<string[]>([]);
  const statusRef = useRef<HTMLInputElement>(null);
  const toggle = (id: string) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  if (!people.length) return <p className="small muted">Бүртгүүлсэн хүн алга.</p>;
  return (
    <form action={markAttendance} className="stack">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="status" ref={statusRef} defaultValue="ATTENDED" />
      <div className="tablewrap"><table>
        <thead><tr><th style={{ width: 32 }}><input type="checkbox" aria-label="Бүгдийг сонгох" checked={sel.length === people.length} onChange={e => setSel(e.target.checked ? people.map(p => p.id) : [])} /></th><th>Нэр</th><th>Байгууллага</th><th>Төлөв</th></tr></thead>
        <tbody>{people.map(p => (
          <tr key={p.id}>
            <td><input type="checkbox" name="user_id" value={p.id} checked={sel.includes(p.id)} onChange={() => toggle(p.id)} aria-label={p.name} /></td>
            <td><strong>{p.name}</strong></td><td className="small muted">{p.org}</td>
            <td><span className={`chip c-${LABEL[p.status][1]}`}>{LABEL[p.status][0]}</span></td>
          </tr>))}
        </tbody>
      </table></div>
      <div className="acts" style={{ justifyContent: 'flex-start' }}>
        <button className="btn sm" onClick={() => { statusRef.current!.value = 'ATTENDED'; }} disabled={!sel.length}>Ирсэн гэж батлах ({sel.length})</button>
        <button className="btn sm ghost" onClick={() => { statusRef.current!.value = 'ABSENT'; }} disabled={!sel.length}>Ирээгүй</button>
        {!started && <span className="small muted">Хичээл эхлээгүй байна. Ирцийг хичээлийн дараа батлана уу.</span>}
      </div>
    </form>
  );
}
