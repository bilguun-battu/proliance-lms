import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all, one } from '@/lib/db';
import { reviewAttempt } from '@/app/actions/exams';
import { attemptQuestions, answerText, AUTO_TYPES, QTYPE_LABEL, type Answer } from '@/lib/exams';
import { Flash, Chip } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import Submit from '@/components/Submit';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Багш хариултыг шалгаж оноо, эцсийн дүн оруулна (бичвэр хариулт, гараар шалгах шалгалт, дадлагын үнэлгээ)
export default async function Review(props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const a = await one<any>(`
    SELECT a.*, u.name, u.email, u.position, o.name AS org, r.token, r.id AS run_id, e.id AS exam_id, e.title, e.check_mode, e.pass_score, e.file_id,
           rv.name AS reviewer
      FROM exam_attempts a JOIN users u ON u.id=a.user_id LEFT JOIN orgs o ON o.id=u.org_id JOIN exam_runs r ON r.id=a.run_id
      JOIN exams e ON e.id=r.exam_id LEFT JOIN users rv ON rv.id=a.reviewer_id WHERE a.id=$1`, [id]);
  if (!a || !a.submitted_at) notFound();
  const qs = await attemptQuestions(a.question_ids);
  const answers: Answer[] = a.answers ?? [];
  const marks: (number | null)[] = a.marks ?? [];
  const bands = await all<any>('SELECT * FROM exam_bands WHERE exam_id=$1 ORDER BY min_points', [a.exam_id]);
  const max = qs.reduce((t, q) => t + q.points, 0);
  return (
    <>
      <div><Link className="link small" href={`/admin/exams/live/${a.run_id}`}>← {a.title} · {a.token}</Link></div>
      <div className="head">
        <div><h1>{a.name}</h1><p className="muted">{[a.org, a.position, a.email].filter(Boolean).join(' · ')} · {a.attempt_no}-р оролдлого · илгээсэн {fmtDateTime(a.submitted_at)}</p></div>
        {a.review_status === 'PENDING' ? <Chip label="Шалгах шаардлагатай" tone="warn" /> : a.passed === null ? null
          : <Chip label={`${a.result_label ?? (a.passed ? 'Тэнцсэн' : 'Тэнцээгүй')}${a.reviewer ? ` · ${a.reviewer}` : ''}`} tone={a.passed ? 'ok' : 'crit'} />}
      </div>
      <Flash sp={sp} />
      <form action={reviewAttempt} className="stack">
        <input type="hidden" name="attempt_id" value={a.id} />
        {qs.length > 0 && <section className="panel">
          <h2>Хариултууд</h2>
          {qs.map((q, i) => {
            const auto = AUTO_TYPES.includes(q.qtype) && a.check_mode === 'AUTO';
            const m = marks[i];
            return (
              <div key={q.id} className="q">
                <div className="acts" style={{ justifyContent: 'space-between' }}>
                  <strong>{i + 1}. {q.text}</strong>
                  <Chip label={QTYPE_LABEL[q.qtype]} tone={auto ? 'ok' : 'brand'} />
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {q.image_file && <img className="exam-img" style={{ maxHeight: 160 }} src={`${base}/api/files/${q.image_file}`} alt="" />}
                <div className="small"><span className="muted">Хариулт: </span><span style={{ whiteSpace: 'pre-wrap' }}>{answerText(q, answers[i] ?? null)}</span></div>
                {q.correct.length > 0 && <div className="small muted">Зөв хариулт: {q.correct.map(c => q.options[c]).join('; ')}</div>}
                <label className="fld" style={{ width: 200 }}><span>Оноо (0–{q.points}){auto ? ' · автомат' : ''}</span>
                  <input type="number" name={`m${i}`} min={0} max={q.points} step="0.5" defaultValue={m ?? 0} /></label>
              </div>);
          })}
          <p className="small muted">Нийт дээд оноо {max}. Автоматаар дүгнэсэн оноог шаардлагатай бол өөрчилж болно.</p>
        </section>}
        {!qs.length && <div className="notice soft"><strong>Дадлагын үнэлгээ (асуултгүй)</strong>
          <span className="small">Оролцогчийн ур чадварыг ажлын байран дээр шалгаад эцсийн дүнг доор оруулна.
            {a.file_id && <> Үнэлгээний хуудас: <a className="link" href={`${base}/api/files/${a.file_id}`} target="_blank">PDF</a></>}</span></div>}
        <section className="panel">
          <h2>Эцсийн дүн</h2>
          <div className="checks col">
            {qs.length > 0 && <label><input type="radio" name="decision" value="auto" defaultChecked /> Оноогоор тооцох <span className="small muted">— {bands.length ? `шатлал: ${bands.map(b => `${Number(b.min_points)}–${Number(b.max_points)} ${b.label}`).join(', ')}` : `тэнцэх ${a.pass_score}%`}</span></label>}
            <label><input type="radio" name="decision" value="pass" defaultChecked={!qs.length} /> Тэнцсэн</label>
            <label><input type="radio" name="decision" value="fail" /> Тэнцээгүй</label>
          </div>
          <div className="form">
            <label className="fld"><span>Дүнгийн нэр (заавал биш)</span>
              <input type="text" name="label" list="band-labels" placeholder="Competent / Not yet competent" />
              <datalist id="band-labels">{[...new Set(['Competent', 'Not yet competent', ...bands.map(b => b.label)])].map(l => <option key={l} value={l} />)}</datalist></label>
            <label className="fld full"><span>Тэмдэглэл</span><textarea name="note" rows={2} defaultValue={a.review_note ?? ''} /></label>
          </div>
          <div><Submit>Дүн хадгалах</Submit></div>
        </section>
      </form>
    </>
  );
}
