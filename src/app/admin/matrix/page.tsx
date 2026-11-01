import Link from 'next/link';
import { all } from '@/lib/db';
import { Flash, Chip } from '@/components/ui';
import Submit from '@/components/Submit';
import { CATEGORY_LABEL, CAT_TONE, CATEGORIES } from '@/lib/progress';
import { addPosition, deletePosition, saveMatrix, addMatrixEntries, deleteMatrixEntry } from '@/app/actions/matrix';
import CheckList from '@/components/CheckList';

const OPTS: [string, string][] = [['', '—'], ['0', 'Нэг удаа'], ['12', '12 сар тутам'], ['24', '24 сар тутам'], ['36', '36 сар тутам']];

export default async function Matrix(props: { searchParams: Promise<{ ok?: string; err?: string; view?: string; pos?: string; course?: string; q?: string }> }) {
  const searchParams = await props.searchParams;
  const list = searchParams.view !== 'grid';
  const positions = await all<any>(`
    SELECT p.*, (SELECT count(*)::int FROM users u JOIN orgs o ON o.id=u.org_id WHERE u.position=p.name AND u.active AND o.is_internal) AS people
      FROM positions p ORDER BY p.department NULLS LAST, p.name`);
  const courses = await all<any>(`
    SELECT c.id, c.title, c.category FROM courses c
     WHERE c.audience='INTERNAL' AND EXISTS (SELECT 1 FROM course_versions v WHERE v.course_id=c.id AND v.status='PUBLISHED')
     ORDER BY array_position($1::text[], c.category), c.title`, [CATEGORIES]);
  const cells = await all<any>(`SELECT id, target_value AS position, course_id, recurrence_months, due_days FROM assignments WHERE source='MATRIX' AND target='POSITION'`);
  const cell = (pos: string, cid: string) => cells.find(c => c.position === pos && c.course_id === cid);
  const due = cells[0]?.due_days ?? 30;
  const depts = await all<{ department: string }>(`SELECT DISTINCT department FROM users WHERE department IS NOT NULL ORDER BY 1`);
  return (
    <>
      <datalist id="mdepts">{depts.map(d => <option key={d.department} value={d.department} />)}</datalist>
      <div className="head">
        <div><h1>Сургалтын матриц</h1>
          <p className="muted">Албан тушаал бүрийн заавал хамрагдах сургалт. Ажилтанд албан тушаал оноомогц эдгээр сургалт автоматаар оноогдож, мэдэгдэл очно. Хугацаа нь тухайн албан тушаалд орсон өдрөөс тоологдоно.</p></div>
        <Link className="btn ghost" href="/admin/compliance?aud=internal">Биелэлтийн тайлан</Link>
      </div>
      <Flash sp={searchParams} />
      <div className="viewtabs" role="tablist">
        <Link href="/admin/matrix" aria-current={list ? 'page' : undefined}>Жагсаалт</Link>
        <Link href="/admin/matrix?view=grid" aria-current={!list ? 'page' : undefined}>Матриц (хүснэгт)</Link>
      </div>
      {list ? <>
        <section className="panel">
          <h2>Матрицад нэмэх</h2>
          <p className="small muted">Олон албан тушаал, олон сургалтыг нэг дор сонгоод нэмнэ. Сонгосон албан тушаал бүрт сонгосон сургалт бүр оноогдоно.</p>
          <form action={addMatrixEntries} className="stack">
            <div className="grid2" style={{ alignItems: 'start' }}>
              <div className="fld"><span>Албан тушаал</span><CheckList name="positions" items={positions.map(p => ({ value: p.id, label: p.name, hint: [p.department, `${p.people} ажилтан`].filter(Boolean).join(' · ') }))} placeholder="Албан тушаал хайх…" /></div>
              <div className="fld"><span>Сургалт</span><CheckList name="courses" items={courses.map(c => ({ value: c.id, label: c.title, hint: CATEGORY_LABEL[c.category] }))} placeholder="Сургалт хайх…" /></div>
            </div>
            <div className="form">
              <label className="fld"><span>Давтамж</span><select name="recurrence" defaultValue="0">{OPTS.filter(([k]) => k !== '').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="fld"><span>Дуусгах хугацаа (албан тушаалд орсноос хойш, хоног)</span><input type="number" name="due_days" min={1} defaultValue={due} /></label>
              <div><Submit>Нэмэх</Submit></div>
            </div>
          </form>
        </section>
        {(() => {
          const q = (searchParams.q ?? '').trim().toLowerCase();
          const rows = cells.map(x => ({ ...x, p: positions.find(p => p.name === x.position), c: courses.find(c => c.id === x.course_id) }))
            .filter(x => x.c && (!searchParams.pos || x.position === searchParams.pos) && (!searchParams.course || x.course_id === searchParams.course)
              && (!q || `${x.position} ${x.p?.department ?? ''} ${x.c.title}`.toLowerCase().includes(q)))
            .sort((a, b) => a.position.localeCompare(b.position) || a.c.title.localeCompare(b.c.title));
          return <section className="panel">
            <div className="head"><h2>Матрицын мөрүүд ({rows.length})</h2>
              <form method="get" className="acts">
                <select name="pos" defaultValue={searchParams.pos ?? ''} style={{ width: 'auto' }}><option value="">Бүх албан тушаал</option>{positions.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select>
                <select name="course" defaultValue={searchParams.course ?? ''} style={{ width: 'auto' }}><option value="">Бүх сургалт</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
                <input type="search" name="q" defaultValue={searchParams.q ?? ''} placeholder="Хайх" style={{ width: 150 }} />
                <button className="btn sm ghost">Шүүх</button>
              </form></div>
            <div className="tablewrap"><table>
              <thead><tr><th>Албан тушаал</th><th>Сургалт</th><th>Давтамж</th><th className="r">Хугацаа</th><th className="r">Ажилтан</th><th></th></tr></thead>
              <tbody>{rows.map(x => (
                <tr key={x.id}>
                  <td><strong>{x.position}</strong><div className="small muted">{x.p?.department ?? '—'}</div></td>
                  <td>{x.c.title} <Chip label={CATEGORY_LABEL[x.c.category]} tone={CAT_TONE[x.c.category]} /></td>
                  <td className="small">{x.recurrence_months ? `${x.recurrence_months} сар тутам` : 'Нэг удаа'}</td>
                  <td className="r small">{x.due_days} хоног</td>
                  <td className="r num">{x.p?.people ?? 0}</td>
                  <td className="r"><form action={deleteMatrixEntry}><input type="hidden" name="id" value={x.id} /><Submit className="btn sm ghost" confirmText="Матрицаас хасах уу?">Хасах</Submit></form></td>
                </tr>))}
                {!rows.length && <tr><td colSpan={6} className="muted">Мөр алга. Дээрх хэсгээс нэмнэ үү.</td></tr>}
              </tbody>
            </table></div>
          </section>;
        })()}
      </> : <form action={saveMatrix} className="panel">
        <div className="head">
          <h2>Албан тушаал × сургалт</h2>
          <label className="fld" style={{ maxWidth: 260 }}><span>Дуусгах хугацаа (албан тушаалд орсноос хойш, хоног)</span><input type="number" name="due_days" min={1} defaultValue={due} /></label>
        </div>
        <div className="tablewrap"><table className="matrix">
          <thead><tr><th>Албан тушаал</th>{courses.map(c => <th key={c.id} className="mcol"><div>{c.title}</div><Chip label={CATEGORY_LABEL[c.category]} tone={CAT_TONE[c.category]} /></th>)}</tr></thead>
          <tbody>{positions.map(p => (
            <tr key={p.id}>
              <td><strong>{p.name}</strong><div className="small muted">{p.department ?? '—'} · {p.people} ажилтан</div></td>
              {courses.map(c => {
                const x = cell(p.name, c.id);
                const v = x ? String(x.recurrence_months ?? 0) : '';
                return <td key={c.id} className={`mcell ${x ? 'on' : ''}`}>
                  <select name={`m|${p.id}|${c.id}`} defaultValue={v} aria-label={`${p.name} — ${c.title}`}>{OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </td>;
              })}
            </tr>))}
            {!positions.length && <tr><td colSpan={courses.length + 1} className="muted">Албан тушаал нэмнэ үү.</td></tr>}
          </tbody>
        </table></div>
        <div className="acts" style={{ justifyContent: 'flex-start', marginTop: 16 }}><Submit>Матриц хадгалах</Submit>
          <span className="small muted">“—” = шаардлагагүй. Ажилтан заавал биш сургалтад ч өөрөө сууж болно.</span></div>
      </form>}
      <div className="grid2" style={{ alignItems: 'start' }}>
        <section className="panel">
          <h2>Албан тушаал нэмэх</h2>
          <form action={addPosition} className="form">
            <label className="fld"><span>Нэр</span><input type="text" name="name" required /></label>
            <label className="fld"><span>Хэлтэс</span><input type="text" name="department" list="mdepts" /></label>
            <div><Submit>Нэмэх</Submit></div>
          </form>
        </section>
        <section className="panel">
          <h2>Албан тушаалууд</h2>
          <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>{positions.map(p => (
            <div key={p.id} className="row"><div><strong>{p.name}</strong><div className="meta"><span>{p.department ?? '—'}</span><span>{p.people} ажилтан</span></div></div>
              {p.people === 0 && <form action={deletePosition}><input type="hidden" name="id" value={p.id} /><Submit className="btn sm danger" confirmText={`"${p.name}" устгах уу?`}>Устгах</Submit></form>}
            </div>))}</div>
        </section>
      </div>
    </>
  );
}
