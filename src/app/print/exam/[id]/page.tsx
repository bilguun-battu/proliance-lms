import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { drawQuestions, examQuestions, examSections, seeded, type ExamQ } from '@/lib/exams';
import { fmtDate } from '@/lib/format';
import PrintButton from '@/components/PrintButton';
import './print.css';

export const dynamic = 'force-dynamic';
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
const L = 'АБВГДЕЖЗИК';

// Шалгалтын материал хэвлэх: шалгалтын хуудас (санамсаргүй хувилбар), хариултын түлхүүр, асуултын сан бүтнээр
export default async function PrintExam(props: { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string; seed?: string }> }) {
  await requireUser('ADMIN');
  const { id } = await props.params;
  const sp = await props.searchParams;
  const e = await one<any>(`SELECT e.*, c.title AS course FROM exams e JOIN courses c ON c.id=e.course_id WHERE e.id=$1`, [id]);
  if (!e) notFound();
  const mode = sp.mode === 'key' || sp.mode === 'bank' ? sp.mode : 'paper';
  const seed = Number(sp.seed) > 0 ? Number(sp.seed) : 1000 + Math.floor(Math.random() * 9000);
  const sections = await examSections(e.id);
  const bands = await all<any>('SELECT * FROM exam_bands WHERE exam_id=$1 ORDER BY min_points', [e.id]);
  const qs: (ExamQ & { spos?: number })[] = mode === 'bank' ? await examQuestions(e.id) : await drawQuestions(e.id, e.shuffle, seeded(seed));
  const secOf = new Map(sections.map(s => [s.id, s]));
  const total = qs.reduce((t, q) => t + q.points, 0);
  const showKey = mode !== 'paper';
  const link = (m: string, sd = seed) => `/print/exam/${e.id}?mode=${m}&seed=${sd}`;
  let lastSec = '';
  return (
    <div className="ppage">
      <div className="pbar">
        <Link className="link" href={`/admin/exams/${e.id}`}>← Буцах</Link>
        <nav className="acts" style={{ justifyContent: 'flex-start' }}>
          <Link className={`btn sm ${mode === 'paper' ? '' : 'ghost'}`} href={link('paper')}>Шалгалтын хуудас</Link>
          <Link className={`btn sm ${mode === 'key' ? '' : 'ghost'}`} href={link('key')}>Хариултын түлхүүр</Link>
          <Link className={`btn sm ${mode === 'bank' ? '' : 'ghost'}`} href={link('bank')}>Асуултын сан бүтнээр</Link>
          {mode !== 'bank' && <Link className="btn sm ghost" href={link(mode, 1000 + ((seed * 7919) % 9000))}>↻ Өөр хувилбар</Link>}
        </nav>
        <PrintButton />
      </div>
      {mode !== 'bank' && <p className="pnote small">Хувилбарын код <strong>{seed}</strong>. Шалгалтын хуудас ба хариултын түлхүүр нэг кодтой бол асуулт нь адилхан. Өөр өөр хувилбар тараах бол "Өөр хувилбар" дарж хэвлэнэ.</p>}
      {e.file_id && <p className="pnote small">Хавсралт файл: <a className="link" href={`${base}/api/files/${e.file_id}`} target="_blank">дадлагын үнэлгээний хуудас (PDF)</a></p>}

      <article className="paper">
        <header className="phead">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${base}/logo.png`} alt="Proliance" />
          <div className="pttl">
            <p className="kick">{mode === 'paper' ? 'Шалгалтын хуудас' : mode === 'key' ? 'Хариултын түлхүүр · зөвхөн багшид' : 'Асуултын сан · зөвхөн багшид'}</p>
            <h1>{e.title}</h1>
            <p>{e.course}</p>
          </div>
          <div className="pcode">{mode !== 'bank' ? <>Хувилбар<strong>{seed}</strong></> : <>#{e.num}<strong>{qs.length} асуулт</strong></>}</div>
        </header>

        {mode === 'paper' && <table className="pinfo"><tbody>
          <tr><th>Овог, нэр</th><td /><th>Огноо</th><td /></tr>
          <tr><th>Байгууллага / албан тушаал</th><td /><th>Ажилтны дугаар</th><td /></tr>
          <tr><th>Авсан оноо</th><td>______ / {total}</td><th>Дүн</th><td>{bands.length ? bands.map(b => b.label).join(' / ') : 'Тэнцсэн / Тэнцээгүй'}</td></tr>
          <tr><th>Багш (нэр, гарын үсэг)</th><td colSpan={3} /></tr>
        </tbody></table>}

        {mode !== 'bank' && <div className="pinst">
          <strong>Заавар:</strong> {e.duration_min > 0 ? `Хугацаа ${e.duration_min} минут. ` : ''}Нийт {qs.length} асуулт, {total} оноо.
          Нэг сонголттой асуултад нэг, "олон сонголт" гэсэн асуултад бүх зөв хариултыг дугуйлна. {e.description}
        </div>}

        <ol className="pq">
          {qs.map((q, i) => {
            const sec = q.section_id ? secOf.get(q.section_id) : undefined;
            const head = sec && sec.id !== lastSec ? sec : null;
            if (sec) lastSec = sec.id;
            return (
              <li key={q.id + i} className="pqi">
                {head && (mode === 'bank' || head.description) && <div className="psec">
                  {mode === 'bank' && <strong>Бүлэг {head.position} — {head.draw_count > 0 ? `${head.draw_count} асуулт сонгогдоно` : 'бүгд'} ({head.n} асуулт)</strong>}
                  {head.description && <div>{head.description}</div>}</div>}
                <div className="pqt"><span className="pn">{i + 1}.</span><span>{q.text}</span><span className="ppts">{q.points} оноо</span></div>
                {q.qtype === 'CHECKBOX' && <div className="phint">(Олон сонголт — бүх зөв хариултыг тэмдэглэ)</div>}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {q.image_file && <img className="pimg" src={`${base}/api/files/${q.image_file}`} alt="" />}
                {['RADIO', 'CHECKBOX', 'SELECT', 'YESNO'].includes(q.qtype) && (
                  <ul className={`popts ${q.qtype === 'YESNO' ? 'row' : ''}`}>{q.options.map((o, j) => {
                    const ok = showKey && q.correct.includes(j);
                    return <li key={j} className={ok ? 'ok' : ''}><span className="pbox">{q.qtype === 'CHECKBOX' ? (ok ? '☑' : '☐') : ok ? '●' : '○'}</span>{L[j]}. {o}{ok ? ' ✓' : ''}</li>;
                  })}</ul>)}
                {q.qtype === 'YESNO' && <div className="plines" style={{ ['--n' as any]: 2 }}><span>Тайлбар:</span></div>}
                {q.qtype === 'TEXT' && (showKey ? <div className="pkey">Багш шалгана (богино хариулт)</div> : <div className="plines" style={{ ['--n' as any]: 2 }} />)}
                {q.qtype === 'TEXTAREA' && (showKey ? <div className="pkey">Багш шалгана (дэлгэрэнгүй хариулт)</div> : <div className="plines" style={{ ['--n' as any]: 6 }} />)}
              </li>);
          })}
        </ol>
        {!qs.length && <p className="muted">Асуулт алга. {e.check_mode === 'MANUAL' ? 'Энэ нь дадлагын үнэлгээ бол хавсралт PDF-ийг хэвлэнэ үү.' : ''}</p>}

        {showKey && <section className="pkeysum">
          <h2>Товч хариулт</h2>
          <p>{qs.map((q, i) => `${i + 1}-${q.correct.length ? q.correct.map(c => L[c]).join('') : '✎'}`).join('  ')}</p>
          <h2>Дүгнэх</h2>
          {bands.length ? <table className="pinfo"><thead><tr><th>Авсан оноо</th><th>Дүн</th></tr></thead><tbody>
            {bands.map(b => <tr key={b.id}><td>{Number(b.min_points)} – {Number(b.max_points)}</td><td>{b.label}{b.passed ? ' (тэнцсэн)' : ''}</td></tr>)}</tbody></table>
            : <p>Тэнцэх: нийт онооны {e.pass_score}% буюу {Math.ceil((total * e.pass_score) / 100)}+ оноо.</p>}
        </section>}
        <footer className="pfoot">Proliance ХХК · {e.title} · {fmtDate(new Date().toISOString())}</footer>
      </article>
    </div>
  );
}
