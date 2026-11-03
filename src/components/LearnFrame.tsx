import Link from 'next/link';
import { FORMAT_LABEL, REQUIRED } from '@/lib/progress';
import { fmtDuration } from '@/lib/format';

type Mod = { module_key: string; title: string; format: string; duration_min: number; state: string; unlocked: boolean };

const ICON: Record<string, string> = { done: '✓', todo: '▶', retake: '↻', newmod: '★', recommended: '○' };

// Суралцах дэлгэц: зүүн талд модулийн жагсаалт, явц; баруун талд агуулга; доор өмнөх/дараагийн модуль
export default function LearnFrame({ course, modules, current, children }: {
  course: { id: string; title: string }; modules: Mod[]; current: string | null; children: React.ReactNode;
}) {
  const done = modules.filter(m => m.state === 'done').length;
  const idx = modules.findIndex(m => m.module_key === current);
  const prev = idx > 0 ? modules[idx - 1] : null;
  const next = current === null ? modules.find(m => REQUIRED.includes(m.state as any) && m.unlocked) ?? modules[0] : modules[idx + 1];
  const href = (m: Mod) => `/portal/courses/${course.id}/m/${m.module_key}`;
  return (
    <div className="learn">
      <aside className="lside">
        <Link className="link small" href="/portal">← Миний сургалт</Link>
        <Link href={`/portal/courses/${course.id}`} className="lside-t" aria-current={current === null ? 'page' : undefined}>{course.title}</Link>
        <div className="lprog"><div className="bar" style={{ maxWidth: 'none' }}><span style={{ width: `${modules.length ? Math.round((done / modules.length) * 100) : 0}%` }} /></div>
          <span className="small muted">{done} / {modules.length} модуль дууссан</span></div>
        <p className="lside-h">Модулиуд</p>
        <ol className="lnav">{modules.map((m, i) => {
          const inner = <>
            <span className={`lic s-${m.unlocked ? m.state : 'locked'}`} aria-hidden="true">{m.unlocked ? ICON[m.state] ?? '○' : '🔒'}</span>
            <span className="lnav-t"><span>{i + 1}. {m.title}</span>
              <span className="small muted">{FORMAT_LABEL[m.format]}{m.duration_min ? ` · ${fmtDuration(m.duration_min)}` : ''}</span></span>
          </>;
          return <li key={m.module_key}>{m.unlocked
            ? <Link href={href(m)} aria-current={m.module_key === current ? 'page' : undefined}>{inner}</Link>
            : <span className="lnav-lock" title="Өмнөх модулиа дуусгасны дараа нээгдэнэ">{inner}</span>}</li>;
        })}</ol>
        <Link className="lside-ask" href={`/portal/ask?course=${course.id}`}>💬 Энэ сургалтаас асуулт асуух</Link>
      </aside>
      <div className="lmain">
        <div className="lcontent">{children}</div>
        <nav className="lbar">
          {current !== null && (prev
            ? <Link className="btn ghost" href={prev.unlocked ? href(prev) : '#'}>‹ Өмнөх</Link>
            : <Link className="btn ghost" href={`/portal/courses/${course.id}`}>‹ Танилцуулга</Link>)}
          <span />
          {next && next.unlocked
            ? <Link className="btn" href={href(next)}>{current === null ? (done ? 'Үргэлжлүүлэх' : 'Эхлэх') : 'Дараагийн модуль'} ›</Link>
            : current !== null && !next ? <Link className="btn" href={`/portal/courses/${course.id}`}>Сургалтын нүүр ›</Link>
            : next ? <span className="btn" aria-disabled="true" title="Энэ модулийг дуусгасны дараа нээгдэнэ" style={{ opacity: .5 }}>Дараагийн модуль ›</span> : null}
        </nav>
      </div>
    </div>
  );
}
