import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all, one } from '@/lib/db';
import { saveDraftNotes, addModule, setModuleChange, moveModule, removeModule, publishDraft, discardDraft } from '@/app/actions/admin';
import { Flash, Chip } from '@/components/ui';
import { FORMAT_LABEL, CATEGORY_FORMATS, CATEGORY_LABEL } from '@/lib/progress';

const FORMAT_OPTION: Record<string, string> = { ELEARN: 'Цахим (видео, PDF, тест)', INPERSON: 'Танхим', ONLINE: 'Онлайн шууд', OJT: 'Ажлын байран дээр (OJT)', VOC: 'Ур чадварын баталгаажуулалт (VoC)' };
import Submit from '@/components/Submit';
import AutoForm from '@/components/AutoForm';

export default async function Draft(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const c = await one<any>('SELECT * FROM courses WHERE id=$1', [params.id]);
  if (!c) notFound();
  const d = await one<any>(`SELECT * FROM course_versions WHERE course_id=$1 AND status='DRAFT'`, [c.id]);
  if (!d) return <div className="panel"><p>Ноорог хувилбар алга. <Link className="link" href={`/admin/courses/${c.id}`}>Сургалт руу буцах</Link></p></div>;
  const mods = await all<any>(`SELECT m.*, (SELECT count(*)::int FROM questions q WHERE q.module_id=m.id) AS qcount, (SELECT count(*)::int FROM module_items i WHERE i.module_id=m.id) AS icount FROM modules m WHERE version_id=$1 ORDER BY position`, [d.id]);
  const pub = await one<any>(`SELECT id FROM course_versions WHERE course_id=$1 AND status='PUBLISHED' ORDER BY number DESC LIMIT 1`, [c.id]);
  const prevMods = pub ? await all<any>('SELECT module_key, title FROM modules WHERE version_id=$1', [pub.id]) : [];
  const removed = prevMods.filter(p => !mods.some(m => m.module_key === p.module_key));
  const notifyCount = pub ? (await one<any>('SELECT count(DISTINCT user_id)::int AS n FROM completions WHERE course_id=$1', [c.id]))!.n : 0;
  const hidden = (m: any) => <><input type="hidden" name="course_id" value={c.id} /><input type="hidden" name="module_id" value={m.id} /></>;

  return (
    <>
      <div><Link className="link small" href={`/admin/courses/${c.id}`}>← {c.title}</Link></div>
      <div className="head"><div><h1>v{d.number} хувилбар бэлтгэх</h1>
        <p className="muted">{d.number === 1 ? 'Модулиудаа нэмээд нийтэлнэ үү.' : 'Агуулга нь өөрчлөгдсөн модулийг "Өөрчлөгдсөн" гэж тэмдэглэнэ. Видео, гарын авлага, тест солиход автоматаар тэмдэглэгдэнэ. Биечлэн, онлайн модуль өөрчлөгдвөл өмнө ирсэн хүмүүс дахин бүртгүүлнэ.'}</p></div></div>
      <Flash sp={searchParams} />

      <section className="panel">
        <h2>Модулиуд</h2>
        {mods.length ? <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
          {mods.map((m, i) => (
            <div key={m.id} className="row" style={{ alignItems: 'start' }}>
              <div>
                <div className="acts" style={{ justifyContent: 'flex-start' }}>
                  <span className="muted num">{i + 1}.</span>
                  <Link className="link" href={`/admin/courses/${c.id}/draft/${m.id}`}>{m.title}</Link>
                  {m.change === 'NEW' && d.number > 1 && <Chip label="Шинэ" tone="info" />}
                </div>
                <div className="meta">
                  <span className="fmt">{FORMAT_LABEL[m.format]}</span>
                  <span>{m.duration_min} мин</span>
                  {m.format === 'ELEARN' ? <>
                    <span>{m.video_file ? 'Видео ✓' : 'Видеогүй'}</span>
                    <span>{m.pdf_file ? 'Гарын авлага ✓' : 'Гарын авлагагүй'}</span>
                    <span>{m.qcount ? `${m.qcount} асуулт · тэнцэх ${m.pass_score}%` : 'Тестгүй'}</span>
                  </> : m.format === 'OJT' || m.format === 'VOC' ? <span>{m.icount} {m.format === 'OJT' ? 'даалгавар · хянагч баталгаажуулна' : 'шалгуур · үнэлэгч баталгаажуулна'}</span>
                  : <span>Ирцээр дуусна{m.pdf_file ? ' · материал ✓' : ''}</span>}
                </div>
                {m.change !== 'NEW' && (
                  <AutoForm action={setModuleChange} className="acts" >
                    {hidden(m)}
                    <select name="change" defaultValue={m.change} aria-label="Өөрчлөлт" style={{ width: 'auto' }}>
                      <option value="SAME">Өөрчлөгдөөгүй</option>
                      <option value="CHANGED">Агуулга өөрчлөгдсөн</option>
                    </select>
                    {m.change === 'CHANGED' && <label className="checks"><label><input type="checkbox" name="mandatory" defaultChecked={m.mandatory} /> Заавал дахин үзэх</label></label>}
                    {m.change === 'SAME' && m.mandatory && <input type="hidden" name="mandatory" value="on" />}
                  </AutoForm>
                )}
              </div>
              <div className="acts">
                <form action={moveModule}>{hidden(m)}<input type="hidden" name="dir" value="up" /><button className="btn sm ghost" disabled={i === 0} aria-label="Дээш">↑</button></form>
                <form action={moveModule}>{hidden(m)}<input type="hidden" name="dir" value="down" /><button className="btn sm ghost" disabled={i === mods.length - 1} aria-label="Доош">↓</button></form>
                <form action={removeModule}>{hidden(m)}<Submit className="btn sm danger" confirmText="Модулийг энэ хувилбараас хасах уу?">Хасах</Submit></form>
              </div>
            </div>
          ))}
        </div> : <p className="muted">Модуль алга.</p>}
        {removed.length > 0 && <p className="small muted">Хасагдах модуль: {removed.map(r => r.title).join(', ')}</p>}
      </section>

      <section className="panel">
        <h2>Модуль нэмэх</h2>
        <form action={addModule} className="form">
          <input type="hidden" name="course_id" value={c.id} />
          <label className="fld"><span>Нэр</span><input type="text" name="title" required /></label>
          <label className="fld"><span>Хэлбэр</span><select name="format" defaultValue={CATEGORY_FORMATS[c.category]?.[0]}>{(CATEGORY_FORMATS[c.category] ?? []).map(f => <option key={f} value={f}>{FORMAT_OPTION[f]}</option>)}</select></label>
          <label className="fld"><span>Үргэлжлэх (мин)</span><input type="number" name="duration_min" defaultValue={15} min={1} /></label>
          <label className="fld full"><span>Тайлбар</span><input type="text" name="description" /></label>
          <div><Submit className="btn ghost">+ Нэмэх</Submit></div>
        </form>
      </section>

      <section className="panel">
        <h2>{d.number > 1 ? 'Өөрчлөлтийн тайлбар' : 'Тайлбар'}</h2>
        <form action={saveDraftNotes} className="stack">
          <input type="hidden" name="course_id" value={c.id} />
          <textarea name="notes" defaultValue={d.notes} placeholder="Суралцагчдад очих мэдэгдэлд энэ тайлбар орно" />
          <div><Submit className="btn ghost">Тайлбар хадгалах</Submit></div>
        </form>
        {d.number > 1 && <div className="notice soft"><strong>Нийтлэхэд {notifyCount} суралцагчид мэдэгдэл очно</strong>
          <span className="small muted">Энэ сургалтад өмнө нь суусан хүмүүс системээр болон имэйлээр мэдэгдэл авна. Утасны дугаар бүртгэлтэй бол SMS мөн очно. Мэдэгдэлд тухайн хүний үзэх шаардлагатай модулиуд жагсаалтаар орно.</span></div>}
        <div className="acts" style={{ justifyContent: 'flex-start' }}>
          <form action={publishDraft}><input type="hidden" name="course_id" value={c.id} /><Submit confirmText={`v${d.number} хувилбарыг нийтлэх үү?`}>v{d.number} нийтлэх</Submit></form>
          {d.number > 1 && <form action={discardDraft}><input type="hidden" name="course_id" value={c.id} /><Submit className="btn danger" confirmText="Ноорогийг устгах уу?">Ноорог устгах</Submit></form>}
        </div>
      </section>
    </>
  );
}
