'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { registerSession, unregisterSession } from '@/app/actions/learner';

export type SessionOpt = { id: string; when: string; location: string; link: string | null; instructor: string | null; left: number; mine: boolean };

export default function SessionPicker({ sessions, showLink }: { sessions: SessionOpt[]; showLink: boolean }) {
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const act = (fn: () => Promise<{ error?: string; ok?: string }>) => start(async () => { setMsg(await fn()); router.refresh(); });
  if (!sessions.length) return <p className="muted">Ирэх хуваарь одоогоор зарлагдаагүй байна. Хуваарь гарахад танд мэдэгдэнэ.</p>;
  return (
    <div className="stack">
      {msg.error && <div className="alert err">{msg.error}</div>}
      {msg.ok && <div className="alert ok">{msg.ok}</div>}
      <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
        {sessions.map(s => (
          <div key={s.id} className={`row ${s.mine ? 'req' : ''}`} style={{ ['--c' as any]: 'var(--ok)' }}>
            <div>
              <strong className="num">{s.when}</strong>
              <div className="meta"><span>{s.location}</span>{s.instructor && <span>{s.instructor}</span>}<span>{s.left > 0 ? `${s.left} суудал үлдсэн` : 'Суудал дүүрсэн'}</span></div>
              {s.mine && showLink && s.link && <div className="meta"><a className="link" href={s.link} target="_blank" rel="noreferrer">Онлайн хичээлд нэгдэх</a></div>}
            </div>
            <div className="acts">
              {s.mine
                ? <><span className="chip c-ok">Бүртгүүлсэн</span><button className="btn sm ghost" disabled={pending} onClick={() => act(() => unregisterSession(s.id))}>Цуцлах</button></>
                : <button className="btn sm" disabled={pending || s.left <= 0} onClick={() => act(() => registerSession(s.id))}>Бүртгүүлэх</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
