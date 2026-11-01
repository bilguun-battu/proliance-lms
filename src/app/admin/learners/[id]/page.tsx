import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all, one } from '@/lib/db';
import { Flash } from '@/components/ui';
import Submit from '@/components/Submit';
import ProfileView from '@/components/ProfileView';
import { changePosition } from '@/app/actions/admin';

export default async function LearnerProfile(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const u = await one<any>('SELECT u.*, coalesce(o.is_internal,false) AS internal FROM users u LEFT JOIN orgs o ON o.id=u.org_id WHERE u.id=$1', [params.id]);
  if (!u) notFound();
  const positions = await all<any>('SELECT name, department FROM positions ORDER BY department NULLS LAST, name');
  const depts = await all<{ department: string }>('SELECT DISTINCT department FROM users WHERE department IS NOT NULL ORDER BY 1');
  return (
    <>
      <datalist id="ppos">{positions.map(p => <option key={p.name} value={p.name}>{p.department}</option>)}</datalist>
      <datalist id="pdepts">{depts.map(d => <option key={d.department} value={d.department} />)}</datalist>
      <div><Link className="link small" href={`/admin/learners${u.internal ? '?aud=internal' : ''}`}>← Хэрэглэгчид</Link></div>
      <div className="head"><div><h1>Сургалтын профайл</h1><p className="muted">{u.email}</p></div></div>
      <Flash sp={searchParams} />
      <details className="panel">
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Албан тушаал өөрчлөх</summary>
        <p className="small muted">Шинэ албан тушаалын заавал хамрагдах сургалтууд (сургалтын матрицаас) автоматаар оноогдож, хугацаа нь өнөөдрөөс тоологдоно. Өмнөх албан тушаалын түүх, гэрчилгээ хадгалагдана.</p>
        <form action={changePosition} className="form">
          <input type="hidden" name="id" value={u.id} />
          <label className="fld"><span>Албан тушаал</span><input type="text" name="position" list="ppos" defaultValue={u.position ?? ''} /></label>
          <label className="fld"><span>Хэлтэс</span><input type="text" name="department" list="pdepts" defaultValue={u.department ?? ''} /></label>
          <div><Submit confirmText="Албан тушаалыг өөрчлөх үү?">Хадгалах</Submit></div>
        </form>
      </details>
      <ProfileView userId={u.id} />
    </>
  );
}
