import { all, one } from '@/lib/db';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { Flash } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import Submit from '@/components/Submit';
import AskAssistant from '@/components/AskAssistant';
import { reindexAll, reindexOne, addFaq, deleteFaq, resolveQuestion } from '@/app/actions/kb';
import { ensureIndexed } from '@/lib/kb';

// Сургалтын туслах: материалын индекс, бэлтгэсэн асуулт-хариулт, асуултын бүртгэл
export default async function KbPage(props: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await props.searchParams;
  await requireUser(...STAFF_ROLES);
  const courses = await all<any>(`
    SELECT c.id, c.title, v.id AS vid, v.number,
      (SELECT count(*)::int FROM kb_chunks k WHERE k.course_id=c.id) AS chunks,
      (SELECT count(*)::int FROM kb_chunks k WHERE k.course_id=c.id AND k.source='PDF') AS pdf_chunks,
      (SELECT count(DISTINCT k.module_key)::int FROM kb_chunks k WHERE k.course_id=c.id AND k.source='PDF') AS pdf_mods,
      (SELECT count(*)::int FROM modules m WHERE m.version_id=v.id AND m.pdf_file IS NOT NULL) AS pdfs,
      EXISTS (SELECT 1 FROM kb_chunks k WHERE k.version_id=v.id) AS current
    FROM courses c JOIN LATERAL (SELECT id, number FROM course_versions x WHERE x.course_id=c.id AND x.status='PUBLISHED' ORDER BY number DESC LIMIT 1) v ON true
    ORDER BY c.title`);
  await ensureIndexed(courses.filter(c => !c.current).map(c => c.id));
  const st = (await one<any>(`SELECT count(*)::int AS n, count(*) FILTER (WHERE answered)::int AS ok,
      count(*) FILTER (WHERE helpful)::int AS up, count(*) FILTER (WHERE helpful = false)::int AS down,
      count(*) FILTER (WHERE NOT resolved AND (NOT answered OR helpful = false))::int AS open
    FROM kb_questions WHERE created_at > now() - interval '30 days'`))!;
  const open = await all<any>(`SELECT q.*, u.name, c.title FROM kb_questions q LEFT JOIN users u ON u.id=q.user_id LEFT JOIN courses c ON c.id=q.course_id
     WHERE NOT q.resolved AND (NOT q.answered OR q.helpful = false) ORDER BY q.created_at DESC LIMIT 30`);
  const faqs = await all<any>(`SELECT f.*, c.title FROM kb_faq f LEFT JOIN courses c ON c.id=f.course_id ORDER BY f.created_at DESC`);
  const recent = await all<any>(`SELECT q.*, u.name, c.title FROM kb_questions q LEFT JOIN users u ON u.id=q.user_id LEFT JOIN courses c ON c.id=q.course_id
     ORDER BY q.created_at DESC LIMIT 25`);
  const CourseSel = ({ v }: { v?: string | null }) => <select name="course_id" defaultValue={v ?? ''}>
    <option value="">Бүх сургалтад (ерөнхий)</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>;
  const pct = (a: number) => st.n ? `${Math.round((a / st.n) * 100)}%` : '–';
  return (
    <>
      <div className="head"><div>
        <h1>Сургалтын туслах</h1>
        <p className="muted">Суралцагч асуулт асуухад туслах сургалтын PDF гарын авлага, модулийн тайлбар болон энд бэлтгэсэн асуулт-хариултаас хамгийн тохирох хэсгийг олж, эх сурвалжийн хамт харуулна. Хариулт нь материалын өөрийн текст тул зохиомол мэдээлэл гарахгүй. Гадны үйлчилгээ ашигладаггүй, нэмэлт төлбөргүй.</p>
      </div></div>
      <Flash sp={sp} />
      <div className="kbstat">
        <div><span className="small muted">Сүүлийн 30 хоногт асуусан</span><strong className="num">{st.n}</strong></div>
        <div><span className="small muted">Хариулт олдсон</span><strong className="num">{pct(st.ok)}</strong></div>
        <div><span className="small muted">Тус болсон / болоогүй</span><strong className="num">{st.up} / {st.down}</strong></div>
        <div><span className="small muted">Хянах шаардлагатай</span><strong className="num">{st.open}</strong></div>
      </div>

      <section className="panel">
        <h2>Хянах шаардлагатай асуултууд ({open.length})</h2>
        <p className="small muted">Материалаас хариулт олдоогүй эсвэл суралцагч "тус болоогүй" гэж үнэлсэн асуултууд. Хариултыг нь бичиж нэмбэл дараагийн удаа ижил төстэй асуултад туслах үүнийг санал болгоно. Олон давтагдаж буй асуулт нь гарын авлагад юу дутуу байгааг харуулна.</p>
        {open.length ? <div className="list">{open.map(q => (
          <details key={q.id} className="row" style={{ display: 'block' }}>
            <summary style={{ cursor: 'pointer' }}><strong>{q.question}</strong>
              <div className="meta small"><span className={`chip c-${q.answered ? 'warn' : 'crit'}`}>{q.answered ? 'Тус болоогүй' : 'Хариулт олдоогүй'}</span>
                <span className="muted">{q.name ?? '—'} · {q.title ?? 'Бүх сургалт'} · {fmtDateTime(q.created_at)}</span>
                {q.top_source && <span className="muted">Санал болгосон: {q.top_source}</span>}</div></summary>
            <form action={addFaq} className="stack" style={{ marginTop: 12, maxWidth: 720 }}>
              <input type="hidden" name="from" value={q.id} />
              <label className="fld"><span>Асуулт</span><input name="question" defaultValue={q.question} required /></label>
              <label className="fld"><span>Хариулт</span><textarea name="answer" required placeholder="Гарын авлагад үндэслэсэн товч, тодорхой хариулт" /></label>
              <label className="fld"><span>Хамаарах сургалт</span><CourseSel v={q.course_id} /></label>
              <div className="acts"><Submit>Хариулт нэмэх</Submit></div>
            </form>
            <form action={resolveQuestion} style={{ marginTop: 8 }}><input type="hidden" name="id" value={q.id} /><Submit className="btn sm ghost">Хариулт шаардлагагүй</Submit></form>
          </details>))}</div> : <p className="muted">Хянах асуулт алга.</p>}
      </section>

      <section className="panel">
        <h2>Туршиж үзэх</h2>
        <p className="small muted">Бүх нийтлэгдсэн сургалтаас хайна. Суралцагч зөвхөн өөрт нээлттэй сургалтын материалаас хариулт авна.</p>
        <AskAssistant courses={courses.map(c => ({ id: c.id, title: c.title }))} initialCourse="" examples={[]} links={false} />
      </section>

      <section className="panel" id="faq">
        <h2>Бэлтгэсэн асуулт-хариулт ({faqs.length})</h2>
        <p className="small muted">Материалд шууд бичигдээгүй ч олон асуудаг асуултын хариулт. Асуулт таарвал туслах үүнийг гарын авлагаас түрүүлж харуулна.</p>
        <form action={addFaq} className="stack" style={{ maxWidth: 720 }}>
          <label className="fld"><span>Асуулт</span><input name="question" required placeholder="Ж: Инженерт хэрхэн хандах вэ?" /></label>
          <label className="fld"><span>Хариулт</span><textarea name="answer" required /></label>
          <label className="fld"><span>Хамаарах сургалт</span><CourseSel /></label>
          <div><Submit>Нэмэх</Submit></div>
        </form>
        {faqs.length > 0 && <div className="tablewrap"><table>
          <thead><tr><th>Асуулт</th><th>Хариулт</th><th>Сургалт</th><th></th></tr></thead>
          <tbody>{faqs.map(f => <tr key={f.id}>
            <td><strong>{f.question}</strong></td><td className="small">{f.answer}</td><td className="small">{f.title ?? 'Бүх сургалт'}</td>
            <td><form action={deleteFaq}><input type="hidden" name="id" value={f.id} /><Submit className="btn sm danger" confirmText="Устгах уу?">Устгах</Submit></form></td>
          </tr>)}</tbody></table></div>}
      </section>

      <section className="panel">
        <div className="head"><h2>Материалын индекс</h2>
          <form action={reindexAll}><Submit className="btn sm ghost">Бүгдийг шинэчлэх</Submit></form></div>
        <p className="small muted">Сургалт нийтлэгдэх бүрт материал автоматаар дахин уншигдана. Текст хэлбэрийн PDF-ээс хайлт хийнэ; зураг хэлбэрээр скан хийсэн PDF-ээс текст гарахгүй тул текст хэлбэрээр нь оруулна уу. Тестийн асуулт, зөв хариултыг туслахад оруулдаггүй.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Сургалт</th><th>Хувилбар</th><th>PDF</th><th>Хайлтын хэсэг</th><th></th></tr></thead>
          <tbody>{courses.map(c => <tr key={c.id}>
            <td>{c.title}</td><td className="num">v{c.number}</td>
            <td className="small">{c.pdfs ? `${c.pdf_mods}/${c.pdfs} уншигдсан` : 'PDF алга'}</td>
            <td className="num">{c.chunks}</td>
            <td><form action={reindexOne}><input type="hidden" name="course_id" value={c.id} /><Submit className="btn sm ghost">Шинэчлэх</Submit></form></td>
          </tr>)}</tbody></table></div>
      </section>

      <section className="panel">
        <h2>Сүүлийн асуултууд</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Асуулт</th><th>Хэн</th><th>Үр дүн</th><th>Огноо</th></tr></thead>
          <tbody>{recent.map(q => <tr key={q.id}>
            <td>{q.question}{q.top_source && <div className="small muted">{q.top_source}</div>}</td>
            <td className="small">{q.name ?? '—'}<div className="muted">{q.title ?? 'Бүх сургалт'}</div></td>
            <td><span className={`chip c-${!q.answered ? 'crit' : q.helpful === false ? 'warn' : q.helpful ? 'ok' : 'neutral'}`}>
              {!q.answered ? 'Олдоогүй' : q.helpful === false ? 'Тус болоогүй' : q.helpful ? 'Тус болсон' : 'Хариулсан'}</span></td>
            <td className="small">{fmtDateTime(q.created_at)}</td>
          </tr>)}
          {!recent.length && <tr><td colSpan={4} className="muted">Одоогоор асуулт ирээгүй.</td></tr>}</tbody></table></div>
      </section>
    </>
  );
}
