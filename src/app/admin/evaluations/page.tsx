import Link from 'next/link';
import { all } from '@/lib/db';
import { createTemplate } from '@/app/actions/evals';
import { Flash, Chip } from '@/components/ui';
import { FORMAT_LABEL } from '@/lib/progress';
import Submit from '@/components/Submit';

export default async function Evaluations({ searchParams }: { searchParams: { ok?: string; err?: string } }) {
  const courses = await all<any>('SELECT id, title FROM courses ORDER BY title');
  const ts = await all<any>(`
    SELECT t.*, c.title AS course, (SELECT count(*)::int FROM eval_questions q WHERE q.template_id=t.id) AS qn,
      (SELECT count(*)::int FROM eval_responses r JOIN eval_runs x ON x.id=r.run_id WHERE x.template_id=t.id) AS responses
      FROM eval_templates t LEFT JOIN courses c ON c.id=t.course_id ORDER BY t.format NULLS LAST, t.name`);
  return (
    <>
      <div className="head"><div><h1>Хичээлийн үнэлгээ</h1><p className="muted">Хичээлийн төрөл эсвэл сургалт бүрт үнэлгээний маягт үүсгэнэ. Хичээл, шалгалтын дараа тусдаа QR-ээр оролцогчид утсаараа бөглөнө.</p></div></div>
      <Flash sp={searchParams} />
      <section className="panel">
        <h2>Шинэ маягт</h2>
        <form action={createTemplate} className="form">
          <label className="fld"><span>Нэр</span><input type="text" name="name" required placeholder="Ж: Биечлэн дадлагын үнэлгээ" /></label>
          <label className="fld"><span>Хичээлийн төрөл</span><select name="format" defaultValue="INPERSON"><option value="">Бүх төрөл</option>{Object.entries(FORMAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="fld"><span>Сургалт</span><select name="course_id" defaultValue=""><option value="">Бүх сургалт</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
          <div className="checks full">
            <label><input type="checkbox" name="defaults" defaultChecked /> Жишээ асуултаар эхлүүлэх (агуулга, багшийн заах арга, зохион байгуулалт)</label>
            <label><input type="checkbox" name="anonymous" defaultChecked /> Нэргүй (үр дүнд оролцогчийн нэр харагдахгүй)</label>
          </div>
          <div><Submit>Үүсгэх</Submit></div>
        </form>
      </section>
      <div className="list">
        {ts.map(t => (
          <Link key={t.id} href={`/admin/evaluations/${t.id}`} className="row">
            <div><strong>{t.name}</strong>
              <div className="meta"><span className="fmt">{t.format ? FORMAT_LABEL[t.format] : 'Бүх төрөл'}</span><span>{t.course ?? 'Бүх сургалт'}</span><span>{t.qn} асуулт</span>{t.anonymous && <span>Нэргүй</span>}</div></div>
            <div className="acts"><Chip label={`${t.responses} хариулт`} tone={t.responses ? 'ok' : 'neutral'} /></div>
          </Link>))}
        {!ts.length && <div className="empty">Маягт алга.</div>}
      </div>
    </>
  );
}
