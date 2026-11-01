import Link from 'next/link';
import { all } from '@/lib/db';
import { saveExam } from '@/app/actions/exams';
import { FORMAT_LABEL } from '@/lib/progress';
import Submit from '@/components/Submit';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Шалгалтын тохиргооны маягт (үүсгэх, засах)
export default async function ExamSettings({ exam, audience }: { exam?: any; audience: 'CUSTOMER' | 'INTERNAL' }) {
  const targets = await all<any>(`
    SELECT DISTINCT ON (c.id, m.module_key) c.id AS course_id, c.title AS course, m.module_key, m.title, m.format
      FROM courses c JOIN course_versions v ON v.course_id=c.id AND v.status='PUBLISHED' JOIN modules m ON m.version_id=v.id
     WHERE c.audience=$1 ORDER BY c.id, m.module_key, v.number DESC`, [audience]);
  const courses = [...new Map(targets.map(t => [t.course_id, t.course])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const templates = await all<any>('SELECT id, name FROM eval_templates ORDER BY name');
  const fileName = exam?.file_id ? (await all<any>('SELECT name FROM files WHERE id=$1', [exam.file_id]))[0]?.name : null;
  const cur = exam ? `${exam.course_id}|${exam.module_key ?? ''}` : '';
  const radio = (name: string, opts: [string, string, string?][], val: string) => (
    <div className="checks">{opts.map(([v, l, hint]) => (
      <label key={v}><input type="radio" name={name} value={v} defaultChecked={val === v} /> {l}{hint && <span className="small muted"> — {hint}</span>}</label>))}</div>);
  return (
    <form action={saveExam} className="stack">
      {exam && <input type="hidden" name="exam_id" value={exam.id} />}
      <div className="grid2">
        <section className="panel">
          <h2>Үндсэн мэдээлэл</h2>
          <label className="fld"><span>Шалгалтын нэр</span><input type="text" name="title" required defaultValue={exam?.title} placeholder="Ж: Гематологийн анализатор — онолын шалгалт" /></label>
          <label className="fld"><span>Хамаарах сургалт / модуль</span>
            <select name="target" required defaultValue={cur}>
              <option value="" disabled>Сонгоно уу</option>
              {courses.map(([cid, title]) => (
                <optgroup key={cid} label={title}>
                  <option value={`${cid}|`}>{title} — бүхэлд нь</option>
                  {targets.filter(t => t.course_id === cid).map(m => <option key={m.module_key} value={`${cid}|${m.module_key}`}>{m.title} · {FORMAT_LABEL[m.format]}</option>)}
                </optgroup>))}
            </select>
            <span className="small muted">Модуль сонговол тэнцсэн оролцогчийн тухайн модуль дууссанд тооцогдоно.</span></label>
          <div className="fld"><span>Төлөв</span>{radio('status', [['ACTIVE', 'Идэвхтэй'], ['HIDDEN', 'Нуусан', 'шалгалт эхлүүлэх боломжгүй, бэлтгэж байх үед']], exam?.status ?? 'ACTIVE')}</div>
          <label className="fld"><span>Тайлбар (оролцогчид шалгалт эхлэхийн өмнө харагдана)</span><textarea name="description" rows={3} defaultValue={exam?.description} /></label>
          <label className="fld"><span>Дадлагын үнэлгээний хуудас эсвэл хавсралт (PDF, 20MB хүртэл)</span><input type="file" name="file" accept="application/pdf" />
            {fileName && <span className="small">Одоогийн файл: <a className="link" href={`${base}/api/files/${exam.file_id}`} target="_blank">{fileName}</a>
              <label style={{ marginLeft: 12 }}><input type="checkbox" name="remove_file" /> устгах</label></span>}</label>
        </section>
        <section className="panel">
          <h2>Шалгах, дүгнэх</h2>
          <div className="fld"><span>Шалгах арга</span>{radio('check_mode', [
            ['AUTO', 'Автомат', 'сонгох асуултыг систем дүгнэнэ; бичвэр хариултыг багш шалгана'],
            ['MANUAL', 'Гараар', 'багш бүх хариултыг шалгаж дүн оруулна; асуултгүй дадлагын үнэлгээ (VoC) байж болно'],
          ], exam?.check_mode ?? 'AUTO')}</div>
          <div className="fld"><span>Дүн харуулах</span>{radio('show_result', [['NOW', 'Шууд', 'илгээмэгц'], ['LATER', 'Дараа', 'шалгалтын холбоос хаагдсаны дараа']], exam?.show_result ?? 'NOW')}</div>
          <div className="form">
            <label className="fld"><span>Хугацаа (минут, 0 = хязгааргүй)</span><input type="number" name="duration_min" min={0} defaultValue={exam?.duration_min ?? 20} /></label>
            <label className="fld"><span>Оролдлогын тоо</span><input type="number" name="attempts_allowed" min={1} max={10} defaultValue={exam?.attempts_allowed ?? 1} /></label>
            <label className="fld"><span>Тэнцэх хувь (шатлалгүй үед)</span><input type="number" name="pass_score" min={0} max={100} defaultValue={exam?.pass_score ?? 70} /></label>
          </div>
          <label className="checks"><label><input type="checkbox" name="shuffle" defaultChecked={exam?.shuffle ?? true} /> Бүлэг доторх асуултын дарааллыг оролцогч бүрт холих</label></label>
          <label className="fld"><span>Хичээлийн үнэлгээний маягт (шалгалтын дараа)</span>
            <select name="eval_template_id" defaultValue={exam?.eval_template_id ?? ''}><option value="">— Холбохгүй —</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <p className="small muted">Онооны шатлал (жишээ нь 0–7 оноо: Not yet competent, 8–10: Competent) оруулбал дүнг шатлалаар, эс бөгөөс тэнцэх хувиар гаргана.</p>
        </section>
      </div>
      <div className="acts" style={{ justifyContent: 'flex-start' }}>
        <Submit>{exam ? 'Хадгалах' : 'Үүсгэх'}</Submit>
        <Link className="btn ghost" href={exam ? `/admin/exams/${exam.id}` : '/admin/exams'}>Буцах</Link>
      </div>
    </form>
  );
}
