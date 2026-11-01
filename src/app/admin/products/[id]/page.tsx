import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all, one } from '@/lib/db';
import { linkProductCourses, unlinkProductCourse } from '@/app/actions/admin';
import { CATEGORY_LABEL, AUDIENCE_LABEL } from '@/lib/progress';
import { Flash, Chip } from '@/components/ui';
import Submit from '@/components/Submit';

// Бүтээгдэхүүн / тоног төхөөрөмжийн хуудас: холбогдох сургалтуудыг эндээс нэмж, оноох
export default async function Product(props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const p = await one<any>('SELECT * FROM products WHERE id=$1', [id]);
  if (!p) notFound();
  const linked = await all<any>(`
    SELECT c.id, c.title, c.audience, c.category,
           EXISTS (SELECT 1 FROM course_versions v WHERE v.course_id=c.id AND v.status='PUBLISHED') AS published,
           (SELECT count(*)::int FROM assignments a JOIN org_products op ON op.org_id::text=a.target_value AND op.product_id=$1
             WHERE a.course_id=c.id AND a.target='ORG') AS assigned
      FROM course_products cp JOIN courses c ON c.id=cp.course_id WHERE cp.product_id=$1 ORDER BY c.audience, c.title`, [id]);
  const others = await all<any>(`SELECT id, title, audience, category FROM courses c
     WHERE NOT EXISTS (SELECT 1 FROM course_products cp WHERE cp.course_id=c.id AND cp.product_id=$1) ORDER BY audience, title`, [id]);
  const orgs = await all<any>(`SELECT o.id, o.name FROM org_products op JOIN orgs o ON o.id=op.org_id WHERE op.product_id=$1 ORDER BY o.name`, [id]);
  return (
    <>
      <div><Link className="link small" href="/admin/products">← Бүтээгдэхүүн</Link></div>
      <div className="head"><div><h1><span className="num">{p.code}</span> · {p.name}</h1><p className="muted">{p.category} · {linked.length} сургалт · {orgs.length} байгууллага</p></div></div>
      <Flash sp={sp} />
      <section className="panel">
        <h2>Холбогдох сургалт ({linked.length})</h2>
        <p className="small muted">Харилцагчийн сургалт энэ бүтээгдэхүүнийг худалдаж авсан байгууллагын ажилтнуудад нээгдэнэ. Дотоод сургалт тухайн тоног төхөөрөмжтэй ажилладаг Proliance-ийн ажилтнуудад зориулагдана.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Сургалт</th><th>Хэнд</th><th>Төрөл</th><th className="r">Заавал оноосон байгууллага</th><th></th></tr></thead>
          <tbody>{linked.map(c => (
            <tr key={c.id}>
              <td><Link className="link" href={`/admin/courses/${c.id}`}>{c.title}</Link>{!c.published && <> <Chip label="Ноорог" tone="neutral" /></>}</td>
              <td className="small">{AUDIENCE_LABEL[c.audience]}</td><td className="small">{CATEGORY_LABEL[c.category]}</td>
              <td className="r num">{c.audience === 'CUSTOMER' ? `${c.assigned}/${orgs.length}` : '—'}</td>
              <td className="r"><form action={unlinkProductCourse}><input type="hidden" name="product_id" value={id} /><input type="hidden" name="course_id" value={c.id} />
                <Submit className="btn sm ghost" confirmText="Сургалтыг энэ бүтээгдэхүүнээс хасах уу?">Хасах</Submit></form></td>
            </tr>))}
            {!linked.length && <tr><td colSpan={5} className="muted">Холбогдсон сургалт алга.</td></tr>}
          </tbody>
        </table></div>
      </section>
      <section className="panel">
        <h2>Сургалт нэмэх</h2>
        {others.length ? <form action={linkProductCourses} className="stack">
          <input type="hidden" name="product_id" value={id} /><input type="hidden" name="code" value={p.code} />
          {(['CUSTOMER', 'INTERNAL'] as const).map(a => {
            const list = others.filter(c => c.audience === a);
            return list.length > 0 && <div key={a} className="fld"><span className="fmt">{AUDIENCE_LABEL[a]}</span>
              <div className="checks col">{list.map(c => <label key={c.id}><input type="checkbox" name="courses" value={c.id} /> {c.title} <span className="small muted">· {CATEGORY_LABEL[c.category]}</span></label>)}</div></div>;
          })}
          <div className="notice soft">
            <label className="checks"><label><input type="checkbox" name="mandatory" /> <strong>Энэ бүтээгдэхүүнтэй байгууллагуудад заавал хамрагдах сургалтаар оноох</strong></label></label>
            <span className="small muted">Сонгосон харилцагчийн сургалтыг {orgs.length ? orgs.map(o => o.name).join(', ') : 'энэ бүтээгдэхүүнтэй байгууллага (одоогоор алга)'} байгууллагын бүх ажилтанд ононо.</span>
            <div className="form">
              <label className="fld"><span>Дуусгах хугацаа (хоног)</span><input type="number" name="due_days" defaultValue={30} min={1} /></label>
              <label className="fld"><span>Давтан суух (сар, заавал биш)</span><input type="number" name="recurrence_months" min={1} placeholder="Жишээ нь 12" /></label>
            </div>
          </div>
          <div><Submit>Нэмэх</Submit></div>
        </form> : <p className="muted">Бүх сургалт энэ бүтээгдэхүүнтэй холбогдсон байна.</p>}
      </section>
      <section className="panel">
        <h2>Энэ бүтээгдэхүүнтэй байгууллага ({orgs.length})</h2>
        {orgs.length ? <div className="acts" style={{ justifyContent: 'flex-start' }}>{orgs.map(o => <span key={o.id} className="chip">{o.name}</span>)}</div>
          : <p className="muted">Одоогоор байгууллагад нэмэгдээгүй.</p>}
      </section>
    </>
  );
}
