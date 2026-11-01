import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all, one } from '@/lib/db';
import { updateExam, deleteExam, addVariant, deleteVariant, addExamQuestion, deleteExamQuestion, openExamRun } from '@/app/actions/exams';
import { Flash, Chip } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import Submit from '@/components/Submit';

export default async function ExamEdit({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; err?: string; v?: string } }) {
  const e = await one<any>(`SELECT e.*, c.title AS course FROM exams e JOIN courses c ON c.id=e.course_id WHERE e.id=$1`, [params.id]);
  if (!e) notFound();
  const variants = await all<any>(`SELECT v.*, (SELECT count(*)::int FROM exam_questions q WHERE q.variant_id=v.id) AS n FROM exam_variants v WHERE exam_id=$1 ORDER BY position`, [e.id]);
  const cur = variants.find(v => v.id === searchParams.v) ?? variants[0];
  const qs = cur ? await all<any>('SELECT * FROM exam_questions WHERE variant_id=$1 ORDER BY position', [cur.id]) : [];
  const runs = await all<any>(`
    SELECT r.*, (SELECT count(*)::int FROM exam_attempts a WHERE a.run_id=r.id) AS n,
           (SELECT count(*)::int FROM exam_attempts a WHERE a.run_id=r.id AND a.passed) AS passed
      FROM exam_runs r WHERE r.exam_id=$1 ORDER BY r.opened_at DESC LIMIT 20`, [e.id]);
  const ready = variants.every(v => v.n > 0);
  const hv = <><input type="hidden" name="exam_id" value={e.id} /><input type="hidden" name="variant_id" value={cur?.id} /></>;
  return (
    <>
      <div><Link className="link small" href="/admin/exams">← Бүх шалгалт</Link></div>
      <div className="head">
        <div><h1>{e.title}</h1><p className="muted">{e.course}</p></div>
        <form action={openExamRun}><input type="hidden" name="exam_id" value={e.id} /><Submit className="btn" confirmText="Хуваарьгүйгээр шалгалт эхлүүлж QR код үүсгэх үү? Хичээлийн хуваарьтай холбох бол Хуваарь цэснээс эхлүүлнэ үү.">QR шалгалт эхлүүлэх</Submit></form>
      </div>
      <Flash sp={searchParams} />
      {!ready && <div className="alert err">Асуултгүй хувилбар байна. Бүх хувилбарт асуулт нэмсний дараа шалгалт эхлүүлнэ.</div>}

      <section className="panel">
        <div className="head"><h2>Хувилбарууд</h2>
          <div className="acts">
            <form action={addVariant}><input type="hidden" name="exam_id" value={e.id} /><Submit className="btn sm ghost">+ Хоосон хувилбар</Submit></form>
            {cur && <form action={addVariant}><input type="hidden" name="exam_id" value={e.id} /><input type="hidden" name="copy_from" value={cur.id} /><Submit className="btn sm ghost">{cur.name}-аас хуулах</Submit></form>}
          </div></div>
        <div className="tabrow" style={{ borderBottom: '1px solid var(--line)' }}>
          {variants.map(v => <Link key={v.id} href={`/admin/exams/${e.id}?v=${v.id}`} className="tab" aria-current={v.id === cur?.id ? 'page' : undefined}>{v.name} <span className="badge" style={{ background: v.n ? 'var(--green)' : 'var(--crit)' }}>{v.n}</span></Link>)}
        </div>
        {cur && <>
          {qs.map((q, i) => (
            <div key={q.id} className="q">
              <div className="acts" style={{ justifyContent: 'space-between' }}>
                <strong>{i + 1}. {q.text}</strong>
                <form action={deleteExamQuestion}>{hv}<input type="hidden" name="question_id" value={q.id} /><Submit className="btn sm danger" confirmText="Асуултыг устгах уу?">Устгах</Submit></form>
              </div>
              <ol className="small" style={{ margin: 0 }}>{(q.options as string[]).map((o, j) => <li key={j} style={j === q.correct_index ? { color: 'var(--ok)', fontWeight: 700 } : undefined}>{o}{j === q.correct_index ? ' ✓' : ''}</li>)}</ol>
            </div>))}
          {!qs.length && <p className="muted">{cur.name}-д асуулт алга.</p>}
          <form action={addExamQuestion} className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            {hv}
            <label className="fld"><span>{cur.name}: шинэ асуулт</span><input type="text" name="text" required /></label>
            <div className="form">
              {[1, 2, 3, 4, 5].map(i => <label key={i} className="fld"><span>Хариулт {i}{i > 2 ? ' (заавал биш)' : ''}</span><input type="text" name={`opt${i}`} required={i <= 2} /></label>)}
              <label className="fld"><span>Зөв хариулт</span><select name="correct" defaultValue="1">{[1, 2, 3, 4, 5].map(i => <option key={i} value={i}>{i}</option>)}</select></label>
            </div>
            <div className="acts" style={{ justifyContent: 'flex-start' }}>
              <Submit className="btn ghost">+ Асуулт нэмэх</Submit>
            </div>
          </form>
          {variants.length > 1 && <form action={deleteVariant}>{hv}<Submit className="btn sm danger" confirmText={`${cur.name}-ийг устгах уу?`}>{cur.name} устгах</Submit></form>}
        </>}
      </section>

      <div className="grid2">
        <section className="panel">
          <h2>Тохиргоо</h2>
          <form action={updateExam} className="form">
            <input type="hidden" name="exam_id" value={e.id} />
            <label className="fld full"><span>Нэр</span><input type="text" name="title" defaultValue={e.title} required /></label>
            <label className="fld"><span>Хугацаа (мин)</span><input type="number" name="duration_min" defaultValue={e.duration_min} min={1} /></label>
            <label className="fld"><span>Тэнцэх оноо (%)</span><input type="number" name="pass_score" defaultValue={e.pass_score} min={0} max={100} /></label>
            <label className="checks full"><label><input type="checkbox" name="shuffle" defaultChecked={e.shuffle} /> Асуултын дарааллыг оролцогч бүрт холих</label></label>
            <div><Submit>Хадгалах</Submit></div>
          </form>
          <p className="small muted">Тэнцсэн оролцогчийн хичээлийн ирц автоматаар батлагдаж, модуль дууссанд тооцогдоно.</p>
          <form action={deleteExam}><input type="hidden" name="exam_id" value={e.id} /><Submit className="btn sm danger" confirmText="Шалгалтыг бүх үр дүнгийн хамт устгах уу?">Шалгалт устгах</Submit></form>
        </section>
        <section className="panel">
          <h2>Авсан шалгалтууд</h2>
          {runs.length ? <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>{runs.map(r => {
            const open = !r.closed_at && new Date(r.closes_at) > new Date();
            return (
              <Link key={r.id} href={`/admin/exams/live/${r.id}`} className="row">
                <div><strong className="num">{fmtDateTime(r.opened_at)}</strong><div className="meta"><span>{r.n} оролцогч</span><span>{r.passed} тэнцсэн</span></div></div>
                <div className="acts">{open ? <Chip label="Явагдаж байна" tone="ok" /> : <Chip label="Дууссан" />}</div>
              </Link>); })}</div>
            : <p className="muted">Шалгалт авч байгаагүй.</p>}
        </section>
      </div>
    </>
  );
}
