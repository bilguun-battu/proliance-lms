import Link from 'next/link';
import { requireUser, PORTAL_ROLES } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { learnerCourseIds, courseProgress, CATEGORY_LABEL, CAT_TONE, REQUIRED } from '@/lib/progress';
import { complianceRows, COMP_LABEL, COMPLIANT_SET } from '@/lib/compliance';
import { fmtDate, fmtDuration } from '@/lib/format';
import CourseCover from '@/components/CourseCover';

export default async function MyCourses(props: { searchParams: Promise<{ f?: string }> }) {
  const sp = await props.searchParams;
  const u = await requireUser(...PORTAL_ROLES);
  const org = await one<any>('SELECT name FROM orgs WHERE id=$1', [u.orgId]);
  const ids = await learnerCourseIds(u.id);
  const courses = await all<any>(`
    SELECT c.id, c.title, c.description, c.category, c.cover_file, string_agg(p.code, ', ') AS codes FROM courses c
      LEFT JOIN course_products cp ON cp.course_id=c.id LEFT JOIN products p ON p.id=cp.product_id
     WHERE c.id = ANY($1) GROUP BY c.id ORDER BY c.title`, [ids]);
  const comp = await complianceRows({ user: u.id });
  const items = await Promise.all(courses.map(async c => ({ c, p: (await courseProgress(u.id, c.id))!, m: comp.find(r => r.course_id === c.id) })));
  const rank = (x: typeof items[number]) => (x.m ? (COMPLIANT_SET.includes(x.m.status) ? 3 : 0) : x.p.left ? 1 : 4);
  items.sort((a, b) => rank(a) - rank(b) || (a.m?.due?.getTime() ?? 0) - (b.m?.due?.getTime() ?? 0) || b.p.left - a.p.left);
  const mand = comp.length, ok = comp.filter(r => COMPLIANT_SET.includes(r.status)).length, late = comp.filter(r => r.status === 'OVERDUE' || r.status === 'EXPIRED').length;
  const filters = [
    ['', 'Бүгд', items.length], ['todo', 'Үзэх шаардлагатай', items.filter(x => x.p.left > 0).length], ['done', 'Дууссан', items.filter(x => x.p.left === 0).length],
  ] as const;
  const shown = items.filter(x => sp.f === 'todo' ? x.p.left > 0 : sp.f === 'done' ? x.p.left === 0 : true);
  const first = shown.find(x => x.p.left > 0 && x.p.started);
  return (
    <>
      <div className="hello">
        <h1>Сайн байна уу, {u.name.split(' ').pop()} 👋</h1>
        <p className="muted">{org?.name ? `${org.name} · ` : ''}{items.length} сургалт танд нээлттэй{mand ? ` · заавал хамрагдах ${ok}/${mand} хүчинтэй` : ''}</p>
      </div>
      {late > 0 && <div className="notice"><strong>{late} заавал хамрагдах сургалтын хугацаа хэтэрсэн байна</strong><span className="small">Аль болох хурдан дуусгана уу.</span></div>}
      {first && <Link className="resume" href={nextHref(first.c.id, first.p)}>
        <span className="resume-l">Үргэлжлүүлэх</span>
        <strong>{first.c.title}</strong>
        <span className="small muted">{first.p.done}/{first.p.total} модуль дууссан</span>
        <span className="resume-go" aria-hidden="true">▶</span>
      </Link>}
      <div className="chipnav">{filters.map(([k, l, n]) => <Link key={k} href={k ? `/portal?f=${k}` : '/portal'} className={(sp.f ?? '') === k ? 'on' : ''}>{l} <span className="num">{n}</span></Link>)}</div>
      {(['mand', 'other'] as const).map(kind => {
        const list = shown.filter(x => (kind === 'mand') === !!x.m);
        if (!list.length && (kind === 'mand' || shown.length)) return null;
        return <section key={kind} className="stack">
          {mand > 0 && <div><h2>{kind === 'mand' ? 'Заавал хамрагдах сургалт' : 'Бусад сургалт'}</h2>
            <p className="small muted" style={{ margin: '2px 0 0' }}>{kind === 'mand' ? 'Албан тушаал, хэлтэс эсвэл байгууллагын шаардлагаар оноогдсон.' : 'Заавал биш. Хүссэн үедээ өөрөө сонгож сууна.'}</p></div>}
          {list.length ? <div className="cards">{list.map(({ c, p, m }) => {
            const done = p.left === 0;
            const badge = m ? COMP_LABEL[m.status] : p.key === 'update' ? ['Шинэ хувилбар', 'warn'] : done ? ['Дууссан', 'ok'] : null;
            const mins = p.modules.reduce((t, x) => t + (x.duration_min || 0), 0);
            const btn = done ? 'Дахин үзэх' : p.key === 'update' ? 'Шинэчлэлт үзэх' : p.started ? 'Үргэлжлүүлэх' : 'Эхлэх';
            return (
              <article key={c.id} className={`ccard ${done ? 'is-done' : ''}`}>
                <Link href={`/portal/courses/${c.id}`} className="ccard-img" tabIndex={-1}>
                  <CourseCover title={c.title} category={c.category} cover={c.cover_file} codes={c.codes} />
                  {badge && <span className={`cbadge t-${badge[1]}`}>{badge[1] === 'ok' ? '✓ ' : ''}{badge[0]}</span>}
                </Link>
                <div className="ccard-body">
                  <span className={`ccat t-${CAT_TONE[c.category]}`}>{CATEGORY_LABEL[c.category]}</span>
                  <h3><Link href={`/portal/courses/${c.id}`}>{c.title}</Link></h3>
                  {c.description && <p className="ccard-desc">{c.description}</p>}
                  <div className="ccard-meta"><span>📚 {p.total} модуль</span>{mins > 0 && <span>⏱ {fmtDuration(mins)}</span>}{c.codes && <span className="num">{c.codes}</span>}</div>
                  <div className="ccard-prog"><div className="bar" style={{ maxWidth: 'none' }}><span style={{ width: `${p.total ? Math.round((p.done / p.total) * 100) : 0}%` }} /></div>
                    <span className="small muted num">{p.done}/{p.total}</span></div>
                  {m && <p className="small muted" style={{ margin: 0 }}>{COMPLIANT_SET.includes(m.status) ? (m.validUntil ? `${fmtDate(m.validUntil)} хүртэл хүчинтэй` : 'Дууссан') : `Эцсийн хугацаа: ${fmtDate(m.due)}`}</p>}
                  <Link className={`btn cbtn ${done ? 'ok' : ''}`} href={done ? `/portal/courses/${c.id}` : nextHref(c.id, p)}>{done ? '✓' : '▶'} {btn}</Link>
                </div>
              </article>);
          })}</div>
            : <div className="list"><div className="empty">{items.length ? 'Энэ шүүлтүүрт тохирох сургалт алга.' : 'Танай байгууллагад одоогоор сургалт нээгдээгүй байна.'}</div></div>}
        </section>;
      })}
    </>
  );
}

// Үзэх шаардлагатай эхний нээлттэй модуль руу шууд оруулна
function nextHref(courseId: string, p: { modules: { module_key: string; state: string; unlocked: boolean }[] }) {
  const m = p.modules.find(x => REQUIRED.includes(x.state as any) && x.unlocked);
  return m ? `/portal/courses/${courseId}/m/${m.module_key}` : `/portal/courses/${courseId}`;
}
