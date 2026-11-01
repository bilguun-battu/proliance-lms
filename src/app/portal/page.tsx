import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { learnerCourseIds, courseProgress, CATEGORY_LABEL, CAT_TONE } from '@/lib/progress';
import { CourseChip, Bar, Chip } from '@/components/ui';
import { complianceRows, COMP_LABEL, COMPLIANT_SET } from '@/lib/compliance';
import { fmtDate } from '@/lib/format';

export default async function MyCourses() {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const org = await one<any>('SELECT name FROM orgs WHERE id=$1', [u.orgId]);
  const ids = await learnerCourseIds(u.id);
  const courses = await all<any>(`
    SELECT c.id, c.title, c.description, c.category, string_agg(p.code, ', ') AS codes FROM courses c
      LEFT JOIN course_products cp ON cp.course_id=c.id LEFT JOIN products p ON p.id=cp.product_id
     WHERE c.id = ANY($1) GROUP BY c.id ORDER BY c.title`, [ids]);
  const comp = await complianceRows({ user: u.id });
  const items = await Promise.all(courses.map(async c => ({ c, p: (await courseProgress(u.id, c.id))!, m: comp.find(r => r.course_id === c.id) })));
  const rank = (x: typeof items[number]) => (x.m ? (COMPLIANT_SET.includes(x.m.status) ? 3 : 0) : x.p.left ? 1 : 4);
  items.sort((a, b) => rank(a) - rank(b) || (a.m?.due?.getTime() ?? 0) - (b.m?.due?.getTime() ?? 0) || b.p.left - a.p.left);
  const mand = comp.length, ok = comp.filter(r => COMPLIANT_SET.includes(r.status)).length, late = comp.filter(r => r.status === 'OVERDUE' || r.status === 'EXPIRED').length;
  return (
    <>
      <div className="head"><div><h1>Сайн байна уу, {u.name}</h1><p className="muted">{org?.name}</p></div></div>
      {mand > 0 && <div className={`notice ${late ? '' : 'soft'}`}>
        <strong>Заавал хамрагдах сургалт: {ok}/{mand} хүчинтэй</strong>
        <span className="small">{late ? `${late} сургалтын хугацаа хэтэрсэн байна. Аль болох хурдан дуусгана уу.` : ok === mand ? 'Бүх заавал хамрагдах сургалт тань хүчинтэй байна.' : 'Хугацаанаасаа өмнө дуусгана уу.'}</span>
      </div>}
      {(['mand', 'other'] as const).map(kind => {
        const list = items.filter(x => (kind === 'mand') === !!x.m);
        if (kind === 'mand' && !list.length) return null;
        return <section key={kind} style={{ marginBottom: 28 }}>
          <h2 style={{ marginBottom: 4 }}>{kind === 'mand' ? `Заавал хамрагдах сургалт (${list.length})` : `${mand ? 'Бусад сургалт' : 'Сургалт'} (${list.length})`}</h2>
          <p className="small muted" style={{ marginBottom: 12 }}>{kind === 'mand' ? 'Албан тушаал, хэлтэс эсвэл байгууллагын шаардлагаар оноогдсон.' : 'Заавал биш. Хүссэн үедээ өөрөө сонгож сууна.'}</p>
          {list.length ? <div className="list">{list.map(({ c, p, m }) => (
            <Link key={c.id} href={`/portal/courses/${c.id}`} className={`row ${p.left ? 'req' : ''}`} style={{ ['--c' as any]: p.key === 'update' ? 'var(--warn)' : 'var(--crit)' }}>
              <div><strong>{c.title}</strong>
                <div className="meta"><Chip label={CATEGORY_LABEL[c.category]} tone={CAT_TONE[c.category]} /><span className="num">{c.codes ? `${c.codes} · ` : ''}v{p.version.number}</span><span>{p.done}/{p.total} модуль</span>{p.left > 0 && <span>{p.left} модуль үзэх шаардлагатай</span>}</div>
                <div style={{ marginTop: 8 }}><Bar value={p.total ? p.done / p.total : 0} /></div>
              </div>
              <div className="acts" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                {m ? <><Chip label={COMP_LABEL[m.status][0]} tone={COMP_LABEL[m.status][1]} />
                  <span className="small muted num">{COMPLIANT_SET.includes(m.status) ? (m.validUntil ? `${fmtDate(m.validUntil)} хүртэл` : 'Дууссан') : `Хугацаа: ${fmtDate(m.due)}`}</span></>
                  : <CourseChip k={p.key} />}
              </div>
            </Link>))}</div>
            : <div className="list"><div className="empty">{kind === 'other' && items.length ? 'Бусад сургалт алга.' : 'Танай байгууллагад одоогоор сургалт нээгдээгүй байна.'}</div></div>}
        </section>;
      })}
    </>
  );
}
