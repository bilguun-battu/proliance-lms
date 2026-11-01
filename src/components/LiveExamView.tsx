import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all, one } from '@/lib/db';
import { closeExamRun, extendExamRun } from '@/app/actions/exams';
import { openEvalRun } from '@/app/actions/evals';
import { matchingTemplates } from '@/lib/evals';
import { examUrl, qrSvg, runIsOpen } from '@/lib/exams';
import { Flash, Chip } from '@/components/ui';
import { fmtDateTime, fmtSession } from '@/lib/format';
import Submit from '@/components/Submit';
import LiveRefresh from '@/components/LiveRefresh';
import CopyLink from '@/components/CopyLink';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Явагдаж буй QR шалгалт: админ болон тухайн хичээлийн сургагч багш харна
export default async function LiveExamView({ id, searchParams, admin }: { id: string; searchParams: { ok?: string; err?: string }; admin: boolean }) {
  const params = { id };
  const r = await one<any>(`
    SELECT r.*, e.title, e.pass_score, e.duration_min, e.check_mode, e.eval_template_id, e.id AS exam_id, e.course_id, c.title AS course, s.starts_at AS session_at, s.location
      FROM exam_runs r JOIN exams e ON e.id=r.exam_id JOIN courses c ON c.id=e.course_id LEFT JOIN sessions s ON s.id=r.session_id WHERE r.id=$1`, [params.id]);
  if (!r) notFound();
  const open = runIsOpen(r);
  const url = examUrl(r.token);
  const svg = open ? await qrSvg(url) : '';
  const attempts = await all<any>(`
    SELECT a.*, u.name, o.name AS org FROM exam_attempts a JOIN users u ON u.id=a.user_id
      LEFT JOIN orgs o ON o.id=u.org_id WHERE a.run_id=$1 ORDER BY a.review_status='PENDING' DESC, a.submitted_at NULLS FIRST, u.name, a.attempt_no`, [r.id]);
  const registered = r.session_id ? await all<any>(`
    SELECT u.name FROM session_attendees sa JOIN users u ON u.id=sa.user_id WHERE sa.session_id=$1
       AND NOT EXISTS (SELECT 1 FROM exam_attempts a WHERE a.run_id=$2 AND a.user_id=sa.user_id) ORDER BY u.name`, [r.session_id, r.id]) : [];
  const done = attempts.filter(a => a.submitted_at);
  const pending = attempts.filter(a => a.review_status === 'PENDING').length;
  const fmtRow = r.session_id ? await one<any>(`SELECT m.format FROM sessions s JOIN course_versions v ON v.course_id=s.course_id AND v.status='PUBLISHED'
      JOIN modules m ON m.version_id=v.id AND m.module_key=s.module_key WHERE s.id=$1 ORDER BY v.number DESC LIMIT 1`, [r.session_id]) : null;
  const evalTemplates = await matchingTemplates(r.course_id, fmtRow?.format ?? null);
  // Шалгалтад холбосон үнэлгээний маягтыг эхэнд нь тавина
  if (r.eval_template_id) {
    const t = evalTemplates.find(x => x.id === r.eval_template_id) ?? await one<any>('SELECT id, name FROM eval_templates WHERE id=$1', [r.eval_template_id]);
    if (t) evalTemplates.splice(0, evalTemplates.length, t, ...evalTemplates.filter(x => x.id !== t.id));
  }
  const evalOpen = r.session_id ? await one<any>(`SELECT id FROM eval_runs WHERE session_id=$1 AND closed_at IS NULL AND closes_at > now() ORDER BY opened_at DESC LIMIT 1`, [r.session_id]) : null;
  return (
    <>
      <div><Link className="link small" href={admin ? `/admin/exams/${r.exam_id}` : '/portal/teach'}>← {admin ? r.title : 'Заах хуваарь'}</Link></div>
      <div className="head">
        <div><h1>{r.title}</h1><p className="muted">{r.course}{r.session_at ? ` · Хичээл: ${fmtSession(r.session_at)}, ${r.location}` : ''}</p></div>
        {open ? <LiveRefresh until={r.closes_at} active /> : <Chip label={`Дууссан · ${fmtDateTime(r.closed_at ?? r.closes_at)}`} />}
      </div>
      <Flash sp={searchParams} />
      {open ? (
        <section className="panel" style={{ textAlign: 'center', justifyItems: 'center' }}>
          <h2>Утсаараа QR кодыг уншуулж шалгалтаа өгнө үү</h2>
          <div style={{ width: 'min(380px, 80vw)' }} dangerouslySetInnerHTML={{ __html: svg }} />
          <CopyLink url={url} />
          <p className="small muted">{r.duration_min > 0 ? `Оролцогч бүрт ${r.duration_min} минут. ` : ''}Асуулт оролцогч бүрт санамсаргүйгээр сонгогдоно. Шалгалт дуусахад холбоос ажиллахгүй болно.</p>
          <div className="acts" style={{ justifyContent: 'center' }}>
            <form action={extendExamRun}><input type="hidden" name="run_id" value={r.id} /><Submit className="btn ghost">+10 минут сунгах</Submit></form>
            <form action={closeExamRun}><input type="hidden" name="run_id" value={r.id} /><Submit className="btn danger" confirmText="Шалгалтыг дуусгах уу? Холбоос идэвхгүй болж, эхэлсэн хүмүүсийн хариулт одоо байгаагаар дүгнэгдэнэ.">Шалгалт дуусгах</Submit></form>
          </div>
        </section>
      ) : <div className="notice soft"><strong>Шалгалт дууссан. Холбоос идэвхгүй болсон.</strong><span className="small muted">{done.length} хариулт ирж, {done.filter(a => a.passed).length} тэнцсэн. Тэнцсэн хүмүүсийн ирц батлагдаж, модуль дууссанд тооцогдсон.{pending ? ` ${pending} хариултыг багш шалгах шаардлагатай.` : ''}</span></div>}

      {admin && evalTemplates.length > 0 && <section className="panel">
        <div className="head">
          <div><h2>Дараагийн алхам: хичээлийн үнэлгээ</h2><p className="small muted" style={{ margin: '4px 0 0' }}>Шалгалтын дараа оролцогчид хичээлийн агуулга, багшийн заах аргыг тусдаа QR-ээр үнэлнэ.</p></div>
          {evalOpen ? <Link className="btn" href={`/admin/evaluations/live/${evalOpen.id}`}>Үнэлгээний QR харах</Link>
            : <form action={openEvalRun} className="acts">
              {r.session_id && <input type="hidden" name="session_id" value={r.session_id} />}
              <input type="hidden" name="course_id" value={r.course_id} />
              <select name="template_id" style={{ width: 'auto' }}>{evalTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <Submit>Үнэлгээний QR эхлүүлэх</Submit>
            </form>}
        </div>
      </section>}

      <section className="panel">
        <div className="head"><h2>Үр дүн ({done.length}/{attempts.length})</h2>
          {admin && <a className="btn sm ghost" href={`${base}/api/exams/${r.id}/export`}>Excel татах</a>}</div>
        <div className="tablewrap"><table>
          <thead><tr><th>Оролцогч</th><th className="r">Оролдлого</th><th>Төлөв</th><th className="r">Оноо</th><th>Илгээсэн</th><th></th></tr></thead>
          <tbody>{attempts.map(a => (
            <tr key={a.id}>
              <td><strong>{a.name}</strong><div className="small muted">{a.org}</div></td>
              <td className="r num">{a.attempt_no}</td>
              <td>{!a.submitted_at ? <Chip label="Өгч байна" tone="info" /> : a.review_status === 'PENDING' ? <Chip label="Шалгах" tone="warn" />
                : <Chip label={a.result_label ?? (a.passed ? 'Тэнцсэн' : 'Тэнцээгүй')} tone={a.passed ? 'ok' : 'crit'} />}</td>
              <td className="r num">{a.points != null && Number(a.max_points) > 0 ? `${Number(a.points)}/${Number(a.max_points)}` : '—'}{a.score != null && Number(a.max_points) > 0 ? <span className="muted"> · {a.score}%</span> : null}</td>
              <td className="small muted">{fmtDateTime(a.submitted_at)}</td>
              <td>{admin && a.submitted_at && <Link className={`btn sm ${a.review_status === 'PENDING' ? '' : 'ghost'}`} href={`/admin/exams/review/${a.id}`}>{a.review_status === 'PENDING' ? 'Шалгах' : 'Харах'}</Link>}</td>
            </tr>))}
            {!attempts.length && <tr><td colSpan={6} className="muted">Одоогоор хэн ч эхлээгүй байна.</td></tr>}
          </tbody>
        </table></div>
        {registered.length > 0 && <p className="small muted">Бүртгүүлсэн боловч эхлээгүй: {registered.map(x => x.name).join(', ')}</p>}
      </section>
    </>
  );
}
