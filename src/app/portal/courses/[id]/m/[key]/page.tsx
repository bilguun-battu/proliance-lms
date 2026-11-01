import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { canAccessCourse, courseProgress, requirementStatus, logActivity, FORMAT_LABEL } from '@/lib/progress';
import { fmtSession } from '@/lib/format';
import SessionPicker from '@/components/SessionPicker';
import { StateChip } from '@/components/ui';
import VideoPlayer from '@/components/VideoPlayer';
import Quiz from '@/components/Quiz';
import MarkRead from '@/components/MarkRead';
import PracticalLearner from '@/components/PracticalLearner';
import { Flash } from '@/components/ui';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default async function ModulePage({ params, searchParams }: { params: { id: string; key: string }; searchParams: { ok?: string; err?: string } }) {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  if (!(await canAccessCourse(u.id, params.id))) notFound();
  const c = await one<any>('SELECT id, title FROM courses WHERE id=$1', [params.id]);
  const p = (await courseProgress(u.id, params.id))!;
  const idx = p.modules.findIndex(m => m.module_key === params.key);
  const m = p.modules[idx];
  if (!m) notFound();
  if (!m.unlocked) redirect(`/portal/courses/${c.id}`);
  // Нэг модулийг 30 минутын дотор дахин нээвэл давхар бүртгэхгүй
  const recent = await one('SELECT 1 FROM activity_log WHERE user_id=$1 AND course_id=$2 AND module_key=$3 AND action=$4 AND at > now() - interval \'30 minutes\'', [u.id, c.id, m.module_key, 'OPEN']);
  if (!recent) await logActivity(u.id, c.id, m.module_key, 'OPEN', m.title);
  const r = await requirementStatus(u.id, c.id, m);
  const qs = m.qcount ? await all<any>('SELECT text, options FROM questions WHERE module_id=$1 ORDER BY position', [m.id]) : [];
  const next = p.modules[idx + 1];
  const practical = m.format === 'OJT' || m.format === 'VOC';
  const scheduled = m.format === 'INPERSON' || m.format === 'ONLINE';
  const items = practical ? (await all<{ text: string }>('SELECT text FROM module_items WHERE module_id=$1 ORDER BY position', [m.id])).map(i => i.text) : [];
  const recs = practical ? await all<any>(`SELECT r.*, a.name AS assessor FROM practical_records r LEFT JOIN users a ON a.id=r.assessor_id
     WHERE r.user_id=$1 AND r.course_id=$2 AND r.module_key=$3 ORDER BY r.created_at DESC`, [u.id, c.id, m.module_key]) : [];
  const openRec = recs.find(x => ['IN_PROGRESS', 'SUBMITTED', 'REQUESTED'].includes(x.status) && x.mver === m.mver) ?? null;
  const sessions = !scheduled ? [] : await all<any>(`
    SELECT s.*, (SELECT count(*)::int FROM session_attendees a WHERE a.session_id=s.id) AS taken,
           EXISTS (SELECT 1 FROM session_attendees a WHERE a.session_id=s.id AND a.user_id=$3) AS mine
      FROM sessions s WHERE s.course_id=$1 AND s.module_key=$2 AND s.status='SCHEDULED' AND s.starts_at > now() ORDER BY s.starts_at`, [c.id, m.module_key, u.id]);
  const history = !scheduled ? [] : await all<any>(`
    SELECT s.starts_at, a.status FROM session_attendees a JOIN sessions s ON s.id=a.session_id
     WHERE a.user_id=$1 AND s.course_id=$2 AND s.module_key=$3 AND s.starts_at <= now() ORDER BY s.starts_at DESC LIMIT 3`, [u.id, c.id, m.module_key]);
  return (
    <>
      <div><Link className="link small" href={`/portal/courses/${c.id}`}>← {c.title}</Link></div>
      <div className="head">
        <div><p className="fmt" style={{ margin: 0 }}>Модуль {idx + 1}/{p.total} · {FORMAT_LABEL[m.format]}</p><h1>{m.title}</h1></div>
        <StateChip state={m.state} />
      </div>
      <Flash sp={searchParams} />
      {m.description && <p style={{ margin: 0 }}>{m.description}</p>}
      {practical && <PracticalLearner kind={m.format as 'OJT' | 'VOC'} courseId={c.id} moduleKey={m.module_key} items={items} open={openRec}
        history={recs.filter(x => ['COMPETENT', 'NYC'].includes(x.status))} done={m.state === 'done'} />}
      {scheduled && <section className="panel">
        <h2>{FORMAT_LABEL[m.format]} хичээлийн хуваарь</h2>
        {m.state === 'done'
          ? <p className="muted">Та энэ хичээлд хамрагдсан байна.</p>
          : <><p className="small muted">{m.format === 'ONLINE' ? 'Тохирох цагаа сонгон бүртгүүлнэ үү. Онлайн хичээлийн холбоос бүртгүүлсний дараа энд харагдана.' : 'Тохирох цагаа сонгон бүртгүүлнэ үү.'} Хичээлээс 1 өдрийн өмнө сануулга очно. Ирц батлагдахад модуль дууссанд тооцогдоно.</p>
            <SessionPicker showLink={m.format === 'ONLINE'} sessions={sessions.map(s => ({ id: s.id, when: fmtSession(s.starts_at), location: s.location, link: s.mine ? s.link : null, instructor: s.instructor, left: s.seats - s.taken, mine: s.mine }))} /></>}
        {history.length > 0 && <div className="small muted">Өмнөх бүртгэл: {history.map(h => `${fmtSession(h.starts_at)} — ${h.status === 'ATTENDED' ? 'ирсэн' : h.status === 'ABSENT' ? 'ирээгүй' : 'бүртгүүлсэн'}`).join('; ')}</div>}
      </section>}
      {m.video_file && <section className="panel"><VideoPlayer src={`${base}/api/files/${m.video_file}`} courseId={c.id} moduleKey={m.module_key} start={r.position} initialPct={r.videoPct} /></section>}
      {m.pdf_file && <section className="panel">
        <h2>{m.format === 'ELEARN' ? 'Гарын авлага' : practical ? 'Ажлын заавар' : 'Хичээлийн материал'}</h2>
        <div className="acts" style={{ justifyContent: 'flex-start' }}><a className="btn ghost" href={`${base}/api/files/${m.pdf_file}`} target="_blank" rel="noreferrer">PDF нээх</a>
          {m.format === 'ELEARN' && r.manual && m.state !== 'done' && <MarkRead courseId={c.id} moduleKey={m.module_key} />}</div>
      </section>}
      {m.format === 'ELEARN' && qs.length > 0 && <section className="panel">
        <h2>Тест</h2>
        {r.videoOk ? <Quiz courseId={c.id} moduleKey={m.module_key} questions={qs} passScore={m.pass_score} best={r.quizScore} />
          : <p className="muted">Видеог 90%-иас дээш үзсэний дараа тест нээгдэнэ.</p>}
      </section>}
      {m.state === 'done' && <div className="notice soft"><strong>Энэ модулийг дуусгасан байна.</strong>
        {next ? <div><Link className="btn" href={`/portal/courses/${c.id}/m/${next.module_key}`}>Дараагийн модуль: {next.title}</Link></div>
          : <div><Link className="btn" href={`/portal/courses/${c.id}`}>Сургалт руу буцах</Link></div>}</div>}
    </>
  );
}
