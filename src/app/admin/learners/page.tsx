import Link from 'next/link';
import { all } from '@/lib/db';
import { createUser, updateUser, toggleUser, resendInvite, importLearners } from '@/app/actions/admin';
import { Flash, Chip } from '@/components/ui';
import { ROLE_LABEL, fmtDate } from '@/lib/format';
import Submit from '@/components/Submit';

export default async function Learners({ searchParams }: { searchParams: { ok?: string; err?: string; org?: string; aud?: string } }) {
  const aud = searchParams.aud === 'internal' ? 'internal' : searchParams.aud === 'customer' ? 'customer' : undefined;
  const orgs = await all<any>('SELECT id, name FROM orgs ORDER BY name');
  const users = await all<any>(`
    SELECT u.*, o.name AS org, (u.password_hash IS NOT NULL) AS activated FROM users u LEFT JOIN orgs o ON o.id=u.org_id
     WHERE ($1::uuid IS NULL OR u.org_id=$1) AND ($2::text IS NULL OR ($2='internal' AND (o.is_internal OR u.role='ADMIN')) OR ($2='customer' AND NOT coalesce(o.is_internal,true)))
     ORDER BY u.role, o.name NULLS FIRST, u.name`, [searchParams.org || null, aud ?? null]);
  const depts = await all<{ department: string }>('SELECT DISTINCT department FROM users WHERE department IS NOT NULL ORDER BY 1');
  const positions = await all<{ name: string }>('SELECT name FROM positions ORDER BY name');
  const orgSelect = (v?: string) => (
    <select name="org_id" defaultValue={v ?? ''}><option value="">— Proliance (админ) —</option>{orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
  );
  const roleSelect = (v = 'LEARNER') => (
    <select name="role" defaultValue={v}>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
  );
  return (
    <>
      <datalist id="lpos">{positions.map(p => <option key={p.name} value={p.name} />)}</datalist>
      <datalist id="depts">{depts.map(d => <option key={d.department} value={d.department} />)}</datalist>
      <div className="head"><div><h1>Хэрэглэгч</h1><p className="muted">Нэмэгдсэн хүнд нууц үг тохируулах урилга имэйлээр очно.</p></div></div>
      <Flash sp={searchParams} />
      <div className="grid2">
        <section className="panel">
          <h2>Хэрэглэгч нэмэх</h2>
          <form action={createUser} className="form">
            <label className="fld"><span>Нэр</span><input type="text" name="name" required /></label>
            <label className="fld"><span>Албан тушаал</span><input type="text" name="position" list="lpos" /></label>
            <label className="fld"><span>Имэйл</span><input type="email" name="email" required /></label>
            <label className="fld"><span>Утас (SMS)</span><input type="tel" name="phone" /></label>
            <label className="fld"><span>Хэлтэс (дотоод ажилтанд)</span><input type="text" name="department" list="depts" /></label>
            <label className="fld"><span>Байгууллага</span>{orgSelect(searchParams.org)}</label>
            <label className="fld"><span>Эрх</span>{roleSelect()}</label>
            <div><Submit>Нэмж, урилга илгээх</Submit></div>
          </form>
        </section>
        <section className="panel">
          <h2>Excel-ээс олноор оруулах</h2>
          <p className="small muted">Эхний мөр гарчиг. Багана: Нэр, Албан тушаал, Имэйл, Утас, Байгууллага, Хэлтэс. Байгууллагын нэр системд бүртгэлтэйтэй яг таарах ёстой. Proliance ажилтныг дотоод байгууллагын нэрээр оруулна.</p>
          <a className="link small" href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api/import-template`}>Загвар файл татах</a>
          <form action={importLearners} className="stack">
            <input type="file" name="file" accept=".xlsx" required />
            <div><Submit>Оруулах</Submit></div>
          </form>
        </section>
      </div>
      <section className="panel">
        <div className="head">
          <h2>{searchParams.org ? orgs.find(o => o.id === searchParams.org)?.name : 'Бүх хэрэглэгч'} ({users.length})</h2>
          <div className="acts">
            {[['', 'Бүгд'], ['internal', 'Proliance ажилтан'], ['customer', 'Харилцагч']].map(([v, l]) => <Link key={v} className={`btn sm ${(aud ?? '') === v && !searchParams.org ? '' : 'ghost'}`} href={v ? `/admin/learners?aud=${v}` : '/admin/learners'}>{l}</Link>)}
          </div>
        </div>
        <div className="tablewrap"><table>
          <thead><tr><th>Нэр</th><th>Байгууллага</th><th>Холбоо барих</th><th>Төлөв</th><th></th></tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id}>
              <td><strong>{u.role === 'ADMIN' ? u.name : <Link className="link" href={`/admin/learners/${u.id}`}>{u.name}</Link>}</strong><div className="small muted">{ROLE_LABEL[u.role]}{u.position ? ` · ${u.position}` : ''}</div></td>
              <td>{u.org ?? <span className="muted">Proliance</span>}{u.department && <div className="small muted">{u.department}</div>}</td>
              <td className="small">{u.email}<div className="muted">{u.phone}</div></td>
              <td>{!u.active ? <Chip label="Идэвхгүй" /> : u.activated ? <Chip label="Идэвхтэй" tone="ok" /> : <Chip label="Урилга хүлээж буй" tone="warn" />}
                <div className="small muted">{fmtDate(u.created_at)}</div></td>
              <td>
                <details><summary className="small muted" style={{ cursor: 'pointer' }}>Засах</summary>
                  <form action={updateUser} className="stack" style={{ minWidth: 240, marginTop: 8 }}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="text" name="name" defaultValue={u.name} required aria-label="Нэр" />
                    <input type="text" name="position" defaultValue={u.position ?? ''} placeholder="Албан тушаал" list="lpos" />
                    <input type="tel" name="phone" defaultValue={u.phone ?? ''} placeholder="Утас" />
                    <input type="text" name="department" defaultValue={u.department ?? ''} placeholder="Хэлтэс" list="depts" />
                    {orgSelect(u.org_id ?? '')}
                    {roleSelect(u.role)}
                    <Submit className="btn sm">Хадгалах</Submit>
                  </form>
                  <div className="acts" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                    {!u.activated && <form action={resendInvite}><input type="hidden" name="id" value={u.id} /><Submit className="btn sm ghost">Урилга дахин илгээх</Submit></form>}
                    <form action={toggleUser}><input type="hidden" name="id" value={u.id} /><Submit className="btn sm danger">{u.active ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}</Submit></form>
                  </div>
                </details>
              </td>
            </tr>))}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
