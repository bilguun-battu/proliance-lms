import Link from 'next/link';
import { all } from '@/lib/db';
import { duplicateExam, deleteExam } from '@/app/actions/exams';
import { Flash, Chip } from '@/components/ui';
import { CATEGORY_LABEL, CAT_TONE, CATEGORIES } from '@/lib/progress';
import { fmtDateTime } from '@/lib/format';
import AudTabs, { audOf, AUD_DB } from '@/components/AudTabs';
import Submit from '@/components/Submit';

const PER = 30;
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default async function Exams(
  props: { searchParams: Promise<{ ok?: string; err?: string; aud?: string; cat?: string; q?: string; st?: string; miss?: string; p?: string }> }
) {
  const sp = await props.searchParams;
  const aud = audOf(sp.aud);
  const where = ['c.audience=$1'], params: unknown[] = [AUD_DB(aud)];
  if (sp.cat) { params.push(sp.cat); where.push(`c.category=$${params.length}`); }
  if (sp.q) { params.push(`%${sp.q}%`); where.push(`(e.title ILIKE $${params.length} OR c.title ILIKE $${params.length} OR e.num::text=$${params.length + 1})`); params.push(sp.q.replace('#', '')); }
  if (sp.st === 'ACTIVE' || sp.st === 'HIDDEN') { params.push(sp.st); where.push(`e.status=$${params.length}`); }
  if (sp.miss === 'questions') where.push(`NOT EXISTS (SELECT 1 FROM exam_questions q JOIN exam_sections x ON x.id=q.section_id WHERE x.exam_id=e.id) AND e.check_mode='AUTO'`);
  if (sp.miss === 'eval') where.push('e.eval_template_id IS NULL');
  if (sp.miss === 'bands') where.push('NOT EXISTS (SELECT 1 FROM exam_bands b WHERE b.exam_id=e.id)');
  if (sp.miss === 'review') where.push(`EXISTS (SELECT 1 FROM exam_attempts a JOIN exam_runs r ON r.id=a.run_id WHERE r.exam_id=e.id AND a.review_status='PENDING')`);
  const page = Math.max(1, Number(sp.p) || 1);
  const total = (await all<{ n: number }>(`SELECT count(*)::int AS n FROM exams e JOIN courses c ON c.id=e.course_id WHERE ${where.join(' AND ')}`, params))[0].n;
  const rows = await all<any>(`
    SELECT e.*, c.title AS course, c.category, t.name AS eval_name, f.name AS file_name, u.name AS author,
      (SELECT m.title FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=e.course_id AND m.module_key=e.module_key ORDER BY v.number DESC LIMIT 1) AS module,
      (SELECT count(*)::int FROM exam_questions q JOIN exam_sections x ON x.id=q.section_id WHERE x.exam_id=e.id) AS bank,
      (SELECT coalesce(sum(CASE WHEN x.draw_count > 0 THEN least(x.draw_count, (SELECT count(*) FROM exam_questions q WHERE q.section_id=x.id))
                                ELSE (SELECT count(*) FROM exam_questions q WHERE q.section_id=x.id) END), 0)::int FROM exam_sections x WHERE x.exam_id=e.id) AS shown,
      (SELECT count(*)::int FROM exam_bands b WHERE b.exam_id=e.id) AS bands,
      (SELECT count(*)::int FROM exam_attempts a JOIN exam_runs r ON r.id=a.run_id WHERE r.exam_id=e.id AND a.review_status='PENDING') AS pending
      FROM exams e JOIN courses c ON c.id=e.course_id
      LEFT JOIN eval_templates t ON t.id=e.eval_template_id LEFT JOIN files f ON f.id=e.file_id LEFT JOIN users u ON u.id=e.created_by
     WHERE ${where.join(' AND ')} ORDER BY e.num DESC LIMIT ${PER} OFFSET ${(page - 1) * PER}`, params);
  const pages = Math.max(1, Math.ceil(total / PER));
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ aud, cat: sp.cat, q: sp.q, st: sp.st, miss: sp.miss, ...o })) if (v) p.set(k, v);
    return `/admin/exams?${p}`;
  };
  return (
    <>
      <div className="head">
        <div><h1>Шалгалтын материал</h1>
          <p className="muted">Шалгалт бүр бүлгүүдээс бүрдэнэ. Бүлэг бүрээс тохируулсан тооны асуулт оролцогч бүрт санамсаргүйгээр сонгогдоно. Утсаар (QR) өгөх, хэвлэж тараах аль алинд нь ашиглана.</p></div>
        <Link className="btn" href={`/admin/exams/new?aud=${aud}`}>+ Шалгалт үүсгэх</Link>
      </div>
      <AudTabs base="/admin/exams" cur={aud} />
      <Flash sp={sp} />
      <form className="form" style={{ marginBottom: 12 }} action={`${base}/admin/exams`}>
        <input type="hidden" name="aud" value={aud} />
        <label className="fld"><span>Ангилал</span>
          <select name="cat" defaultValue={sp.cat ?? ''}><option value="">Бүгд</option>{CATEGORIES.map(k => <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>)}</select></label>
        <label className="fld"><span>Хайх</span><input type="text" name="q" defaultValue={sp.q ?? ''} placeholder="Нэр, сургалт эсвэл #дугаар" /></label>
        <label className="fld"><span>Төлөв</span>
          <select name="st" defaultValue={sp.st ?? ''}><option value="">Бүгд</option><option value="ACTIVE">Идэвхтэй</option><option value="HIDDEN">Нуусан</option></select></label>
        <label className="fld"><span>Шүүлтүүр</span>
          <select name="miss" defaultValue={sp.miss ?? ''}>
            <option value="">—</option><option value="questions">Асуултгүй</option><option value="bands">Онооны шатлалгүй</option>
            <option value="eval">Үнэлгээний маягтгүй</option><option value="review">Шалгах хариулттай</option></select></label>
        <div><button className="btn">Хайх</button></div>
      </form>
      <p className="small muted">Нийт: {total}</p>
      <section className="panel" style={{ padding: 0 }}>
        <div className="tablewrap" style={{ margin: 0, padding: '0 8px' }}><table className="examtbl">
          <thead><tr><th>#</th><th>Шалгалт</th><th className="r">Асуулт</th><th>Тохиргоо</th><th>Төлөв</th><th>Шинэчилсэн</th><th></th></tr></thead>
          <tbody>{rows.map(e => (
            <tr key={e.id}>
              <td className="num">#{e.num}</td>
              <td style={{ minWidth: 240 }}><Link className="link" href={`/admin/exams/${e.id}`}><strong>{e.title}</strong></Link>
                <div className="small muted">{e.course}{e.module ? ` · ${e.module}` : ''}</div>
                <div className="meta" style={{ marginTop: 4 }}><Chip label={CATEGORY_LABEL[e.category]} tone={CAT_TONE[e.category]} />
                  {e.pending > 0 && <Chip label={`${e.pending} шалгах хариулт`} tone="warn" />}</div></td>
              <td className="r num" title="Нэг оролцогчид харагдах / сан дахь асуулт">{e.shown}<span className="muted">/{e.bank}</span></td>
              <td><div className="meta">
                {e.check_mode === 'AUTO' ? <Chip label="Автомат" tone="ok" /> : <Chip label="Гараар" tone="brand" />}
                {e.bands ? <Chip label={`${e.bands} шатлал`} tone="info" /> : <Chip label="Шатлалгүй" tone="crit" />}
                <span className="small">{e.duration_min > 0 ? `${e.duration_min} мин` : 'Хугацаагүй'}</span></div>
                <div className="small muted" style={{ marginTop: 4 }}>{e.eval_name ? `Үнэлгээ: ${e.eval_name}` : 'Үнэлгээний маягтгүй'}
                  {e.file_id && <> · <a className="link" href={`${base}/api/files/${e.file_id}`} target="_blank">{e.file_name}</a></>}</div></td>
              <td>{e.status === 'ACTIVE' ? <Chip label="Идэвхтэй" tone="ok" /> : <Chip label="Нуусан" />}</td>
              <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.updated_at)}{e.author && <div className="muted">{e.author}</div>}</td>
              <td><div className="acts" style={{ minWidth: 150 }}>
                <Link className="btn sm ghost" href={`/admin/exams/${e.id}/edit`}>Засах</Link>
                <form action={duplicateExam}><input type="hidden" name="exam_id" value={e.id} /><Submit className="btn sm ghost">Хуулбар</Submit></form>
                <form action={deleteExam}><input type="hidden" name="exam_id" value={e.id} /><Submit className="btn sm danger" confirmText={`"${e.title}"-ийг устгах уу?`}>Устгах</Submit></form>
              </div></td>
            </tr>))}
            
{!rows.length && <tr><td colSpan={7} className="muted" style={{ padding: 18 }}>Шалгалт олдсонгүй.</td></tr>}
          </tbody>
        </table></div>
      </section>
      {pages > 1 && <div className="acts" style={{ justifyContent: 'center' }}>
        {page > 1 && <Link className="btn sm ghost" href={qs({ p: String(page - 1) })}>← Өмнөх</Link>}
        <span className="small muted">{page} / {pages}</span>
        {page < pages && <Link className="btn sm ghost" href={qs({ p: String(page + 1) })}>Дараах →</Link>}
      </div>}
    </>
  );
}
