import { redirect } from 'next/navigation';
import { getSession, isStaff } from '@/lib/auth';
import { one } from '@/lib/db';
import { runByToken, runIsOpen, attemptQuestions, attemptDeadline, gradeAttempt, latestAttempt, resultVisible, examSections, shownCount } from '@/lib/exams';
import { all } from '@/lib/db';
import { canAccessCourse } from '@/lib/progress';
import ExamRunner from '@/components/ExamRunner';
import StartExam from '@/components/StartExam';

export const dynamic = 'force-dynamic';
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

function Frame({ children, name }: { children: React.ReactNode; name?: string }) {
  return (
    <div className="exam-wrap">
      <header className="exam-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${base}/logo.png`} alt="Proliance" />
        {name && <span className="small muted">{name}</span>}
      </header>
      <main className="stack" style={{ padding: '18px 0 48px' }}>{children}</main>
    </div>
  );
}

export default async function ExamPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const u = await getSession();
  if (!u) redirect(`/login?next=${encodeURIComponent(`/exam/${params.token}`)}`);
  const r = await runByToken(params.token);
  if (!r) return <Frame><div className="panel"><h1>Холбоос буруу байна</h1><p className="muted">QR кодыг дахин уншуулна уу.</p></div></Frame>;

  let a = await latestAttempt(r.id, u.id);
  // Хугацаа дууссан бол хадгалсан хариултаар нь дүгнэнэ
  if (a && !a.submitted_at && (Date.now() > attemptDeadline(r, a.started_at) + 30000 || r.closed_at)) {
    await gradeAttempt(a.id, null);
    a = await one<any>('SELECT * FROM exam_attempts WHERE id=$1', [a.id]);
  }
  const head = <div><p className="fmt" style={{ margin: 0 }}>{r.course}</p><h1>{r.title}</h1></div>;
  const open = runIsOpen(r);

  if (a?.submitted_at) {
    const visible = resultVisible(r, a);
    const canRetry = visible && !a.passed && a.attempt_no < r.attempts_allowed && open;
    const max = Number(a.max_points ?? 0);
    const ev = r.session_id ? await one<any>(`SELECT er.token FROM eval_runs er WHERE er.session_id=$1 AND er.closed_at IS NULL AND er.closes_at > now()
        AND NOT EXISTS (SELECT 1 FROM eval_responses x WHERE x.run_id=er.id AND x.user_id=$2) ORDER BY er.opened_at DESC LIMIT 1`, [r.session_id, u.id]) : null;
    const evalLink = ev?.token as string | undefined;
    return (
      <Frame name={u.name}>
        {head}
        {visible ? (
          <section className="panel" style={{ textAlign: 'center', justifyItems: 'center' }}>
            <div className={`score ${a.passed ? 'ok' : 'bad'}`}>{max > 0 ? `${a.score}%` : a.passed ? '✓' : '✕'}</div>
            <h2>{a.result_label ?? (a.passed ? 'Тэнцсэн' : 'Тэнцээгүй')}</h2>
            <p className="muted">{max > 0 ? `${Number(a.points)}/${max} оноо · ` : ''}{a.attempt_no}-р оролдлого</p>
            {a.passed && r.module_key && <p className="small">Баяр хүргэе! Хичээлийн ирц тань батлагдаж, модуль дууссанд тооцогдлоо.</p>}
            {a.review_note && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>Багшийн тэмдэглэл: {a.review_note}</p>}
            {canRetry && <div style={{ width: '100%' }}><p className="small muted">Танд {r.attempts_allowed - a.attempt_no} оролдлого үлдсэн байна.</p><StartExam token={params.token} label="Дахин өгөх" /></div>}
            {!a.passed && !canRetry && <p className="small muted">Дахин шалгалт өгөх талаар заагч инженерт хандана уу.</p>}
          </section>
        ) : (
          <section className="panel" style={{ textAlign: 'center' }}>
            <h2>Хариулт тань хүлээн авагдлаа</h2>
            <p className="muted">{a.review_status === 'PENDING'
              ? 'Багш хариултыг шалгаж дүнг оруулна. Дүн гармагц системд харагдана.'
              : 'Дүн шалгалт дууссаны дараа энэ холбоос дээр харагдана.'}</p>
          </section>
        )}
        {evalLink && <section className="panel">
          <h2>Хичээлээ үнэлнэ үү</h2>
          <p className="small muted" style={{ margin: 0 }}>Хичээлийн агуулга, багшийн заах аргын талаарх таны санал 1–2 минут л болно.</p>
          <a className="btn" style={{ padding: 14 }} href={`${base}/eval/${evalLink}`}>Үнэлгээ өгөх</a>
        </section>}
      </Frame>
    );
  }
  if (!open && !a) {
    return <Frame name={u.name}>{head}<section className="panel"><h2>Шалгалт дууссан</h2><p className="muted">Энэ холбоос идэвхгүй болсон байна.</p></section></Frame>;
  }
  if (isStaff(u.role)) {
    return <Frame name={u.name}>{head}<section className="panel"><p>Та админ эрхээр нэвтэрсэн байна. Шалгалтыг суралцагчийн эрхээр өгнө.</p></section></Frame>;
  }
  if (!(await canAccessCourse(u.id, r.course_id))) {
    return <Frame name={u.name}>{head}<section className="panel"><h2>Эрх хүрэхгүй байна</h2><p className="muted">Танай байгууллагад энэ сургалт нээгдээгүй байна. Proliance-тай холбогдоно уу.</p></section></Frame>;
  }
  if (!a) {
    const n = shownCount(await examSections(r.exam_id));
    return (
      <Frame name={u.name}>
        {head}
        <section className="panel">
          {r.description && <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.description}</p>}
          <div className="stack small">
            {n > 0 ? <div>Асуулт: <strong>{n}</strong></div> : <div><strong>Дадлагын үнэлгээ.</strong> Бүртгүүлсний дараа багш таны ур чадварыг үнэлж дүнг оруулна.</div>}
            {n > 0 && <div>Хугацаа: <strong>{r.duration_min > 0 ? `${r.duration_min} минут` : 'хязгааргүй'}</strong>{r.duration_min > 0 ? ' (эхлүүлсэн цагаас)' : ''}</div>}
            {r.attempts_allowed > 1 && <div>Оролдлого: <strong>{r.attempts_allowed}</strong> хүртэл</div>}
            <div className="muted">Хариулт тань автоматаар хадгалагдах тул сүлжээ тасарвал холбоосоо дахин нээнэ үү.</div>
          </div>
          <StartExam token={params.token} label={n > 0 ? 'Шалгалт эхлүүлэх' : 'Бүртгүүлэх'} />
        </section>
      </Frame>
    );
  }
  const qs = await attemptQuestions(a.question_ids);
  const secs = await all<any>('SELECT id, position, description FROM exam_sections WHERE exam_id=$1', [r.exam_id]);
  const secText = (id: string | null) => secs.find(x => x.id === id)?.description || null;
  return (
    <Frame name={u.name}>
      {head}
      <ExamRunner token={params.token} deadline={attemptDeadline(r, a.started_at)} initial={a.answers ?? []}
        questions={qs.map(q => ({ text: q.text, qtype: q.qtype, options: q.options, image: q.image_file, section: secText(q.section_id) }))} />
    </Frame>
  );
}
