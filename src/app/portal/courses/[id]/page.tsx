import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { canAccessCourse, courseProgress, REQUIRED, FORMAT_LABEL } from '@/lib/progress';
import { CourseChip, StateChip } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { complianceRows, COMP_LABEL, COMPLIANT_SET } from '@/lib/compliance';

const COL: Record<string, string> = { todo: 'var(--crit)', retake: 'var(--warn)', newmod: 'var(--info)' };

export default async function CoursePage({ params, searchParams }: { params: { id: string }; searchParams: { all?: string } }) {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  if (!(await canAccessCourse(u.id, params.id))) notFound();
  const c = await one<any>('SELECT * FROM courses WHERE id=$1', [params.id]);
  const p = (await courseProgress(u.id, params.id))!;
  const versions = await all<any>(`SELECT number, notes, published_at FROM course_versions WHERE course_id=$1 AND status='PUBLISHED' ORDER BY number DESC`, [c.id]);
  const showAll = searchParams.all === '1' || p.left === 0;
  const mand = (await complianceRows({ user: u.id, course: c.id }))[0];
  const regs = (await all<{ module_key: string }>(`SELECT s.module_key FROM session_attendees a JOIN sessions s ON s.id=a.session_id
     WHERE a.user_id=$1 AND s.course_id=$2 AND a.status='REGISTERED' AND s.status='SCHEDULED' AND s.starts_at > now()`, [u.id, c.id])).map(r => r.module_key);
  const mods = showAll ? p.modules : p.modules.filter(m => REQUIRED.includes(m.state));
  const updated = p.version.number > 1 && p.modules.some(m => m.state === 'retake' || m.state === 'newmod' || m.state === 'recommended');
  return (
    <>
      <div><Link className="link small" href="/portal">← Миний сургалт</Link></div>
      <div className="head">
        <div><h1>{c.title}</h1><p className="muted">v{p.version.number} · {p.done}/{p.total} модуль дууссан</p></div>
        <CourseChip k={p.key} />
      </div>
      {mand && <div className={`notice ${mand.status === 'OVERDUE' || mand.status === 'EXPIRED' ? '' : 'soft'}`}>
        <strong>Заавал хамрагдах сургалт · {COMP_LABEL[mand.status][0]}</strong>
        <span className="small">{COMPLIANT_SET.includes(mand.status)
          ? (mand.validUntil ? `${fmtDate(mand.validUntil)} хүртэл хүчинтэй. ${mand.recurrence} сар тутам дахин сууна.` : 'Та энэ сургалтыг дуусгасан.')
          : mand.status === 'EXPIRED' ? `${fmtDate(mand.validUntil)}-нд хүчингүй болсон. Дахин сууна уу.` : `Эцсийн хугацаа: ${fmtDate(mand.due)}.`}</span>
      </div>}
      {updated && <div className="notice"><strong>{p.version.number}-р хувилбар гарсан ({fmtDate(p.version.published_at)})</strong>
        <span className="small">{p.version.notes}</span>
        <span className="small" style={{ opacity: .9 }}>Өмнө нь дуусгасан, өөрчлөгдөөгүй модулиуд тань хэвээр тооцогдоно.</span></div>}
      {c.description && <p style={{ margin: 0 }}>{c.description}</p>}
      <div className="head">
        <h2>{showAll ? 'Бүх модуль' : 'Үзэх шаардлагатай модуль'}</h2>
        {p.left > 0 && <Link className="link small" href={showAll ? `/portal/courses/${c.id}` : `/portal/courses/${c.id}?all=1`}>{showAll ? 'Зөвхөн үзэх шаардлагатайг' : 'Бүх модулийг харах'}</Link>}
      </div>
      <div className="list">{mods.map(m => {
        const inner = (<>
          <div><strong>{m.title}</strong>
            <div className="meta"><span className="fmt">{m.format !== 'ELEARN' ? FORMAT_LABEL[m.format] : (m.video_file ? 'Видео' : 'Гарын авлага') + (m.qcount ? ' · тест' : '')}</span><span>{m.duration_min} мин</span><StateChip state={m.state} /></div>
            {!m.unlocked && <div className="small muted" style={{ marginTop: 4 }}>Өмнөх модулиа дуусгасны дараа нээгдэнэ.</div>}
          </div>
          <div className="acts">{m.unlocked && <span className="btn sm">{m.state === 'done' ? 'Дахин үзэх' : m.format === 'OJT' ? 'Даалгавар' : m.format === 'VOC' ? 'Үнэлгээ' : m.format !== 'ELEARN' ? (regs.includes(m.module_key) ? 'Бүртгүүлсэн' : 'Хуваарь сонгох') : 'Эхлэх'}</span>}</div>
        </>);
        return m.unlocked
          ? <Link key={m.id} href={`/portal/courses/${c.id}/m/${m.module_key}`} className={`row ${REQUIRED.includes(m.state) ? 'req' : ''}`} style={{ ['--c' as any]: COL[m.state] }}>{inner}</Link>
          : <div key={m.id} className="row locked">{inner}</div>;
      })}</div>
      <section className="panel">
        <h2>Хувилбарын түүх</h2>
        {versions.map(v => <div key={v.number} className={`ver ${v.number === p.version.number ? 'cur' : ''}`}>
          <div className="small"><strong className="num">v{v.number}</strong> <span className="muted">{fmtDate(v.published_at)}</span></div>
          {v.notes && <div className="small">{v.notes}</div>}</div>)}
      </section>
    </>
  );
}
