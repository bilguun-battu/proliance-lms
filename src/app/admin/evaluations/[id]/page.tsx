import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all, one } from '@/lib/db';
import { updateTemplate, deleteTemplate, copyTemplate, addEvalQuestion, deleteEvalQuestion, moveEvalQuestion, openEvalRun } from '@/app/actions/evals';
import { templateQuestions, KIND_LABEL, summarize } from '@/lib/evals';
import { Flash, Chip } from '@/components/ui';
import { FORMAT_LABEL } from '@/lib/progress';
import { fmtDateTime } from '@/lib/format';
import Submit from '@/components/Submit';
import EvalResults from '@/components/EvalResults';

export default async function TemplateEdit({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; err?: string } }) {
  const t = await one<any>('SELECT * FROM eval_templates WHERE id=$1', [params.id]);
  if (!t) notFound();
  const courses = await all<any>('SELECT id, title FROM courses ORDER BY title');
  const qs = await templateQuestions(t.id);
  const runs = await all<any>(`
    SELECT r.*, c.title AS course, (SELECT count(*)::int FROM eval_responses x WHERE x.run_id=r.id) AS n
      FROM eval_runs r LEFT JOIN courses c ON c.id=r.course_id WHERE r.template_id=$1 ORDER BY r.opened_at DESC LIMIT 30`, [t.id]);
  const summary = runs.length ? await summarize(runs.map(r => r.id), !t.anonymous) : null;
  const sections = Array.from(new Set(qs.map(q => q.section)));
  const hid = (q: any) => <><input type="hidden" name="template_id" value={t.id} /><input type="hidden" name="question_id" value={q.id} /></>;
  return (
    <>
      <div><Link className="link small" href="/admin/evaluations">← Бүх маягт</Link></div>
      <div className="head">
        <div><h1>{t.name}</h1><p className="muted">{t.format ? FORMAT_LABEL[t.format] : 'Бүх төрөл'} · {courses.find(c => c.id === t.course_id)?.title ?? 'Бүх сургалт'}{t.anonymous ? ' · Нэргүй' : ''}</p></div>
        <div className="acts">
          <form action={copyTemplate}><input type="hidden" name="template_id" value={t.id} /><Submit className="btn ghost">Хуулж шинэ маягт</Submit></form>
          <form action={openEvalRun}><input type="hidden" name="template_id" value={t.id} /><Submit confirmText="Хуваарьгүйгээр үнэлгээний QR эхлүүлэх үү? Хичээлтэй холбох бол Хуваарь цэснээс эхлүүлнэ үү.">QR үнэлгээ эхлүүлэх</Submit></form>
        </div>
      </div>
      <Flash sp={searchParams} />
      <section className="panel">
        <h2>Асуултууд ({qs.length})</h2>
        {sections.map(sec => (
          <div key={sec} className="stack" style={{ gap: 0 }}>
            <h3 className="fmt" style={{ fontSize: '.8rem', paddingTop: 8 }}>{sec}</h3>
            {qs.filter(q => q.section === sec).map(q => {
              const i = qs.indexOf(q);
              return (
                <div key={q.id} className="row" style={{ padding: '10px 0' }}>
                  <div><span>{q.text}</span>
                    <div className="meta"><span>{KIND_LABEL[q.kind]}</span>{q.kind === 'CHOICE' && <span>{q.options.join(' / ')}</span>}{!q.required && <span>Заавал биш</span>}</div></div>
                  <div className="acts">
                    <form action={moveEvalQuestion}>{hid(q)}<input type="hidden" name="dir" value="up" /><button className="btn sm ghost" disabled={i === 0} aria-label="Дээш">↑</button></form>
                    <form action={moveEvalQuestion}>{hid(q)}<input type="hidden" name="dir" value="down" /><button className="btn sm ghost" disabled={i === qs.length - 1} aria-label="Доош">↓</button></form>
                    <form action={deleteEvalQuestion}>{hid(q)}<Submit className="btn sm danger" confirmText="Асуултыг устгах уу?">Устгах</Submit></form>
                  </div>
                </div>);
            })}
          </div>))}
        {!qs.length && <p className="muted">Асуулт алга.</p>}
        <form action={addEvalQuestion} className="form" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <input type="hidden" name="template_id" value={t.id} />
          <label className="fld"><span>Хэсэг</span><input type="text" name="section" list="sections" placeholder="Ж: Багшийн заах арга" />
            <datalist id="sections">{['Хичээлийн агуулга', 'Багшийн заах арга', 'Зохион байгуулалт', 'Санал', ...sections].filter((v, i, a) => a.indexOf(v) === i).map(x => <option key={x} value={x} />)}</datalist></label>
          <label className="fld"><span>Төрөл</span><select name="kind" defaultValue="RATING"><option value="RATING">1–5 оноо</option><option value="CHOICE">Сонголт</option><option value="TEXT">Сэтгэгдэл</option></select></label>
          <label className="fld full"><span>Асуулт</span><input type="text" name="text" required /></label>
          <label className="fld full"><span>Сонголтууд (зөвхөн "Сонголт" төрөлд, мөр бүрт нэг)</span><textarea name="options" rows={3} /></label>
          <label className="checks"><label><input type="checkbox" name="required" defaultChecked /> Заавал хариулна</label></label>
          <div><Submit className="btn ghost">+ Асуулт нэмэх</Submit></div>
        </form>
      </section>
      <div className="grid2">
        <section className="panel">
          <h2>Тохиргоо</h2>
          <form action={updateTemplate} className="form">
            <input type="hidden" name="template_id" value={t.id} />
            <label className="fld full"><span>Нэр</span><input type="text" name="name" defaultValue={t.name} required /></label>
            <label className="fld"><span>Хичээлийн төрөл</span><select name="format" defaultValue={t.format ?? ''}><option value="">Бүх төрөл</option>{Object.entries(FORMAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="fld"><span>Сургалт</span><select name="course_id" defaultValue={t.course_id ?? ''}><option value="">Бүх сургалт</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
            <label className="fld full"><span>Оролцогчид харагдах тайлбар</span><textarea name="intro" defaultValue={t.intro} placeholder="Ж: Таны санал хичээлийг сайжруулахад тусална." /></label>
            <label className="checks full"><label><input type="checkbox" name="anonymous" defaultChecked={t.anonymous} /> Нэргүй</label></label>
            <div><Submit>Хадгалах</Submit></div>
          </form>
          <form action={deleteTemplate}><input type="hidden" name="template_id" value={t.id} /><Submit className="btn sm danger" confirmText="Маягтыг бүх хариултын хамт устгах уу?">Маягт устгах</Submit></form>
        </section>
        <section className="panel">
          <h2>Авсан үнэлгээ</h2>
          {runs.length ? <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>{runs.map(r => (
            <Link key={r.id} href={`/admin/evaluations/live/${r.id}`} className="row">
              <div><strong className="num">{fmtDateTime(r.opened_at)}</strong><div className="meta"><span>{r.course ?? '—'}</span>{r.instructor && <span>{r.instructor}</span>}</div></div>
              <div className="acts"><Chip label={`${r.n} хариулт`} tone={r.n ? 'ok' : 'neutral'} /></div>
            </Link>))}</div> : <p className="muted">Үнэлгээ авч байгаагүй.</p>}
        </section>
      </div>
      {summary && <section className="panel"><h2>Нэгдсэн үр дүн (бүх удаа)</h2><EvalResults data={summary} /></section>}
    </>
  );
}
