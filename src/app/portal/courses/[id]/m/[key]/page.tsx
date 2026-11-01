import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, PORTAL_ROLES } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { canAccessCourse, courseProgress, requirementStatus, logActivity, FORMAT_LABEL } from '@/lib/progress';
import { fmtSession } from '@/lib/format';
import OfferingPicker from '@/components/OfferingPicker';
import { learnerOfferings } from '@/lib/offerings';
import { StateChip } from '@/components/ui';
import VideoPlayer from '@/components/VideoPlayer';
import Quiz from '@/components/Quiz';
import PdfViewer from '@/components/PdfViewer';
import { parseVideoUrl } from '@/lib/video';
import PracticalLearner from '@/components/PracticalLearner';
import { Flash } from '@/components/ui';
import LearnFrame from '@/components/LearnFrame';
import { fmtDuration } from '@/lib/format';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default async function ModulePage(
  props: { params: Promise<{ id: string; key: string }>; searchParams: Promise<{ ok?: string; err?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const u = await requireUser(...PORTAL_ROLES);
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
  const video = m.video_file ? { kind: 'direct' as const, url: `${base}/api/files/${m.video_file}` } : parseVideoUrl(m.video_url);
  const qs = m.qcount ? await all<any>('SELECT text, options FROM questions WHERE module_id=$1 ORDER BY position', [m.id]) : [];
  const next = p.modules[idx + 1];
  const practical = m.format === 'OJT' || m.format === 'VOC';
  const scheduled = m.format === 'INPERSON' || m.format === 'ONLINE';
  const items = practical ? (await all<{ text: string }>('SELECT text FROM module_items WHERE module_id=$1 ORDER BY position', [m.id])).map(i => i.text) : [];
  const recs = practical ? await all<any>(`SELECT r.*, a.name AS assessor FROM practical_records r LEFT JOIN users a ON a.id=r.assessor_id
     WHERE r.user_id=$1 AND r.course_id=$2 AND r.module_key=$3 ORDER BY r.created_at DESC`, [u.id, c.id, m.module_key]) : [];
  const openRec = recs.find(x => ['IN_PROGRESS', 'SUBMITTED', 'REQUESTED'].includes(x.status) && x.mver === m.mver) ?? null;
  const offerings = scheduled ? await learnerOfferings(u.id, c.id, m.module_key) : [];
  const history = !scheduled ? [] : await all<any>(`
    SELECT s.starts_at, a.status FROM session_attendees a JOIN sessions s ON s.id=a.session_id
     WHERE a.user_id=$1 AND s.course_id=$2 AND s.module_key=$3 AND s.starts_at <= now() ORDER BY s.starts_at DESC LIMIT 3`, [u.id, c.id, m.module_key]);
  return (
    <LearnFrame course={c} modules={p.modules} current={m.module_key}>
      <div className="head">
        <div><p className="lkick">Модуль {idx + 1}/{p.total} · {FORMAT_LABEL[m.format]}{m.duration_min ? ` · ${fmtDuration(m.duration_min)}` : ''}</p><h1 className="ltitle">{m.title}</h1></div>
        <StateChip state={m.state} />
      </div>
      <Flash sp={searchParams} />
      {practical && <PracticalLearner kind={m.format as 'OJT' | 'VOC'} courseId={c.id} moduleKey={m.module_key} items={items} open={openRec}
        history={recs.filter(x => ['COMPETENT', 'NYC'].includes(x.status))} done={m.state === 'done'} />}
      {scheduled && <section className="panel">
        <h2>Хуваарь сонгох</h2>
        {m.state === 'done' && <p className="muted" style={{ margin: 0 }}>Та энэ хичээлд хамрагдсан байна.</p>}
        {m.state !== 'done' && <p className="small muted" style={{ margin: 0 }}>Хуваарьт бүхэлд нь бүртгүүлнэ: тухайн хуваарийн бүх хичээлийн цагт хамрагдана. Суудал дүүрсэн бол хүлээлгийн жагсаалтад орж, суудал гармагц автоматаар бүртгэгдэнэ. Хичээл бүрээс 1 өдрийн өмнө сануулга очно.</p>}
        {(m.state !== 'done' || offerings.some(o => o.my)) && <OfferingPicker offerings={offerings} />}
        {history.length > 0 && <div className="small muted">Өмнөх ирц: {history.map(h => `${fmtSession(h.starts_at)} — ${h.status === 'ATTENDED' ? 'ирсэн' : h.status === 'PARTIAL' ? 'хэсэгчлэн ирсэн' : h.status === 'ABSENT' ? 'ирээгүй' : 'бүртгүүлсэн'}`).join('; ')}</div>}
      </section>}
      {video && <section className="panel"><VideoPlayer source={video} courseId={c.id} moduleKey={m.module_key} start={r.position} maxS={r.maxS} initialPct={r.videoPct} /></section>}
      {m.pdf_file && <section className="panel">
        <h2>{m.format === 'ELEARN' ? 'Гарын авлага' : practical ? 'Ажлын заавар' : 'Хичээлийн материал'}</h2>
        <PdfViewer fileId={m.pdf_file} courseId={c.id} moduleKey={m.module_key} track={m.format === 'ELEARN' && m.state !== 'done'} initialSeen={r.pdfSeen} />
      </section>}
      {m.format === 'ELEARN' && qs.length > 0 && <section className="panel">
        <h2>Тест</h2>
        {r.materialOk ? <Quiz courseId={c.id} moduleKey={m.module_key} questions={qs} passScore={m.pass_score} best={r.quizScore} />
          : <p className="muted">{[!r.videoOk && 'Видеог бүрэн', !r.pdfOk && (r.videoOk ? 'Гарын авлагын бүх хуудсыг' : 'гарын авлагын бүх хуудсыг')].filter(Boolean).join(', ')} үзсэний дараа тест нээгдэнэ.</p>}
      </section>}
      {m.description && <section className="lsec"><h2>Модулийн тухай</h2><p style={{ whiteSpace: 'pre-wrap' }}>{m.description}</p></section>}
      {m.state === 'done' && <div className="notice soft"><strong>✓ Энэ модулийг дуусгасан байна.</strong>
        <span className="small">{next ? `Дараагийнх: ${next.title}` : 'Сургалтын бүх модулийг үзсэн бол сургалтын нүүр хуудаснаас явцаа харна уу.'}</span></div>}
    </LearnFrame>
  );
}
