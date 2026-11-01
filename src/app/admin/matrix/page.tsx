import Link from 'next/link';
import { all } from '@/lib/db';
import { Flash, Chip } from '@/components/ui';
import Submit from '@/components/Submit';
import { CATEGORY_LABEL, CAT_TONE, CATEGORIES } from '@/lib/progress';
import { addPosition, deletePosition, saveMatrix } from '@/app/actions/matrix';

const OPTS: [string, string][] = [['', '—'], ['0', 'Нэг удаа'], ['12', '12 сар тутам'], ['24', '24 сар тутам'], ['36', '36 сар тутам']];

export default async function Matrix(props: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const searchParams = await props.searchParams;
  const positions = await all<any>(`
    SELECT p.*, (SELECT count(*)::int FROM users u JOIN orgs o ON o.id=u.org_id WHERE u.position=p.name AND u.active AND o.is_internal) AS people
      FROM positions p ORDER BY p.department NULLS LAST, p.name`);
  const courses = await all<any>(`
    SELECT c.id, c.title, c.category FROM courses c
     WHERE c.audience='INTERNAL' AND EXISTS (SELECT 1 FROM course_versions v WHERE v.course_id=c.id AND v.status='PUBLISHED')
     ORDER BY array_position($1::text[], c.category), c.title`, [CATEGORIES]);
  const cells = await all<any>(`SELECT target_value AS position, course_id, recurrence_months, due_days FROM assignments WHERE source='MATRIX' AND target='POSITION'`);
  const cell = (pos: string, cid: string) => cells.find(c => c.position === pos && c.course_id === cid);
  const due = cells[0]?.due_days ?? 30;
  const depts = await all<{ department: string }>(`SELECT DISTINCT department FROM users WHERE department IS NOT NULL ORDER BY 1`);
  return (
    <>
      <datalist id="mdepts">{depts.map(d => <option key={d.department} value={d.department} />)}</datalist>
      <div className="head">
        <div><h1>Сургалтын матриц</h1>
          <p className="muted">Албан тушаал бүрийн заавал хамрагдах сургалт. Ажилтанд албан тушаал оноомогц эдгээр сургалт автоматаар оноогдож, мэдэгдэл очно. Хугацаа нь тухайн албан тушаалд орсон өдрөөс тоологдоно.</p></div>
        <Link className="btn ghost" href="/admin/compliance?aud=internal">Биелэлт харах</Link>
      </div>
      <Flash sp={searchParams} />
      <form action={saveMatrix} className="panel">
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
      </form>
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
