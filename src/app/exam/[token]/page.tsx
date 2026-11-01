import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { one } from '@/lib/db';
import { runByToken, runIsOpen, attemptQuestions, attemptDeadline, gradeAttempt } from '@/lib/exams';
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

  let a = await one<any>('SELECT a.*, v.name AS variant FROM exam_attempts a JOIN exam_variants v ON v.id=a.variant_id WHERE a.run_id=$1 AND a.user_id=$2', [r.id, u.id]);
  // Хугацаа дууссан бол хадгалсан хариултаар нь дүгнэнэ
  if (a && !a.submitted_at && (Date.now() > attemptDeadline(r, a.started_at) + 30000 || r.closed_at)) {
    await gradeAttempt(a.id, null);
    a = await one<any>('SELECT a.*, v.name AS variant FROM exam_attempts a JOIN exam_variants v ON v.id=a.variant_id WHERE a.id=$1', [a.id]);
  }
  const head = <div><p className="fmt" style={{ margin: 0 }}>{r.course}</p><h1>{r.title}</h1></div>;

  if (a?.submitted_at) {
    const n = (a.question_ids as string[]).length;
    const ev = r.session_id ? await one<any>(`SELECT er.token FROM eval_runs er WHERE er.session_id=$1 AND er.closed_at IS NULL AND er.closes_at > now()
        AND NOT EXISTS (SELECT 1 FROM eval_responses x WHERE x.run_id=er.id AND x.user_id=$2) ORDER BY er.opened_at DESC LIMIT 1`, [r.session_id, u.id]) : null;
    const evalLink = ev?.token as string | undefined;
    return (
      <Frame name={u.name}>
        {head}
        <section className="panel" style={{ textAlign: 'center', justifyItems: 'center' }}>
          <div className={`score ${a.passed ? 'ok' : 'bad'}`}>{a.score}%</div>
          <h2>{a.passed ? 'Баяр хүргэе! Та тэнцлээ.' : 'Харамсалтай нь тэнцсэнгүй.'}</h2>
          <p className="muted">{Math.round((a.score / 100) * n)}/{n} зөв · тэнцэх оноо {r.pass_score}% · {a.variant}</p>
          {a.passed && r.module_key && <p className="small">Хичээлийн ирц тань батлагдаж, модуль дууссанд тооцогдлоо.</p>}
          {!a.passed && <p className="small muted">Дахин шалгалт өгөх талаар заагч инженерт хандана уу.</p>}
        </section>
        {evalLink && <section className="panel">
          <h2>Хичээлээ үнэлнэ үү</h2>
          <p className="small muted" style={{ margin: 0 }}>Хичээлийн агуулга, багшийн заах аргын талаарх таны санал 1–2 минут л болно.</p>
          <a className="btn" style={{ padding: 14 }} href={`${base}/eval/${evalLink}`}>Үнэлгээ өгөх</a>
        </section>}
      </Frame>
    );
  }
  if (!runIsOpen(r) && !a) {
    return <Frame name={u.name}>{head}<section className="panel"><h2>Шалгалт дууссан</h2><p className="muted">Энэ холбоос идэвхгүй болсон байна.</p></section></Frame>;
  }
  if (u.role === 'ADMIN') {
    return <Frame name={u.name}>{head}<section className="panel"><p>Та админ эрхээр нэвтэрсэн байна. Шалгалтыг суралцагчийн эрхээр өгнө.</p></section></Frame>;
  }
  if (!(await canAccessCourse(u.id, r.course_id))) {
    return <Frame name={u.name}>{head}<section className="panel"><h2>Эрх хүрэхгүй байна</h2><p className="muted">Танай байгууллагад энэ сургалт нээгдээгүй байна. Proliance-тай холбогдоно уу.</p></section></Frame>;
  }
  if (!a) {
    const n = (await one<{ n: number }>(`SELECT min(c)::int AS n FROM (SELECT count(q.id) AS c FROM exam_variants v LEFT JOIN exam_questions q ON q.variant_id=v.id WHERE v.exam_id=$1 GROUP BY v.id) x`, [r.exam_id]))!.n;
    return (
      <Frame name={u.name}>
        {head}
        <section className="panel">
          <div className="stack small">
            <div>Асуулт: <strong>{n}</strong></div>
            <div>Хугацаа: <strong>{r.duration_min} минут</strong> (эхлүүлсэн цагаас)</div>
            <div>Тэнцэх оноо: <strong>{r.pass_score}%</strong></div>
            <div className="muted">Нэг л удаа өгнө. Хариулт тань автоматаар хадгалагдах тул сүлжээ тасарвал холбоосоо дахин нээнэ үү.</div>
          </div>
          <StartExam token={params.token} />
        </section>
      </Frame>
    );
  }
  const qs = await attemptQuestions(a.question_ids);
  return (
    <Frame name={u.name}>
      {head}
      <ExamRunner token={params.token} questions={qs.map(q => ({ text: q.text, options: q.options }))} initial={a.answers ?? []} deadline={attemptDeadline(r, a.started_at)} />
    </Frame>
  );
}
