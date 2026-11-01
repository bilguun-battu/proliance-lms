import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all, one } from '@/lib/db';
import { ACCESS_SQL } from '@/lib/assign';
import { updateCourse, startDraft, deleteCourse } from '@/app/actions/admin';
import { courseProgress, FORMAT_LABEL, AUDIENCE_LABEL, CATEGORY_LABEL } from '@/lib/progress';
import CourseSetupFields from '@/components/CourseSetupFields';
import { Flash, Chip, CourseChip } from '@/components/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import Submit from '@/components/Submit';

const CHANGE: Record<string, [string, string]> = { NEW: ['Шинэ', 'info'], CHANGED: ['Өөрчлөгдсөн', 'warn'], SAME: ['', ''] };

export default async function CourseAdmin({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; err?: string } }) {
  const c = await one<any>('SELECT * FROM courses WHERE id=$1', [params.id]);
  if (!c) notFound();
  const products = await all<any>('SELECT p.id, p.code, p.name, EXISTS (SELECT 1 FROM course_products cp WHERE cp.course_id=$1 AND cp.product_id=p.id) AS on FROM products p ORDER BY p.code', [c.id]);
  const allCourses = await all<any>('SELECT x.id, x.title, x.audience, EXISTS (SELECT 1 FROM course_trainer_targets t WHERE t.course_id=$1 AND t.target_course_id=x.id) AS on FROM courses x ORDER BY x.audience, x.title', [c.id]);
  const trainers = await all<any>('SELECT u.name, q.source FROM trainer_quals q JOIN users u ON u.id=q.user_id WHERE q.course_id=$1 ORDER BY u.name', [c.id]);
  const versions = await all<any>('SELECT * FROM course_versions WHERE course_id=$1 ORDER BY number DESC', [c.id]);
  const mods = await all<any>('SELECT version_id, title, change, mandatory, format FROM modules WHERE version_id = ANY($1) ORDER BY position', [versions.map(v => v.id)]);
  const draft = versions.find(v => v.status === 'DRAFT');
  const pub = versions.find(v => v.status === 'PUBLISHED');
  const learners = await all<any>(`
    SELECT u.id, u.name, o.name AS org FROM (${ACCESS_SQL}) acc JOIN users u ON u.id=acc.uid LEFT JOIN orgs o ON o.id=u.org_id
     WHERE acc.cid=$1 ORDER BY o.name, u.name`, [c.id]);
  const progress = pub ? await Promise.all(learners.map(async l => ({ l, p: await courseProgress(l.id, c.id) }))) : [];
  return (
    <>
      <div><Link className="link small" href={`/admin/courses?aud=${c.audience === 'INTERNAL' ? 'internal' : 'customer'}`}>← {AUDIENCE_LABEL[c.audience]}</Link></div>
      <div className="head">
        <div><h1>{c.title}</h1><p className="muted">{AUDIENCE_LABEL[c.audience]} · {CATEGORY_LABEL[c.category]} · {pub ? `v${pub.number}, ${fmtDate(pub.published_at)}` : 'Нийтлэгдээгүй'}</p>
          {trainers.length > 0 && <p className="small muted" style={{ margin: '4px 0 0' }}>Сургагч / үнэлэгч: {trainers.map(t => t.name).join(', ')}</p>}</div>
        {draft
          ? <Link className="btn" href={`/admin/courses/${c.id}/draft`}>Ноорог v{draft.number}-г үргэлжлүүлэх</Link>
          : <form action={startDraft}><input type="hidden" name="course_id" value={c.id} /><Submit>Шинэ хувилбар бэлтгэх</Submit></form>}
      </div>
      <Flash sp={searchParams} />
      <div className="grid2">
        <section className="panel">
          <h2>Суралцагчдын явц</h2>
          {!pub ? <p className="muted">Сургалт нийтлэгдсэний дараа явц харагдана.</p> : progress.length ? (
            <div className="tablewrap"><table>
              <thead><tr><th>Суралцагч</th><th>Төлөв</th><th className="r">Дууссан</th><th>Сүүлд</th></tr></thead>
              <tbody>{progress.map(({ l, p }) => p && (
                <tr key={l.id}><td><strong>{l.name}</strong><div className="small muted">{l.org}</div></td>
                  <td><CourseChip k={p.key} /></td><td className="r">{p.done}/{p.total}</td><td className="small muted">{fmtDateTime(p.lastActivity)}</td></tr>))}
              </tbody></table></div>
          ) : <p className="muted">Энэ сургалтын бүтээгдэхүүнийг авсан байгууллагад хэрэглэгч алга.</p>}
        </section>
        <section className="panel">
          <h2>Хувилбарын түүх</h2>
          {versions.map(v => (
            <div key={v.id} className={`ver ${v === pub ? 'cur' : ''}`}>
              <div className="acts" style={{ justifyContent: 'flex-start' }}>
                <strong className="num">v{v.number}</strong>
                {v.status === 'DRAFT' ? <Chip label="Ноорог" tone="warn" /> : <span className="small muted">{fmtDate(v.published_at)}</span>}
                {v === pub && <Chip label="Одоогийн" tone="ok" />}
              </div>
              {v.notes && <div className="small">{v.notes}</div>}
              {mods.filter(m => m.version_id === v.id).map((m, i) => (
                <div key={i} className="acts small" style={{ justifyContent: 'flex-start' }}>
                  <span>{m.title}</span>{m.format !== 'ELEARN' && <span className="fmt">{FORMAT_LABEL[m.format]}</span>}
                  {v.number > 1 && v.status === 'PUBLISHED' && m.change !== 'SAME' && <Chip label={m.change === 'CHANGED' ? (m.mandatory ? 'Өөрчлөгдсөн · заавал' : 'Өөрчлөгдсөн · зөвлөмж') : CHANGE.NEW[0]} tone={m.change === 'NEW' ? 'info' : m.mandatory ? 'warn' : 'neutral'} />}
                </div>))}
              {(v.removed ?? []).map((t: string, i: number) => <div key={i} className="small muted"><s>{t}</s> · хасагдсан</div>)}
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <h2>Тохиргоо</h2>
        <form action={updateCourse} className="stack">
          <input type="hidden" name="id" value={c.id} />
          <div className="form">
            <label className="fld full"><span>Нэр</span><input type="text" name="title" defaultValue={c.title} required /></label>
            <label className="fld full"><span>Тайлбар</span><textarea name="description" defaultValue={c.description} /></label>
            <label className="fld"><span>Шинэчлэлтийг үзэх хугацаа (хоног)</span><input type="number" name="due_days" defaultValue={c.due_days} min={1} /></label>
            <label className="checks"><label><input type="checkbox" name="sequential" defaultChecked={c.sequential} /> Модулиудыг дарааллаар нээх</label></label>
            <CourseSetupFields products={products} courses={allCourses} audience={c.audience} category={c.category} selfId={c.id} />
          </div>
          <div className="acts" style={{ justifyContent: 'flex-start' }}><Submit>Хадгалах</Submit></div>
        </form>
        <form action={deleteCourse}>
          <input type="hidden" name="course_id" value={c.id} />
          <Submit className="btn sm danger" confirmText="Сургалтыг бүх хувилбар, явцын хамт устгах уу? Буцаах боломжгүй.">Сургалтыг устгах</Submit>
        </form>
      </section>
    </>
  );
}
