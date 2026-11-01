import Link from 'next/link';
import { all } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { getOffering, offeringSessions, offCode, ENR_LABEL, ATT_LABEL, enrollOpen, type EnrStatus } from '@/lib/offerings';
import { attendanceAction, enrollUser, dropUser, promoteUser, resultAction } from '@/app/actions/offerings';
import { openExamRun } from '@/app/actions/exams';
import { openEvalRun } from '@/app/actions/evals';
import { matchingTemplates } from '@/lib/evals';
import { Chip } from '@/components/ui';
import { fmtSession, fmtDate, fmtDateTime, fmtDuration } from '@/lib/format';
import { FORMAT_LABEL, CATEGORY_LABEL } from '@/lib/progress';
import AttendanceForm from '@/components/AttendanceForm';
import Submit from '@/components/Submit';

// Хуваарьт сургалтын удирдлага: хичээлийн цагууд, ирц, оролцогчдын жагсаалт, дүн, хүлээлгийн жагсаалт.
// Админ ба тухайн хуваарийн сургагч багш ашиглана.
export default async function OfferingManage({ id, me, base, examBase }: { id: string; me: SessionUser; base: string; examBase: string }) {
  const o = (await getOffering(id))!;
  const sessions = await offeringSessions([id]);
  const enr = await all<any>(`
    SELECT e.*, u.name, u.email, u.position, o.name AS org FROM offering_enrollments e JOIN users u ON u.id=e.user_id LEFT JOIN orgs o ON o.id=u.org_id
     WHERE e.offering_id=$1 ORDER BY CASE e.status WHEN 'WAITLISTED' THEN 1 WHEN 'DROPPED' THEN 2 ELSE 0 END, e.waitlisted_at NULLS FIRST, u.name`, [id]);
  const att = await all<any>(`SELECT a.session_id, a.user_id, a.status FROM session_attendees a JOIN sessions s ON s.id=a.session_id WHERE s.offering_id=$1`, [id]);
  const roster = enr.filter(e => ['ENROLLED', 'COMPLETED', 'UNSUCCESSFUL'].includes(e.status));
  const waiting = enr.filter(e => e.status === 'WAITLISTED');
  const dropped = enr.filter(e => e.status === 'DROPPED');
  const exams = await all<any>(`SELECT id, title, module_key, duration_min FROM exams WHERE course_id=$1 AND status='ACTIVE' ORDER BY title`, [o.course_id]);
  const runs = await all<any>(`SELECT id, session_id, opened_at, closes_at, closed_at FROM exam_runs WHERE session_id = ANY($1) ORDER BY opened_at`, [sessions.map(s => s.id)]);
  const evalRuns = me.role === 'ADMIN' ? await all<any>(`SELECT r.id, r.session_id, r.opened_at, (SELECT count(*)::int FROM eval_responses x WHERE x.run_id=r.id) AS n
     FROM eval_runs r WHERE r.session_id = ANY($1) ORDER BY r.opened_at`, [sessions.map(s => s.id)]) : [];
  const candidates = await all<any>(`
    SELECT u.id, u.name, o.name AS org FROM users u LEFT JOIN orgs o ON o.id=u.org_id
     WHERE u.role IN ('LEARNER','COORDINATOR') AND u.active AND coalesce(o.is_internal,false) = $2
       AND NOT EXISTS (SELECT 1 FROM offering_enrollments e WHERE e.offering_id=$1 AND e.user_id=u.id AND e.status <> 'DROPPED')
     ORDER BY o.name, u.name LIMIT 500`, [id, o.audience === 'INTERNAL']);
  const now = Date.now();
  const tmpl = new Map<string, any[]>();
  if (me.role === 'ADMIN') for (const x of sessions) tmpl.set(x.id, await matchingTemplates(o.course_id, x.format));
  const hid = <><input type="hidden" name="offering_id" value={id} /><input type="hidden" name="back" value={`${base}/${id}`} /></>;
  const free = Math.max(0, o.max_capacity - o.taken);
  return (
    <>
      <section className="panel">
        <div className="head" style={{ alignItems: 'flex-start' }}>
          <div>
            <p className="small muted" style={{ margin: 0 }}><span className="num">{offCode(o.num)}</span> · {CATEGORY_LABEL[o.category]}</p>
            <h1>{o.course}</h1>
            <p className="muted">{o.first_at ? `${fmtSession(o.first_at)}${o.last_at && fmtDate(o.last_at) !== fmtDate(o.first_at) ? ` – ${fmtDate(o.last_at)}` : ''}` : 'Хичээлийн цаг оруулаагүй'} · {o.location}</p>
          </div>
          <div className="acts">
            {o.status === 'CANCELLED' ? <Chip label="Цуцлагдсан" tone="crit" /> : enrollOpen(o) ? <Chip label="Бүртгэл нээлттэй" tone="ok" /> : <Chip label="Бүртгэл хаагдсан" />}
          </div>
        </div>
        <div className="offstats">
          <div><span>Бүртгэгдсэн</span><strong className="num">{o.taken}/{o.max_capacity}</strong>{o.min_capacity > 0 && o.taken < o.min_capacity && <em>доод тал нь {o.min_capacity}</em>}</div>
          <div><span>Сул суудал</span><strong className="num">{free}</strong></div>
          <div><span>Хүлээлгийн жагсаалт</span><strong className="num">{o.waiting}/{o.waitlist_capacity}</strong>{o.auto_waitlist && <em>автоматаар бүртгэнэ</em>}</div>
          <div><span>Сургагч багш</span><strong>{o.instructor ?? '—'}</strong></div>
          <div><span>Бүртгүүлэх эцсийн хугацаа</span><strong>{fmtDate(o.enroll_deadline ?? o.first_at) || '—'}</strong></div>
          <div><span>Цуцлах эцсийн хугацаа</span><strong>{fmtDate(o.drop_deadline ?? o.first_at) || '—'}</strong></div>
        </div>
        {o.link && <p className="small" style={{ margin: 0 }}>Онлайн холбоос: <a className="link" href={o.link} target="_blank" rel="noreferrer">{o.link}</a></p>}
        {o.notes && <p className="small muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{o.notes}</p>}
      </section>

      <section className="stack">
        <h2>Хичээлийн цагууд ({sessions.length})</h2>
        {sessions.map(s => {
          const people = roster.map(e => ({ id: e.user_id, name: e.name, org: e.org ?? '', status: att.find(a => a.session_id === s.id && a.user_id === e.user_id)?.status ?? 'REGISTERED' }));
          const started = new Date(s.starts_at).getTime() <= now;
          const ex = exams.filter(e => !e.module_key || e.module_key === s.module_key);
          const rs = runs.filter(r => r.session_id === s.id);
          const ers = evalRuns.filter(r => r.session_id === s.id);
          return (
            <details key={s.id} id={`s-${s.id}`} className="panel" open={started && people.some(p => p.status === 'REGISTERED') && o.status !== 'CANCELLED'}>
              <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                <div className="head" style={{ alignItems: 'flex-start' }}>
                  <div><strong className="num">{fmtSession(s.starts_at)}</strong> <span className="muted small">· {fmtDuration(s.duration_min)}</span>
                    <div><strong>{s.module}</strong></div>
                    <div className="meta"><span className="fmt">{FORMAT_LABEL[s.format] ?? ''}</span><span>{s.location}</span>{s.instructor && <span>{s.instructor}</span>}
                      {s.link && <a className="link" href={s.link} target="_blank" rel="noreferrer">Холбоос</a>}</div></div>
                  <div className="acts">
                    {s.status === 'CANCELLED' ? <Chip label="Цуцлагдсан" tone="crit" /> : <Chip label={`${people.filter(p => p.status === 'ATTENDED').length}/${people.length} ирсэн`} tone={started ? 'ok' : 'neutral'} />}
                  </div>
                </div>
              </summary>
              {s.status !== 'CANCELLED' && <div className="stack" style={{ marginTop: 12 }}>
                <AttendanceForm action={attendanceAction} offeringId={id} sessionId={s.id} back={`${base}/${id}`} people={people} started={started} />
                <div className="notice soft" style={{ gap: 10 }}>
                  <strong>Хичээлийн дараах шалгалт</strong>
                  {rs.map(r => <div key={r.id} className="acts" style={{ justifyContent: 'flex-start' }}>
                    <Link className="link" href={`${examBase}/${r.id}`}>{fmtDateTime(r.opened_at)}-д эхэлсэн шалгалт</Link>
                    {!r.closed_at && new Date(r.closes_at).getTime() > now ? <Chip label="Явагдаж байна" tone="ok" /> : <Chip label="Дууссан" />}
                  </div>)}
                  {ex.length ? <form action={openExamRun} className="acts" style={{ justifyContent: 'flex-start' }}>
                    <input type="hidden" name="session_id" value={s.id} />
                    <select name="exam_id" style={{ width: 'auto' }}>{ex.map(e => <option key={e.id} value={e.id}>{e.title}{e.duration_min > 0 ? ` · ${e.duration_min} мин` : ''}</option>)}</select>
                    <Submit className="btn sm">QR шалгалт эхлүүлэх</Submit>
                  </form> : <span className="small muted">Энэ хичээлд шалгалт үүсгээгүй байна.</span>}
                </div>
                {me.role === 'ADMIN' && (() => {
                  const tsx = tmpl.get(s.id) ?? [];
                  return <div className="notice soft" style={{ gap: 10 }}>
                    <strong>Хичээлийн үнэлгээ</strong>
                    {ers.map(r => <div key={r.id} className="acts" style={{ justifyContent: 'flex-start' }}>
                      <Link className="link" href={`/admin/evaluations/live/${r.id}`}>{fmtDateTime(r.opened_at)}-д эхэлсэн үнэлгээ</Link><Chip label={`${r.n} хариулт`} tone={r.n ? 'ok' : 'neutral'} /></div>)}
                    {tsx.length ? <form action={openEvalRun} className="acts" style={{ justifyContent: 'flex-start' }}>
                      <input type="hidden" name="session_id" value={s.id} />
                      <select name="template_id" style={{ width: 'auto' }}>{tsx.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                      <Submit className="btn sm">Үнэлгээний QR эхлүүлэх</Submit>
                    </form> : <span className="small muted">Үнэлгээний маягт алга.</span>}
                  </div>;
                })()}
              </div>}
            </details>);
        })}
      </section>

      <section className="panel" id="roster">
        <div className="head"><h2>Оролцогчдын жагсаалт ({roster.length})</h2></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Оролцогч</th><th>Ирц</th><th>Төлөв</th><th>Эцсийн дүн</th><th></th></tr></thead>
          <tbody>{roster.map(e => {
            const st = e.status as EnrStatus;
            return (
              <tr key={e.user_id}>
                <td><strong>{e.name}</strong><div className="small muted">{[e.org, e.position].filter(Boolean).join(' · ')}</div></td>
                <td><div className="attdots">{sessions.map(s => {
                  const a = att.find(x => x.session_id === s.id && x.user_id === e.user_id)?.status ?? 'REGISTERED';
                  return <span key={s.id} className={`attdot c-${ATT_LABEL[a][1]}`} title={`${fmtSession(s.starts_at)} · ${s.module}: ${ATT_LABEL[a][0]}`} />;
                })}</div></td>
                <td><Chip label={ENR_LABEL[st][0]} tone={ENR_LABEL[st][1]} />{e.score != null && <div className="small muted">Оноо: {Number(e.score)}</div>}</td>
                <td>
                  <form action={resultAction} className="acts" style={{ justifyContent: 'flex-start', flexWrap: 'nowrap' }}>
                    {hid}<input type="hidden" name="user_id" value={e.user_id} />
                    <select name="grade" defaultValue={e.grade ?? 'PASS'} style={{ width: 'auto' }}><option value="PASS">Тэнцсэн</option><option value="FAIL">Тэнцээгүй</option></select>
                    <input type="number" name="score" step="any" placeholder="Оноо" defaultValue={e.score ?? ''} style={{ width: 80 }} />
                    <Submit className="btn sm ghost">Хадгалах</Submit>
                  </form>
                </td>
                <td>{st === 'ENROLLED' && <form action={dropUser}>{hid}<input type="hidden" name="user_id" value={e.user_id} />
                  <Submit className="btn sm danger" confirmText={`${e.name}-ийг бүртгэлээс хасах уу?`}>Хасах</Submit></form>}</td>
              </tr>);
          })}
            {!roster.length && <tr><td colSpan={5} className="muted">Бүртгэгдсэн хүн алга.</td></tr>}
          </tbody>
        </table></div>
        <p className="small muted" style={{ margin: 0 }}>Бүх хичээлд "Ирсэн" бол автоматаар "Дүүргэсэн" болно. Эцсийн дүнг "Тэнцсэн" гэж хадгалахад хуваарийн бүх хичээл дууссанд тооцогдоно, "Тэнцээгүй" бол "Амжилтгүй" болж дахин бүртгүүлнэ.</p>
        {o.status === 'SCHEDULED' && <form action={enrollUser} className="form" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          {hid}
          <label className="fld"><span>Суралцагч бүртгэх</span>
            <select name="user_id" required defaultValue=""><option value="" disabled>Сонгоно уу</option>
              {candidates.map(c => <option key={c.id} value={c.id}>{c.name}{c.org ? ` · ${c.org}` : ''}</option>)}</select></label>
          <label className="checks"><label><input type="checkbox" name="force" /> Багтаамж, эцсийн хугацаанаас үл хамааран бүртгэх</label></label>
          <div><Submit className="btn">Бүртгэх</Submit></div>
        </form>}
      </section>

      {(waiting.length > 0 || o.waitlist_capacity > 0) && <section className="panel">
        <h2>Хүлээлгийн жагсаалт ({waiting.length}/{o.waitlist_capacity})</h2>
        {waiting.length ? <div className="tablewrap"><table>
          <thead><tr><th>#</th><th>Нэр</th><th>Орсон</th><th></th></tr></thead>
          <tbody>{waiting.map((e, i) => (
            <tr key={e.user_id}><td className="num">{i + 1}</td><td><strong>{e.name}</strong><div className="small muted">{e.org}</div></td>
              <td className="small muted">{fmtDateTime(e.waitlisted_at)}</td>
              <td><div className="acts" style={{ flexWrap: 'nowrap' }}>
                <form action={promoteUser}>{hid}<input type="hidden" name="user_id" value={e.user_id} /><Submit className="btn sm">Бүртгэх</Submit></form>
                <form action={dropUser}>{hid}<input type="hidden" name="user_id" value={e.user_id} /><Submit className="btn sm danger">Хасах</Submit></form>
              </div></td></tr>))}</tbody>
        </table></div> : <p className="small muted">Хүлээлгийн жагсаалт хоосон.</p>}
      </section>}

      {dropped.length > 0 && <details className="panel"><summary className="small" style={{ cursor: 'pointer' }}>Цуцалсан ({dropped.length})</summary>
        <p className="small muted">{dropped.map(e => `${e.name} (${fmtDate(e.dropped_at)})`).join(', ')}</p></details>}
    </>
  );
}
