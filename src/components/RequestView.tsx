import { Chip } from './ui';
import { fmtDate, fmtDateTime, fmtSession } from '@/lib/format';
import { REQ_KIND, REQ_STATUS, REQ_FORMAT, reqCode } from '@/lib/requests';
import { offCode } from '@/lib/offerings';

// Хүсэлтийн мэдээлэл, хамрагдах хүмүүс, харилцаа (хариуцагч ба Proliance хоёуланд нь)
export function RequestFacts({ r, offering }: { r: any; offering?: any }) {
  const when = r.preferred_from || r.preferred_to ? `${r.preferred_from ? fmtDate(r.preferred_from) : '…'} – ${r.preferred_to ? fmtDate(r.preferred_to) : '…'}` : 'Тодорхойгүй';
  return (
    <section className="panel">
      <div className="head"><div><p className="small muted num">{reqCode(r.num)} · {fmtDateTime(r.created_at)}</p>
        <h1>{REQ_KIND[r.kind][0]}{r.course ? `: ${r.course}` : r.topic ? `: ${r.topic}` : ''}</h1></div>
        <Chip label={REQ_STATUS[r.status][0]} tone={REQ_STATUS[r.status][1]} /></div>
      <dl className="rq-facts">
        <div><dt>Байгууллага</dt><dd>{r.org}</dd></div>
        <div><dt>Хүсэлт гаргасан</dt><dd>{r.requester ?? '—'}{r.requester_phone && <div className="small muted">{r.requester_phone}</div>}</dd></div>
        <div><dt>Хэлбэр</dt><dd>{REQ_FORMAT[r.format]}</dd></div>
        <div><dt>Боломжтой хугацаа</dt><dd>{when}</dd></div>
        {r.course && r.topic && <div><dt>Сэдэв</dt><dd>{r.topic}</dd></div>}
        {r.handler && <div><dt>Proliance-аас хариуцсан</dt><dd>{r.handler}</dd></div>}
      </dl>
      {r.note && <div><p className="small muted" style={{ margin: 0 }}>Тайлбар</p><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.note}</p></div>}
      {offering && <div className="notice soft"><strong>Хуваарь: {offCode(offering.num)} · {offering.course}</strong>
        <span className="small">{offering.first_at ? fmtSession(offering.first_at) : ''} · {offering.location}{offering.instructor ? ` · Багш: ${offering.instructor}` : ''}{offering.link ? ` · ${offering.link}` : ''}</span></div>}
    </section>
  );
}

export function RequestPeople({ people, enrolled }: { people: any[]; enrolled?: Record<string, string> }) {
  if (!people.length) return null;
  return (
    <section className="panel">
      <h2>Хамрагдах хүмүүс ({people.length})</h2>
      <div className="tablewrap"><table>
        <thead><tr><th>Нэр</th><th>Албан тушаал</th><th>Холбоо барих</th><th>Систем</th>{enrolled && <th>Хуваарь</th>}</tr></thead>
        <tbody>{people.map(p => <tr key={p.id}>
          <td><strong>{p.uname ?? p.name}</strong></td><td className="small">{p.uposition ?? p.position ?? '—'}</td>
          <td className="small">{p.uemail ?? p.email ?? '—'}{p.phone && <div className="muted">{p.phone}</div>}</td>
          <td>{p.user_id ? <Chip label={p.activated ? 'Бүртгэлтэй' : 'Урилга илгээсэн'} tone={p.activated ? 'ok' : 'info'} /> : <Chip label="Бүртгэлгүй" tone="neutral" />}</td>
          {enrolled && <td className="small">{p.user_id && enrolled[p.user_id] ? enrolled[p.user_id] : '—'}</td>}
        </tr>)}</tbody></table></div>
    </section>
  );
}

export function RequestThread({ messages, mySide }: { messages: any[]; mySide: 'ORG' | 'PROLIANCE' }) {
  return (
    <div className="rq-thread">{messages.map(m => m.side === 'SYSTEM'
      ? <div key={m.id} className="rq-msg sys"><p>{m.body}</p><span className="small muted">{m.name ? `${m.name} · ` : ''}{fmtDateTime(m.created_at)}</span></div>
      : <div key={m.id} className={`rq-msg ${m.side === mySide ? 'me' : ''}`}>
          <span className="small muted">{m.name}{m.side === 'PROLIANCE' ? ' · Proliance' : ''} · {fmtDateTime(m.created_at)}</span>
          <p>{m.body}</p></div>)}</div>
  );
}
