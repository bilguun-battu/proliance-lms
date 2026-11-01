import { all } from '@/lib/db';
import { saveProduct, deleteProduct } from '@/app/actions/admin';
import { CATEGORIES } from '@/lib/format';
import { Flash } from '@/components/ui';
import Submit from '@/components/Submit';

export default async function Products(props: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const searchParams = await props.searchParams;
  const rows = await all<any>(`
    SELECT p.*, (SELECT count(*)::int FROM course_products cp WHERE cp.product_id=p.id) AS courses,
                (SELECT count(*)::int FROM org_products op WHERE op.product_id=p.id) AS orgs
      FROM products p ORDER BY p.category, p.code`);
  const catSelect = (v?: string) => (
    <select name="category" defaultValue={v ?? CATEGORIES[0]}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
  );
  return (
    <>
      <div className="head"><div><h1>Бүтээгдэхүүн</h1><p className="muted">Тоног төхөөрөмж, бараа бүтээгдэхүүн. Сургалт ба харилцагчийг эдгээрээр холбоно.</p></div></div>
      <Flash sp={searchParams} />
      <section className="panel">
        <h2>Бүтээгдэхүүн нэмэх</h2>
        <form action={saveProduct} className="form">
          <label className="fld"><span>Код / загвар</span><input type="text" name="code" required /></label>
          <label className="fld"><span>Нэр</span><input type="text" name="name" required /></label>
          <label className="fld"><span>Ангилал</span>{catSelect()}</label>
          <div><Submit>Нэмэх</Submit></div>
        </form>
      </section>
      <section className="panel">
        <div className="tablewrap"><table>
          <thead><tr><th>Код</th><th>Нэр</th><th>Ангилал</th><th className="r">Сургалт</th><th className="r">Байгууллага</th><th></th></tr></thead>
          <tbody>{rows.map(p => (
            <tr key={p.id}>
              <td className="num"><strong>{p.code}</strong></td><td>{p.name}</td><td className="muted">{p.category}</td>
              <td className="r">{p.courses}</td><td className="r">{p.orgs}</td>
              <td>
                <details><summary className="small muted" style={{ cursor: 'pointer' }}>Засах</summary>
                  <form action={saveProduct} className="stack" style={{ minWidth: 240, marginTop: 8 }}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="text" name="code" defaultValue={p.code} required aria-label="Код" />
                    <input type="text" name="name" defaultValue={p.name} required aria-label="Нэр" />
                    {catSelect(p.category)}
                    <Submit className="btn sm">Хадгалах</Submit>
                  </form>
                  <form action={deleteProduct} style={{ marginTop: 8 }}>
                    <input type="hidden" name="id" value={p.id} />
                    <Submit className="btn sm danger" confirmText="Бүтээгдэхүүнийг устгах уу? Холбоотой сургалт, байгууллагаас хасагдана.">Устгах</Submit>
                  </form>
                </details>
              </td>
            </tr>))}
            {!rows.length && <tr><td colSpan={6} className="muted">Бүтээгдэхүүн бүртгэгдээгүй байна.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
