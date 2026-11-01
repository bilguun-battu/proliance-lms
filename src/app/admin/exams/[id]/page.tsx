import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all, one } from '@/lib/db';
import {
  addSection, updateSection, deleteSection, moveSection, deleteQuestion, addBand, deleteBand, openExamRun, duplicateExam, deleteExam,
} from '@/app/actions/exams';
import { examQuestions, examSections, shownCount, QTYPE_LABEL, AUTO_TYPES } from '@/lib/exams';
import { Flash, Chip } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { CATEGORY_LABEL, CAT_TONE } from '@/lib/progress';
import Submit from '@/components/Submit';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default async function ExamView(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; tab?: string }> }
) {
  const sp = await props.searchParams;
  const { id } = await props.params;
  const e = await one<any>(`SELECT e.*, c.title AS course, c.category, c.audience, t.name AS eval_name, f.name AS file_name, u.name AS author,
      (SELECT m.title FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=e.course_id AND m.module_key=e.module_key ORDER BY v.number DESC LIMIT 1) AS module
      FROM exams e JOIN courses c ON c.id=e.course_id LEFT JOIN eval_templates t ON t.id=e.eval_template_id
      LEFT JOIN files f ON f.id=e.file_id LEFT JOIN users u ON u.id=e.created_by WHERE e.id=$1`, [id]);
  if (!e) notFound();
  const sections = await examSections(e.id);
  const qs = await examQuestions(e.id);
  const bands = await all<any>('SELECT * FROM exam_bands WHERE exam_id=$1 ORDER BY min_points', [e.id]);
  const runs = await all<any>(`
    SELECT r.*, s.starts_at AS session_at, (SELECT count(DISTINCT a.user_id)::int FROM exam_attempts a WHERE a.run_id=r.id) AS n,
           (SELECT count(*)::int FROM exam_attempts a WHERE a.run_id=r.id AND a.passed) AS passed,
           (SELECT count(*)::int FROM exam_attempts a WHERE a.run_id=r.id AND a.review_status='PENDING') AS pending
      FROM exam_runs r LEFT JOIN sessions s ON s.id=r.session_id WHERE r.exam_id=$1 ORDER BY r.opened_at DESC LIMIT 50`, [e.id]);
  const tab = sp.tab === 'bands' || sp.tab === 'runs' ? sp.tab : 'questions';
  const shown = shownCount(sections);
  // Нэг оролцогчийн дээд оноо (бүлэг бүрээс сонгогдох асуултын оноогоор; оноо ялгаатай бол хамгийн их боломжит)
  const maxPts = sections.reduce((t, s) => {
    const pts = qs.filter(q => q.section_id === s.id).map(q => q.points).sort((a, b) => b - a);
    return t + pts.slice(0, s.draw_count > 0 ? s.draw_count : pts.length).reduce((x, y) => x + y, 0);
  }, 0);
  const manualQs = qs.filter(q => !AUTO_TYPES.includes(q.qtype)).length;
  const hid = <input type="hidden" name="exam_id" value={e.id} />;
  const warn: string[] = [];
  if (!qs.length && e.check_mode === 'AUTO') warn.push('Асуулт нэмээгүй байна.');
  sections.forEach(s => { if (s.draw_count > s.n) warn.push(`Бүлэг ${s.position}: ${s.draw_count} асуулт харуулахаар тохируулсан ч санд ${s.n} асуулт байна.`); });
  if (bands.length && bands[bands.length - 1].max_points < maxPts) warn.push(`Онооны шатлал ${maxPts} оноо хүртэлх бүх завсрыг хамраагүй байна.`);
  return (
    <>
      <div><Link className="link small" href={`/admin/exams?aud=${e.audience === 'INTERNAL' ? 'internal' : 'customer'}`}>← Шалгалтын материал</Link></div>
      <div className="head">
        <div>
          <p className="small muted" style={{ margin: 0 }}>#{e.num} · <Chip label={CATEGORY_LABEL[e.category]} tone={CAT_TONE[e.category]} /> {e.status === 'ACTIVE' ? <Chip label="Идэвхтэй" tone="ok" /> : <Chip label="Нуусан" />}</p>
          <h1>{e.title}</h1>
          <p className="muted">{e.course}{e.module ? ` · ${e.module}` : ''}</p>
        </div>
        <div className="acts">
          <Link className="btn ghost" href={`/admin/exams/${e.id}/edit`}>Засах</Link>
          <a className="btn ghost" href={`${base}/print/exam/${e.id}`} target="_blank">Хэвлэх материал</a>
          <form action={duplicateExam}>{hid}<Submit className="btn ghost">Хуулбарлах</Submit></form>
          <form action={openExamRun}>{hid}<Submit className="btn" confirmText="Хуваарьгүйгээр шалгалт эхлүүлж QR код үүсгэх үү? Хичээлийн хуваарьтай холбох бол Хуваарь цэснээс эхлүүлнэ үү.">QR шалгалт эхлүүлэх</Submit></form>
        </div>
      </div>
      <Flash sp={sp} />
      {warn.length > 0 && <div className="alert err">{warn.map((w, i) => <div key={i}>{w}</div>)}</div>}

      <section className="panel">
        <dl className="kv">
          <dt>Шалгах арга</dt><dd>{e.check_mode === 'AUTO' ? `Автомат${manualQs ? ` (${manualQs} бичвэр асуултыг багш шалгана)` : ''}` : 'Гараар (багш дүн оруулна)'}</dd>
          <dt>Асуулт</dt><dd>Оролцогч бүрт <strong>{shown}</strong> асуулт · санд {qs.length} · дээд оноо {maxPts}</dd>
          <dt>Хугацаа</dt><dd>{e.duration_min > 0 ? `${e.duration_min} минут` : 'Хязгааргүй'} · {e.attempts_allowed} оролдлого</dd>
          <dt>Дүн</dt><dd>{bands.length ? bands.map(b => `${Number(b.min_points)}–${Number(b.max_points)}: ${b.label}`).join(' · ') : `Тэнцэх ${e.pass_score}%`} · {e.show_result === 'NOW' ? 'шууд харуулна' : 'шалгалт хаагдсаны дараа харуулна'}</dd>
          <dt>Үнэлгээний маягт</dt><dd>{e.eval_name ?? '—'}</dd>
          <dt>Файл</dt><dd>{e.file_id ? <a className="link" href={`${base}/api/files/${e.file_id}`} target="_blank">{e.file_name}</a> : '—'}</dd>
          <dt>Шинэчилсэн</dt><dd>{fmtDateTime(e.updated_at)}{e.author ? ` · үүсгэсэн ${e.author}` : ''}</dd>
        </dl>
        {e.description && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{e.description}</p>}
      </section>

      <div className="tabrow" style={{ borderBottom: '1px solid var(--line)' }}>
        <Link className="tab" href={`/admin/exams/${e.id}`} aria-current={tab === 'questions' ? 'page' : undefined}>Асуултууд ({qs.length})</Link>
        <Link className="tab" href={`/admin/exams/${e.id}?tab=bands`} aria-current={tab === 'bands' ? 'page' : undefined}>Онооны шатлал ({bands.length})</Link>
        <Link className="tab" href={`/admin/exams/${e.id}?tab=runs`} aria-current={tab === 'runs' ? 'page' : undefined}>Авсан шалгалтууд ({runs.length})</Link>
      </div>

      {tab === 'questions' && <>
        {sections.map((s, si) => {
          const sq = qs.filter(q => q.section_id === s.id);
          return (
            <section key={s.id} className="panel" id={`s-${s.id}`}>
              <div className="head">
                <div><h2>Бүлэг {s.position} <span className="small muted">({s.draw_count > 0 ? `санамсаргүйгээр ${s.draw_count} асуулт харуулна` : 'бүх асуултыг харуулна'} · санд {s.n})</span></h2>
                  {s.description && <p className="small muted" style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{s.description}</p>}</div>
                <div className="acts">
                  {si > 0 && <form action={moveSection}>{hid}<input type="hidden" name="section_id" value={s.id} /><Submit className="btn sm ghost">↑ Дээш</Submit></form>}
                  <form action={deleteSection}>{hid}<input type="hidden" name="section_id" value={s.id} /><Submit className="btn sm danger" confirmText={`Бүлэг ${s.position}-ийг ${s.n} асуултын хамт устгах уу?`}>Бүлэг устгах</Submit></form>
                  <Link className="btn sm" href={`/admin/exams/${e.id}/q/new?section=${s.id}`}>+ Асуулт нэмэх</Link>
                </div>
              </div>
              <details>
                <summary className="small link">Бүлгийн тохиргоо</summary>
                <form action={updateSection} className="form" style={{ marginTop: 10 }}>
                  {hid}<input type="hidden" name="section_id" value={s.id} />
                  <label className="fld"><span>Харуулах асуултын тоо (0 = бүгд)</span><input type="number" name="draw_count" min={0} defaultValue={s.draw_count} /></label>
                  <label className="fld full"><span>Тайлбар (оролцогчид бүлгийн эхэнд харагдана)</span><textarea name="description" rows={2} defaultValue={s.description} /></label>
                  <div><Submit className="btn sm">Хадгалах</Submit></div>
                </form>
              </details>
              <div className="tablewrap"><table>
                <thead><tr><th>#</th><th>Асуулт</th><th>Төрөл</th><th className="r">Хариулт</th><th>Зөв хариулт</th><th className="r">Оноо</th><th></th></tr></thead>
                <tbody>{sq.map((q, i) => (
                  <tr key={q.id}>
                    <td className="num">{i + 1}.</td>
                    <td>{q.text}{q.image_file && <span className="small muted"> · 🖼 зурагтай</span>}</td>
                    <td><Chip label={QTYPE_LABEL[q.qtype]} tone={AUTO_TYPES.includes(q.qtype) ? 'ok' : 'brand'} /></td>
                    <td className="r num">{q.options.length || '—'}</td>
                    <td className="small">{q.correct.length ? q.correct.map(c => `${c + 1}. ${q.options[c] ?? ''}`).join('; ') : <span className="muted">Багш шалгана</span>}</td>
                    <td className="r num">{q.points}</td>
                    <td><div className="acts" style={{ flexWrap: 'nowrap' }}>
                      <Link className="btn sm ghost" href={`/admin/exams/${e.id}/q/${q.id}`}>Засах</Link>
                      <form action={deleteQuestion}>{hid}<input type="hidden" name="question_id" value={q.id} /><Submit className="btn sm danger" confirmText="Асуултыг устгах уу?">Устгах</Submit></form>
                    </div></td>
                  </tr>))}
                  {!sq.length && <tr><td colSpan={7} className="muted">Энэ бүлэгт асуулт алга.</td></tr>}
                </tbody>
              </table></div>
            </section>);
        })}
        <form action={addSection} className="acts" style={{ justifyContent: 'flex-start' }}>
          {hid}
          <label className="fld" style={{ width: 220 }}><span>Шинэ бүлгээс харуулах асуулт (0 = бүгд)</span><input type="number" name="draw_count" min={0} defaultValue={1} /></label>
          <Submit className="btn ghost">+ Бүлэг нэмэх</Submit>
        </form>
        <p className="small muted">Санамж: бүлэг бүрт ижил сэдвийн хэд хэдэн асуулт оруулж "1 асуулт харуулна" гэж тохируулбал оролцогч бүрт өөр өөр асуулт оногдож, хуулах боломж багасна.</p>
      </>}

      {tab === 'bands' && <section className="panel">
        <h2>Онооны шатлал</h2>
        <p className="small muted">Оролцогчийн авсан оноо аль завсарт орохоор дүн гарна. Нэг оролцогчийн дээд оноо: <strong>{maxPts}</strong>.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Авсан оноо</th><th>Дүн</th><th>Тэнцсэнд тооцох</th><th></th></tr></thead>
          <tbody>{bands.map(b => (
            <tr key={b.id}><td className="num">{Number(b.min_points)} – {Number(b.max_points)}</td><td><strong>{b.label}</strong></td>
              <td>{b.passed ? <Chip label="Тийм" tone="ok" /> : <Chip label="Үгүй" tone="crit" />}</td>
              <td><form action={deleteBand}>{hid}<input type="hidden" name="band_id" value={b.id} /><Submit className="btn sm danger" confirmText="Устгах уу?">Устгах</Submit></form></td></tr>))}
            {!bands.length && <tr><td colSpan={4} className="muted">Шатлал оруулаагүй. Дүнг тэнцэх хувиар ({e.pass_score}%) гаргана.</td></tr>}
          </tbody>
        </table></div>
        <form action={addBand} className="form" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          {hid}
          <label className="fld"><span>Доод оноо</span><input type="number" step="any" name="min_points" required defaultValue={bands.length ? Number(bands[bands.length - 1].max_points) + 1 : 0} /></label>
          <label className="fld"><span>Дээд оноо</span><input type="number" step="any" name="max_points" required defaultValue={maxPts} /></label>
          <label className="fld"><span>Дүн</span><input type="text" name="label" required placeholder="Competent / Тэнцсэн" /></label>
          <label className="checks"><label><input type="checkbox" name="passed" defaultChecked={!!bands.length} /> Тэнцсэнд тооцох</label></label>
          <div><Submit className="btn">+ Нэмэх</Submit></div>
        </form>
      </section>}

      {tab === 'runs' && <section className="panel">
        <h2>Авсан шалгалтууд</h2>
        {runs.length ? <div className="tablewrap"><table>
          <thead><tr><th>Код</th><th>Эхэлсэн</th><th>Хичээл</th><th className="r">Оролцогч</th><th className="r">Тэнцсэн</th><th>Төлөв</th></tr></thead>
          <tbody>{runs.map(r => {
            const open = !r.closed_at && new Date(r.closes_at) > new Date();
            return (
              <tr key={r.id}>
                <td><Link className="link num" href={`/admin/exams/live/${r.id}`}>{r.token}</Link></td>
                <td className="small">{fmtDateTime(r.opened_at)}</td>
                <td className="small">{r.session_at ? fmtDateTime(r.session_at) : '—'}</td>
                <td className="r num">{r.n}</td><td className="r num">{r.passed}</td>
                <td>{open ? <Chip label="Явагдаж байна" tone="ok" /> : <Chip label="Дууссан" />} {r.pending > 0 && <Chip label={`${r.pending} шалгах`} tone="warn" />}</td>
              </tr>); })}</tbody>
        </table></div> : <p className="muted">Шалгалт авч байгаагүй.</p>}
        {!runs.length && <form action={deleteExam}>{hid}<Submit className="btn sm danger" confirmText="Шалгалтыг бүрмөсөн устгах уу?">Шалгалт устгах</Submit></form>}
      </section>}
    </>
  );
}
