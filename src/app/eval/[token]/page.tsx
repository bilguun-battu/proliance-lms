import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { one } from '@/lib/db';
import { evalRunByToken, templateQuestions } from '@/lib/evals';
import { runIsOpen } from '@/lib/exams';
import { canAccessCourse } from '@/lib/progress';
import { fmtSession } from '@/lib/format';
import EvalForm from '@/components/EvalForm';

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

export default async function EvalPage({ params }: { params: { token: string } }) {
  const u = await getSession();
  if (!u) redirect(`/login?next=${encodeURIComponent(`/eval/${params.token}`)}`);
  const r = await evalRunByToken(params.token);
  if (!r) return <Frame><div className="panel"><h1>Холбоос буруу байна</h1><p className="muted">QR кодыг дахин уншуулна уу.</p></div></Frame>;
  const head = (
    <div><p className="fmt" style={{ margin: 0 }}>Хичээлийн үнэлгээ</p><h1>{r.module ?? r.course ?? r.name}</h1>
      <p className="small muted" style={{ margin: '4px 0 0' }}>{[r.course !== r.module ? r.course : null, r.session_at ? fmtSession(r.session_at) : null, r.instructor].filter(Boolean).join(' · ')}</p></div>);
  const done = await one('SELECT 1 FROM eval_responses WHERE run_id=$1 AND user_id=$2', [r.id, u.id]);
  if (done) return <Frame name={u.name}>{head}<section className="panel" style={{ textAlign: 'center' }}><h2>Баярлалаа!</h2><p className="muted">Таны үнэлгээ хүлээн авлаа. Таны санал хичээлийг сайжруулахад тусална.</p></section></Frame>;
  if (!runIsOpen(r)) return <Frame name={u.name}>{head}<section className="panel"><h2>Үнэлгээ хаагдсан</h2><p className="muted">Энэ холбоос идэвхгүй болсон байна.</p></section></Frame>;
  if (u.role === 'ADMIN') return <Frame name={u.name}>{head}<section className="panel"><p>Та админ эрхээр нэвтэрсэн байна. Үнэлгээг суралцагчийн эрхээр бөглөнө.</p></section></Frame>;
  if (r.course_id && !(await canAccessCourse(u.id, r.course_id))) return <Frame name={u.name}>{head}<section className="panel"><h2>Эрх хүрэхгүй байна</h2><p className="muted">Танай байгууллагад энэ сургалт нээгдээгүй байна.</p></section></Frame>;
  const qs = await templateQuestions(r.template_id);
  return (
    <Frame name={u.name}>
      {head}
      <div className="notice soft"><span className="small">{r.intro || 'Хичээлийн агуулга, багшийн заах арга, зохион байгуулалтыг үнэлнэ үү. Таны санал хичээлийг сайжруулахад тусална.'}</span>
        {r.anonymous && <span className="small muted">Энэ үнэлгээ нэргүй. Таны нэр үр дүнд харагдахгүй.</span>}</div>
      <EvalForm token={params.token} questions={qs.map(q => ({ id: q.id, section: q.section, kind: q.kind, text: q.text, options: q.options, required: q.required }))} />
    </Frame>
  );
}
