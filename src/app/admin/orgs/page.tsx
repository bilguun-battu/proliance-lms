import Link from 'next/link';
import { all } from '@/lib/db';
import { saveOrg, deleteOrg } from '@/app/actions/admin';
import { Flash } from '@/components/ui';
import Submit from '@/components/Submit';

export default async function Orgs({ searchParams }: { searchParams: { ok?: string; err?: string } }) {
  const products = await all<any>('SELECT id, code, name FROM products ORDER BY code');
  const orgs = await all<any>(`
    SELECT o.*, coalesce(array_agg(op.product_id) FILTER (WHERE op.product_id IS NOT NULL), '{}') AS products,
           (SELECT count(*)::int FROM users u WHERE u.org_id=o.id) AS people
      FROM orgs o LEFT JOIN org_products op ON op.org_id=o.id GROUP BY o.id ORDER BY o.is_internal DESC, o.name`);
  const productChecks = (selected: string[]) => (
    <div className="checks">{products.map(p => (
      <label key={p.id}><input type="checkbox" name="products" value={p.id} defaultChecked={selected.includes(p.id)} /> <span className="num">{p.code}</span></label>
    ))}</div>
  );
  return (
    <>
      <div className="head"><div><h1>Байгууллага</h1><p className="muted">Харилцагч байгууллага болон тэдний худалдаж авсан бүтээгдэхүүн. Бүтээгдэхүүн нэмэхэд холбогдох сургалт ажилтнуудад автоматаар нээгдэнэ.</p></div></div>
      <Flash sp={searchParams} />
      <section className="panel">
        <h2>Байгууллага нэмэх</h2>
        <form action={saveOrg} className="stack">
          <div className="form">
            <label className="fld"><span>Нэр</span><input type="text" name="name" required /></label>
            <label className="fld"><span>Холбоо барих хүн</span><input type="text" name="contact_name" /></label>
            <label className="fld"><span>Утас</span><input type="tel" name="phone" /></label>
          </div>
          <label className="checks"><label><input type="checkbox" name="is_internal" /> Proliance дотоод (өөрийн ажилтнууд)</label></label>
          <div className="fld"><span className="fmt">Худалдаж авсан бүтээгдэхүүн</span>{productChecks([])}</div>
          <div><Submit>Нэмэх</Submit></div>
        </form>
      </section>
      <div className="list">
        {orgs.map(o => (
          <details key={o.id} className="row" style={{ display: 'block' }}>
            <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
              <strong>{o.name}</strong> {o.is_internal && <span className="chip c-brand">Дотоод</span>}
              <div className="meta">
                <span>{o.people} хэрэглэгч</span>
                <span>{o.products.length} бүтээгдэхүүн</span>
                {o.contact_name && <span>{o.contact_name} {o.phone}</span>}
                <Link className="link" href={`/admin/learners?org=${o.id}`}>Ажилтнууд</Link>
              </div>
            </summary>
            <form action={saveOrg} className="stack" style={{ marginTop: 14 }}>
              <input type="hidden" name="id" value={o.id} />
              <div className="form">
                <label className="fld"><span>Нэр</span><input type="text" name="name" defaultValue={o.name} required /></label>
                <label className="fld"><span>Холбоо барих хүн</span><input type="text" name="contact_name" defaultValue={o.contact_name ?? ''} /></label>
                <label className="fld"><span>Утас</span><input type="tel" name="phone" defaultValue={o.phone ?? ''} /></label>
              </div>
              <label className="checks"><label><input type="checkbox" name="is_internal" defaultChecked={o.is_internal} /> Proliance дотоод (өөрийн ажилтнууд)</label></label>
              <div className="fld"><span className="fmt">Худалдаж авсан бүтээгдэхүүн</span>{productChecks(o.products)}</div>
              <div className="acts" style={{ justifyContent: 'flex-start' }}><Submit className="btn sm">Хадгалах</Submit></div>
            </form>
            <form action={deleteOrg} style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={o.id} />
              <Submit className="btn sm danger" confirmText="Байгууллагыг устгах уу?">Устгах</Submit>
            </form>
          </details>
        ))}
        {!orgs.length && <div className="empty">Байгууллага бүртгэгдээгүй байна.</div>}
      </div>
    </>
  );
}
