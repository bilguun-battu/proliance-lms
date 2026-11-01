import Link from 'next/link';
import { all } from '@/lib/db';
import { createExam } from '@/app/actions/exams';
import { Flash, Chip } from '@/components/ui';
import { FORMAT_LABEL } from '@/lib/progress';
import Submit from '@/components/Submit';

export default async function Exams(props: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const searchParams = await props.searchParams;
  const targets = await all<any>(`
    SELECT DISTINCT ON (v.course_id, m.module_key) v.course_id, c.title AS course, m.module_key, m.title, m.format
      FROM modules m JOIN course_versions v ON v.id=m.version_id JOIN courses c ON c.id=v.course_id
     WHERE v.status='PUBLISHED' ORDER BY v.course_id, m.module_key, v.number DESC`);
  const exams = await all<any>(`
    SELECT e.*, c.title AS course,
      (SELECT m.title FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=e.course_id AND m.module_key=e.module_key ORDER BY v.number DESC LIMIT 1) AS module,
      (SELECT count(*)::int FROM exam_variants v WHERE v.exam_id=e.id) AS variants,
      (SELECT count(*)::int FROM exam_questions q JOIN exam_variants v ON v.id=q.variant_id WHERE v.exam_id=e.id) AS questions,
      (SELECT count(*)::int FROM exam_runs r WHERE r.exam_id=e.id) AS runs
      FROM exams e JOIN courses c ON c.id=e.course_id ORDER BY c.title, e.title`);
  const byCourse = new Map<string, any[]>();
  for (const t of targets) byCourse.set(t.course, [...(byCourse.get(t.course) ?? []), t]);
  return (
    <>
      <div className="head"><div><h1>Шалгалт</h1><p className="muted">Хичээлийн дараа QR кодоор авах шалгалтын материал. Хувилбар бүр өөр асуулттай бөгөөд оролцогч бүрт санамсаргүйгээр нэг нь оногдоно.</p></div></div>
      <Flash sp={searchParams} />
      <section className="panel">
        <h2>Шинэ шалгалт</h2>
        <form action={createExam} className="form">
          <label className="fld"><span>Шалгалтын нэр</span><input type="text" name="title" required placeholder="Ж: Урвалж солих дадлагын шалгалт" /></label>
          <label className="fld"><span>Хамаарах модуль</span>
            <select name="target" required>{Array.from(byCourse.entries()).map(([course, mods]) => (
              <optgroup key={course} label={course}>
                {mods.map(m => <option key={m.module_key} value={`${m.course_id}|${m.module_key}`}>{m.title} · {FORMAT_LABEL[m.format]}</option>)}
              </optgroup>))}
            </select></label>
          <label className="fld"><span>Хувилбарын тоо</span><input type="number" name="variants" defaultValue={2} min={1} max={10} /></label>
          <label className="fld"><span>Хугацаа (мин)</span><input type="number" name="duration_min" defaultValue={20} min={1} /></label>
          <label className="fld"><span>Тэнцэх оноо (%)</span><input type="number" name="pass_score" defaultValue={70} min={0} max={100} /></label>
          <div><Submit>Үүсгэх</Submit></div>
        </form>
      </section>
      <div className="list">
        {exams.map(e => (
          <Link key={e.id} href={`/admin/exams/${e.id}`} className="row">
            <div><strong>{e.title}</strong>
              <div className="meta"><span>{e.course}</span>{e.module && <span>{e.module}</span>}<span>{e.duration_min} мин · тэнцэх {e.pass_score}%</span></div></div>
            <div className="acts"><Chip label={`${e.variants} хувилбар · ${e.questions} асуулт`} tone="brand" />{e.runs > 0 && <Chip label={`${e.runs} удаа авсан`} tone="ok" />}</div>
          </Link>))}
        {!exams.length && <div className="empty">Шалгалт үүсгээгүй байна.</div>}
      </div>
    </>
  );
}
