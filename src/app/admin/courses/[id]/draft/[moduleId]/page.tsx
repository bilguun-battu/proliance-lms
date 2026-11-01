import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all, one } from '@/lib/db';
import { updateModuleMeta, addQuestion, deleteQuestion, removeModuleFile, addModuleItem, deleteModuleItem, setModuleVideoUrl } from '@/app/actions/admin';
import { parseVideoUrl } from '@/lib/video';
import { Flash } from '@/components/ui';
import Submit from '@/components/Submit';
import Uploader from '@/components/Uploader';
import { FORMAT_LABEL, CATEGORY_FORMATS } from '@/lib/progress';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default async function ModuleEdit(
  props: { params: Promise<{ id: string; moduleId: string }>; searchParams: Promise<{ ok?: string; err?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const m = await one<any>(`
    SELECT m.*, v.course_id, v.number, v.status, c.title AS course, c.category FROM modules m
      JOIN course_versions v ON v.id=m.version_id JOIN courses c ON c.id=v.course_id
     WHERE m.id=$1 AND v.course_id=$2`, [params.moduleId, params.id]);
  if (!m || m.status !== 'DRAFT') notFound();
  const qs = await all<any>('SELECT * FROM questions WHERE module_id=$1 ORDER BY position', [m.id]);
  const items = await all<any>('SELECT * FROM module_items WHERE module_id=$1 ORDER BY position', [m.id]);
  const practical = m.format === 'OJT' || m.format === 'VOC';
  const files = await all<any>('SELECT id, name, size FROM files WHERE id = ANY($1)', [[m.video_file, m.pdf_file].filter(Boolean)]);
  const f = (id: string | null) => files.find(x => x.id === id);
  const vsrc = parseVideoUrl(m.video_url);
  const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
  const hidden = <><input type="hidden" name="course_id" value={m.course_id} /><input type="hidden" name="module_id" value={m.id} /></>;
  const back = `/admin/courses/${m.course_id}/draft/${m.id}`;

  return (
    <>
      <div><Link className="link small" href={`/admin/courses/${m.course_id}/draft`}>← v{m.number} хувилбар · {m.course}</Link></div>
      <div className="head"><h1>{m.title}</h1></div>
      <Flash sp={searchParams} />
      <div className="grid2">
        {m.format === 'ELEARN' ? <section className="panel">
          <h2>Видео</h2>
          {m.video_file ? <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={`${base}/api/files/${m.video_file}`} controls preload="metadata" style={{ width: '100%', borderRadius: 10, background: '#000' }} />
            <div className="meta"><span>{f(m.video_file)?.name}</span><span>{f(m.video_file) && mb(Number(f(m.video_file).size))}</span></div>
            <div className="acts" style={{ justifyContent: 'flex-start' }}>
              <Uploader moduleId={m.id} kind="video" accept="video/mp4,video/webm" label="Видео солих" />
              <form action={removeModuleFile}>{hidden}<input type="hidden" name="kind" value="video" /><Submit className="btn sm danger">Хасах</Submit></form>
            </div>
          </> : vsrc ? <>
            {vsrc.kind === 'youtube'
              ? <div className="yt-wrap"><iframe src={`https://www.youtube-nocookie.com/embed/${vsrc.id}?rel=0`} title="YouTube" allow="encrypted-media; picture-in-picture" allowFullScreen /></div>
              // eslint-disable-next-line jsx-a11y/media-has-caption
              : <video src={vsrc.url} controls preload="metadata" style={{ width: '100%', borderRadius: 10, background: '#000' }} />}
            <div className="meta"><span>{vsrc.kind === 'youtube' ? 'YouTube' : 'Гадны сервер'}</span><a className="link" href={m.video_url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{m.video_url}</a></div>
            <form action={removeModuleFile}>{hidden}<input type="hidden" name="kind" value="url" /><Submit className="btn sm danger">Холбоос хасах</Submit></form>
          </> : <Uploader moduleId={m.id} kind="video" accept="video/mp4,video/webm" label="Видео байршуулах (MP4, 500MB хүртэл)" />}
          <form action={setModuleVideoUrl} className="stack" style={{ gap: 6 }}>
            {hidden}
            <label className="fld"><span>{m.video_file ? 'Эсвэл файлын оронд' : 'Эсвэл'} видео холбоос (URL)</span>
              <input type="url" name="video_url" defaultValue={m.video_url ?? ''} placeholder="https://www.youtube.com/watch?v=… эсвэл https://…/bichleg.mp4" required /></label>
            <div className="acts" style={{ justifyContent: 'flex-start' }}><Submit className="btn ghost sm">Холбоос хадгалах</Submit>
              <span className="small muted">YouTube эсвэл өөр сервер дээрх MP4/WebM бичлэг. Суралцагч бичлэгийг эхнээс нь дуустал бүрэн үзэж байж хичээл дууссанд тооцогдоно.</span></div>
          </form>
        </section> : practical ? <section className="panel">
          <h2>{m.format === 'OJT' ? 'Ажлын байран дээрх даалгаврууд' : 'Ур чадварын шалгуурууд'} ({items.length})</h2>
          <p className="small muted">{m.format === 'OJT'
            ? 'Суралцагч даалгавар бүрийг ажлын байран дээр гүйцэтгээд тэмдэглэнэ. Бүгдийг дуусгаад илгээхэд хянагч (сургагч эрхтэй ажилтан) баталгаажуулна.'
            : 'Үнэлэгч (сургагч эрхтэй ажилтан) шалгуур бүрийг "Хангасан / Хангаагүй" гэж үнэлж, Competent эсвэл Not yet competent гэж шийдвэрлэнэ.'}</p>
          <ol className="stack" style={{ gap: 6, margin: 0, paddingLeft: 20 }}>{items.map(it => (
            <li key={it.id}><div className="acts" style={{ justifyContent: 'space-between' }}><span>{it.text}</span>
              <form action={deleteModuleItem}>{hidden}<input type="hidden" name="item_id" value={it.id} /><Submit className="btn sm danger" confirmText="Устгах уу?">Устгах</Submit></form></div></li>))}</ol>
          <form action={addModuleItem} className="stack">
            {hidden}
            <label className="fld"><span>{m.format === 'OJT' ? 'Шинэ даалгавар' : 'Шинэ шалгуур'} (мөр бүрт нэг)</span><textarea name="text" rows={3} required /></label>
            <div><Submit className="btn ghost">+ Нэмэх</Submit></div>
          </form>
        </section> : <section className="panel">
          <h2>{FORMAT_LABEL[m.format]} хичээл</h2>
          <p className="small muted">Энэ модуль хуваарьт хичээлээр явагдана. Хуваарийг "Хуваарь" цэснээс нийтэлсний дараа нэмнэ. Ирц батлагдахад модуль дууссанд тооцогдоно.</p>
        </section>}
        <section className="panel">
          <h2>{m.format === 'ELEARN' ? 'Гарын авлага (PDF)' : practical ? 'Ажлын заавар (PDF, заавал биш)' : 'Хичээлийн материал (PDF, заавал биш)'}</h2>
          {m.pdf_file ? <>
            <div className="meta"><a className="link" href={`${base}/api/files/${m.pdf_file}`} target="_blank">{f(m.pdf_file)?.name}</a><span>{f(m.pdf_file) && mb(Number(f(m.pdf_file).size))}</span></div>
            <div className="acts" style={{ justifyContent: 'flex-start' }}>
              <Uploader moduleId={m.id} kind="pdf" accept="application/pdf" label="PDF солих" />
              <form action={removeModuleFile}>{hidden}<input type="hidden" name="kind" value="pdf" /><Submit className="btn sm danger">Хасах</Submit></form>
            </div>
          </> : <Uploader moduleId={m.id} kind="pdf" accept="application/pdf" label="PDF байршуулах" />}
        </section>
      </div>

      <section className="panel">
        <h2>Модулийн мэдээлэл</h2>
        <form action={updateModuleMeta} className="form">
          {hidden}<input type="hidden" name="back" value={back} />
          <label className="fld"><span>Нэр</span><input type="text" name="title" defaultValue={m.title} required /></label>
          <label className="fld"><span>Үргэлжлэх (мин)</span><input type="number" name="duration_min" defaultValue={m.duration_min} min={1} /></label>
          {m.change === 'NEW' && <label className="fld"><span>Хэлбэр</span><select name="format" defaultValue={m.format}>{Array.from(new Set([m.format, ...(CATEGORY_FORMATS[m.category] ?? [])])).map(f => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}</select></label>}
          {m.format === 'ELEARN' ? <label className="fld"><span>Тестийн тэнцэх оноо (%)</span><input type="number" name="pass_score" defaultValue={m.pass_score} min={0} max={100} /></label>
            : <input type="hidden" name="pass_score" value={m.pass_score} />}
          {m.change !== 'NEW' && <label className="fld"><span>Өөрчлөлт</span>
            <select name="change" defaultValue={m.change}><option value="SAME">Өөрчлөгдөөгүй</option><option value="CHANGED">Агуулга өөрчлөгдсөн</option></select></label>}
          <label className="fld full"><span>Тайлбар</span><textarea name="description" defaultValue={m.description} /></label>
          {m.change !== 'NEW' && <label className="checks full"><label><input type="checkbox" name="mandatory" defaultChecked={m.mandatory} /> Өөрчлөгдсөн бол өмнө үзсэн хүмүүс заавал дахин үзнэ</label></label>}
          <div><Submit>Хадгалах</Submit></div>
        </form>
      </section>

      {m.format === 'ELEARN' && <section className="panel">
        <h2>Тест ({qs.length} асуулт)</h2>
        <p className="small muted">Видео болон гарын авлагын бүх хуудсыг 100% үзсэний дараа тест нээгдэнэ. Тестгүй бол материалыг бүрэн үзэж дуусгахад модуль дуусна.</p>
        {qs.map((q, i) => (
          <div key={q.id} className="q">
            <div className="acts" style={{ justifyContent: 'space-between' }}>
              <strong>{i + 1}. {q.text}</strong>
              <form action={deleteQuestion}>{hidden}<input type="hidden" name="question_id" value={q.id} /><Submit className="btn sm danger" confirmText="Асуултыг устгах уу?">Устгах</Submit></form>
            </div>
            <ol className="small" style={{ margin: 0 }}>{(q.options as string[]).map((o, j) => <li key={j} style={j === q.correct_index ? { color: 'var(--ok)', fontWeight: 700 } : undefined}>{o}{j === q.correct_index ? ' ✓' : ''}</li>)}</ol>
          </div>
        ))}
        <form action={addQuestion} className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          {hidden}
          <label className="fld"><span>Шинэ асуулт</span><input type="text" name="text" required /></label>
          <div className="form">
            {[1, 2, 3, 4, 5].map(i => <label key={i} className="fld"><span>Хариулт {i}{i > 2 ? ' (заавал биш)' : ''}</span><input type="text" name={`opt${i}`} required={i <= 2} /></label>)}
            <label className="fld"><span>Зөв хариулт</span><select name="correct" defaultValue="1">{[1, 2, 3, 4, 5].map(i => <option key={i} value={i}>{i}</option>)}</select></label>
          </div>
          <div><Submit className="btn ghost">+ Асуулт нэмэх</Submit></div>
        </form>
      </section>}
    </>
  );
}
