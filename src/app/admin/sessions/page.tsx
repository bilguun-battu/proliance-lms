import Link from 'next/link';
import { all } from '@/lib/db';
import { createSession, cancelSession } from '@/app/actions/admin';
import { openExamRun } from '@/app/actions/exams';
import { openEvalRun } from '@/app/actions/evals';
import { matchingTemplates } from '@/lib/evals';
import { Flash, Chip } from '@/components/ui';
import { fmtSession, fmtDateTime, TZ } from '@/lib/format';
import AudTabs, { audOf, AUD_DB } from '@/components/AudTabs';
import { FORMAT_LABEL } from '@/lib/progress';
import Submit from '@/components/Submit';
import AttendanceForm from '@/components/AttendanceForm';
import ModulePicker from './ModulePicker';

export default async function Sessions(
  props: { searchParams: Promise<{ ok?: string; err?: string; show?: string; open?: string; aud?: string }> }
) {
  const searchParams = await props.searchParams;
  const past = searchParams.show === 'past';
  const aud = audOf(searchParams.aud);
  const A = AUD_DB(aud);
  // Нийтлэгдсэн хувилбарын биечлэн/онлайн модулиуд
  const mods = await all<any>(`
    SELECT DISTINCT ON (v.course_id, m.module_key) v.course_id, c.title AS course, m.module_key, m.title, m.format, m.duration_min
      FROM modules m JOIN course_versions v ON v.id=m.version_id JOIN courses c ON c.id=v.course_id
     WHERE v.status='PUBLISHED' AND v.number = (SELECT max(number) FROM course_versions x WHERE x.course_id=v.course_id AND x.status='PUBLISHED')
       AND m.format IN ('INPERSON','ONLINE') AND c.audience=$1
     ORDER BY v.course_id, m.module_key`, [A]);
  const sessions = await all<any>(`
    SELECT s.*, c.title AS course,
      (SELECT m.title FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=s.course_id AND m.module_key=s.module_key ORDER BY v.number DESC LIMIT 1) AS module,
      (SELECT m.format FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=s.course_id AND m.module_key=s.module_key ORDER BY v.number DESC LIMIT 1) AS format
      FROM sessions s JOIN courses c ON c.id=s.course_id
     WHERE c.audience=$1 AND ${past ? 's.starts_at < now()' : "s.starts_at >= now() - interval '1 day'"}
     ORDER BY s.starts_at ${past ? 'DESC LIMIT 50' : 'ASC'}`, [A]);
  const trainerNames = await all<any>(`SELECT DISTINCT u.name FROM trainer_quals q JOIN users u ON u.id=q.user_id JOIN courses c ON c.id=q.course_id WHERE c.audience=$1 ORDER BY u.name`, [A]);
  const att = await all<any>(`
    SELECT a.session_id, a.status, u.id, u.name, o.name AS org FROM session_attendees a JOIN users u ON u.id=a.user_id LEFT JOIN orgs o ON o.id=u.org_id
     WHERE a.session_id = ANY($1) ORDER BY u.name`, [sessions.map(s => s.id)]);
  const exams = await all<any>(`SELECT e.id, e.title, e.course_id, e.module_key, e.duration_min FROM exams e ORDER BY e.title`);
  const runs = await all<any>(`SELECT r.id, r.session_id, r.opened_at, r.closes_at, r.closed_at FROM exam_runs r WHERE r.session_id = ANY($1) ORDER BY r.opened_at`, [sessions.map(s => s.id)]);
  const evalRuns = await all<any>(`SELECT r.id, r.session_id, r.opened_at, r.closes_at, r.closed_at, (SELECT count(*)::int FROM eval_responses x WHERE x.run_id=r.id) AS n
     FROM eval_runs r WHERE r.session_id = ANY($1) ORDER BY r.opened_at`, [sessions.map(s => s.id)]);
  const tmplFor = new Map<string, any[]>();
  for (const s of sessions) tmplFor.set(s.id, await matchingTemplates(s.course_id, s.format));
  const now = Date.now();
  return (
    <>
      <div className="head"><div><h1>Хуваарь</h1><p className="muted">Танхимын болон онлайн шууд хичээлүүд. Ирц батлахад тухайн модуль дууссанд тооцогдоно. Цаг: {TZ}</p></div>
        <Link className="link small" href={past ? `/admin/sessions?aud=${aud}` : `/admin/sessions?show=past&aud=${aud}`}>{past ? 'Ирэх хуваарь' : 'Өнгөрсөн хуваарь'}</Link></div>
      <AudTabs base="/admin/sessions" cur={aud} extra={{ show: searchParams.show }} />
      <Flash sp={searchParams} />
      {!past && <section className="panel">
        <h2>Хуваарь нэмэх</h2>
        {mods.length ? <form action={createSession} className="form">
          <ModulePicker mods={mods.map(m => ({ course_id: m.course_id, course: m.course, key: m.module_key, title: m.title, format: m.format, label: FORMAT_LABEL[m.format] }))} />
          <label className="fld"><span>Огноо</span><input type="date" name="date" required /></label>
          <label className="fld"><span>Цаг</span><input type="time" name="time" required defaultValue="10:00" /></label>
          <label className="fld"><span>Үргэлжлэх (мин)</span><input type="number" name="duration_min" defaultValue={60} min={15} /></label>
          <label className="fld"><span>Суудал</span><input type="number" name="seats" defaultValue={12} min={1} /></label>
          <label className="fld"><span>Байршил</span><input type="text" name="location" placeholder="Proliance сургалтын танхим, Midtown оффис" /></label>
          <label className="fld"><span>Онлайн холбоос (Zoom, Meet)</span><input type="text" name="link" placeholder="https://" /></label>
          <label className="fld"><span>Заах сургагч</span><input type="text" name="instructor" list="trainers" /><datalist id="trainers">{trainerNames.map(t => <option key={t.name} value={t.name} />)}</datalist></label>
          <div><Submit>Нэмэх</Submit></div>
        </form> : <p className="muted">Нийтлэгдсэн биечлэн эсвэл онлайн шууд модуль алга. Сургалтын модулийн хэлбэрийг тохируулна уу.</p>}
      </section>}
      <div className="stack">
        {sessions.map(s => {
          const people = att.filter(a => a.session_id === s.id);
          const started = new Date(s.starts_at).getTime() <= now;
          const cancelled = s.status === 'CANCELLED';
          return (
            <details key={s.id} className="panel" open={searchParams.open === s.id || (started && !cancelled && people.some(p => p.status === 'REGISTERED'))}>
              <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                <div className="head" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <strong className="num">{fmtSession(s.starts_at)}</strong> <span className="muted small">· {s.duration_min} мин</span>
                    <div><strong>{s.module}</strong> <span className="muted">· {s.course}</span></div>
                    <div className="meta"><span className="fmt">{FORMAT_LABEL[s.format] ?? ''}</span><span>{s.location}</span>{s.instructor && <span>{s.instructor}</span>}{s.link && <a className="link" href={s.link} target="_blank" rel="noreferrer">Холбоос</a>}</div>
                  </div>
                  <div className="acts">
                    {cancelled ? <Chip label="Цуцлагдсан" tone="crit" /> : <Chip label={`${people.length}/${s.seats} суудал`} tone="brand" />}
                    {!cancelled && people.some(p => p.status === 'ATTENDED') && <Chip label={`${people.filter(p => p.status === 'ATTENDED').length} ирсэн`} tone="ok" />}
                  </div>
                </div>
              </summary>
              {!cancelled && <div className="stack" style={{ marginTop: 12 }}>
                <AttendanceForm sessionId={s.id} people={people.map(p => ({ id: p.id, name: p.name, org: p.org ?? '', status: p.status }))} started={started} />
                {(() => {
                  const ex = exams.filter(e => e.course_id === s.course_id && (!e.module_key || e.module_key === s.module_key));
                  const rs = runs.filter(r => r.session_id === s.id);
                  return <div className="notice soft" style={{ gap: 10 }}>
                    <strong>Хичээлийн дараах шалгалт</strong>
                    {rs.map(r => <div key={r.id} className="acts" style={{ justifyContent: 'flex-start' }}>
                      <Link className="link" href={`/admin/exams/live/${r.id}`}>{fmtDateTime(r.opened_at)}-д эхэлсэн шалгалт</Link>
                      {!r.closed_at && new Date(r.closes_at).getTime() > now ? <Chip label="Явагдаж байна" tone="ok" /> : <Chip label="Дууссан" />}
                    </div>)}
                    {ex.length ? <form action={openExamRun} className="acts" style={{ justifyContent: 'flex-start' }}>
                      <input type="hidden" name="session_id" value={s.id} />
                      <select name="exam_id" style={{ width: 'auto' }}>{ex.map(e => <option key={e.id} value={e.id}>{e.title} · {e.duration_min} мин</option>)}</select>
                      <Submit className="btn sm">QR шалгалт эхлүүлэх</Submit>
                    </form> : <span className="small muted">Энэ модульд шалгалт үүсгээгүй байна. <Link className="link" href="/admin/exams">Шалгалт үүсгэх</Link></span>}
                  </div>;
                })()}
                {(() => {
                  const ts = tmplFor.get(s.id) ?? [];
                  const rs = evalRuns.filter(r => r.session_id === s.id);
                  return <div className="notice soft" style={{ gap: 10 }}>
                    <strong>Хичээлийн үнэлгээ</strong>
                    {rs.map(r => <div key={r.id} className="acts" style={{ justifyContent: 'flex-start' }}>
                      <Link className="link" href={`/admin/evaluations/live/${r.id}`}>{fmtDateTime(r.opened_at)}-д эхэлсэн үнэлгээ</Link>
                      <Chip label={`${r.n} хариулт`} tone={r.n ? 'ok' : 'neutral'} />
                      {!r.closed_at && new Date(r.closes_at).getTime() > now && <Chip label="Нээлттэй" tone="ok" />}
                    </div>)}
                    {ts.length ? <form action={openEvalRun} className="acts" style={{ justifyContent: 'flex-start' }}>
                      <input type="hidden" name="session_id" value={s.id} />
                      <select name="template_id" style={{ width: 'auto' }}>{ts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                      <Submit className="btn sm">Үнэлгээний QR эхлүүлэх</Submit>
                    </form> : <span className="small muted">Энэ төрлийн хичээлд үнэлгээний маягт алга. <Link className="link" href="/admin/evaluations">Маягт үүсгэх</Link></span>}
                  </div>;
                })()}
                {!started && <form action={cancelSession}><input type="hidden" name="session_id" value={s.id} />
                  <Submit className="btn sm danger" confirmText="Хуваарийг цуцалж, бүртгүүлсэн хүмүүст мэдэгдэх үү?">Хуваарь цуцлах</Submit></form>}
              </div>}
            </details>
          );
        })}
        {!sessions.length && <div className="list"><div className="empty">{past ? 'Өнгөрсөн хуваарь алга.' : 'Ирэх хуваарь алга.'}</div></div>}
      </div>
    </>
  );
}
