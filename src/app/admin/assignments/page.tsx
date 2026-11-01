import Link from 'next/link';
import { all } from '@/lib/db';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { createAssignment, deleteAssignment } from '@/app/actions/admin';
import { TARGET_LABEL } from '@/lib/assign';
import { Flash } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import Submit from '@/components/Submit';
import TargetPicker from './TargetPicker';
import AudTabs, { audOf, AUD_DB } from '@/components/AudTabs';

// Заавал хамрагдах сургалтыг оноох (тайлангаас тусдаа)
export default async function Assignments(props: { searchParams: Promise<{ ok?: string; err?: string; aud?: string; course?: string; q?: string }> }) {
  const sp = await props.searchParams;
  const me = await requireUser(...STAFF_ROLES);
  const ta = me.role === 'TRAINING_ADMIN';
  const aud = ta ? 'customer' : audOf(sp.aud ?? 'internal');
  const A = AUD_DB(aud);
  const courses = await all<any>(`SELECT c.id, c.title, c.category FROM courses c WHERE c.audience=$1 AND EXISTS (SELECT 1 FROM course_versions v WHERE v.course_id=c.id AND v.status='PUBLISHED') ORDER BY c.category, c.title`, [A]);
  const depts = (await all<any>(`SELECT DISTINCT department FROM users WHERE department IS NOT NULL ORDER BY 1`)).map(d => d.department);
  const positions = (await all<any>(`SELECT DISTINCT position FROM users WHERE position IS NOT NULL ORDER BY 1`)).map(d => d.position);
  const orgs = await all<any>(`SELECT id, name FROM orgs WHERE NOT is_internal ORDER BY name`);
  const users = await all<any>(`SELECT u.id, u.name FROM users u LEFT JOIN orgs o ON o.id=u.org_id WHERE u.role <> 'ADMIN' AND u.active AND coalesce(o.is_internal,false)=$1 ORDER BY u.name`, [aud === 'internal']);
  const valueLabel = (a: any) => a.target === 'ORG' ? orgs.find(o => o.id === a.target_value)?.name : a.target === 'USER' ? users.find(u => u.id === a.target_value)?.name : a.target_value;
  const q = (sp.q ?? '').trim().toLowerCase();
  const assigns = (await all<any>(`SELECT a.*, c.title FROM assignments a JOIN courses c ON c.id=a.course_id WHERE c.audience=$1 AND ($2::uuid IS NULL OR c.id=$2) ORDER BY c.title, a.created_at`, [A, sp.course || null]))
    .filter(a => !q || `${a.title} ${valueLabel(a) ?? ''} ${TARGET_LABEL[a.target]}`.toLowerCase().includes(q));
  return (
    <>
      <div className="head">
        <div><h1>Заавал сургалт оноох</h1><p className="muted">Сургалтыг {aud === 'internal' ? 'бүх ажилтан, хэлтэс, албан тушаал эсвэл хүнд' : 'хамтрагч байгууллага эсвэл тухайн хүнд'} заавал хамрагдах сургалтаар ононо. Биелэлтийг <Link className="link" href={`/admin/compliance?aud=${aud}`}>тайлан</Link> хэсгээс харна.</p></div>
      </div>
      {!ta && <AudTabs base="/admin/assignments" cur={aud} />}
      <Flash sp={sp} />
      <section className="panel">
        <h2>Шинэ оноолт</h2>
        {courses.length ? <form action={createAssignment} className="form">
          <label className="fld"><span>Сургалт</span><select name="course_id" required>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
          <TargetPicker aud={aud} depts={depts} positions={positions} orgs={orgs} users={users} />
          <label className="fld"><span>Дуусгах хугацаа (хоног)</span><input type="number" name="due_days" defaultValue={30} min={1} /></label>
          <label className="fld"><span>Эсвэл тогтмол огноо</span><input type="date" name="due_date" /></label>
          <label className="fld"><span>Давтан суух</span><select name="recurrence_months" defaultValue=""><option value="">Нэг удаа</option><option value="6">6 сар тутам</option><option value="12">Жил бүр</option><option value="24">2 жил тутам</option><option value="36">3 жил тутам</option></select></label>
          <label className="fld"><span>Тайлбар</span><input type="text" name="note" placeholder="Ж: ХАБ-ын журмын дагуу" /></label>
          <div><Submit>Оноох</Submit></div>
        </form> : <p className="muted">Нийтлэгдсэн {aud === 'internal' ? 'дотоод' : 'харилцагчийн'} сургалт алга.</p>}
        <p className="small muted">Хугацааг оноосон өдрөөс эсвэл ажилд шинээр орсон бол бүртгэгдсэн өдрөөс тоолно. Давтан суух сургалтын гүйцэтгэл хугацаа нь дуусахад хүчингүй болж, дахин суух шаардлагатай болно.</p>
      </section>
      <section className="panel">
        <div className="head"><h2>Одоогийн оноолт ({assigns.length})</h2>
          <form method="get" className="acts">
            <input type="hidden" name="aud" value={aud} />
            <select name="course" defaultValue={sp.course ?? ''} style={{ width: 'auto' }}><option value="">Бүх сургалт</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
            <input type="search" name="q" defaultValue={sp.q ?? ''} placeholder="Хайх" style={{ width: 160 }} />
            <button className="btn sm ghost">Шүүх</button>
          </form></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Сургалт</th><th>Хэнд</th><th>Хугацаа</th><th>Давтамж</th><th></th></tr></thead>
          <tbody>{assigns.map(a => (
            <tr key={a.id}>
              <td>{a.title}{a.note && <div className="small muted">{a.note}</div>}</td>
              <td>{TARGET_LABEL[a.target]}{a.target_value && <div className="small muted">{valueLabel(a)}</div>}</td>
              <td className="small">{a.due_date ? fmtDate(a.due_date) : `${a.due_days} хоногт`}</td>
              <td className="small">{a.recurrence_months ? `${a.recurrence_months} сар тутам` : 'Нэг удаа'}</td>
              <td>{a.source === 'MATRIX' ? <Link className="btn sm ghost" href="/admin/matrix">Матрицаас засах</Link> : <form action={deleteAssignment}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="aud" value={aud} /><Submit className="btn sm danger" confirmText="Оноолтыг устгах уу?">Устгах</Submit></form>}</td>
            </tr>))}
            {!assigns.length && <tr><td colSpan={5} className="muted">Оноолт алга.</td></tr>}</tbody>
        </table></div>
      </section>
    </>
  );
}
