import Link from 'next/link';
import { all } from '@/lib/db';
import { Flash, Chip } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { CATEGORY_LABEL, CAT_TONE, CATEGORIES } from '@/lib/progress';
import AudTabs, { audOf, AUD_DB } from '@/components/AudTabs';


export default async function Courses({ searchParams }: { searchParams: { ok?: string; err?: string; aud?: string; cat?: string } }) {
  const aud = audOf(searchParams.aud);
  const counts = Object.fromEntries((await all<any>(`SELECT audience, count(*)::int AS n FROM courses GROUP BY 1`)).map(r => [r.audience === 'INTERNAL' ? 'internal' : 'customer', r.n]));
  const rows = await all<any>(`
    SELECT c.id, c.title, c.category,
      (SELECT number FROM course_versions v WHERE v.course_id=c.id AND v.status='PUBLISHED' ORDER BY number DESC LIMIT 1) AS ver,
      (SELECT published_at FROM course_versions v WHERE v.course_id=c.id AND v.status='PUBLISHED' ORDER BY number DESC LIMIT 1) AS pub,
      EXISTS (SELECT 1 FROM course_versions v WHERE v.course_id=c.id AND v.status='DRAFT') AS has_draft,
      (SELECT string_agg(p.code, ', ') FROM course_products cp JOIN products p ON p.id=cp.product_id WHERE cp.course_id=c.id) AS products,
      (SELECT count(*)::int FROM trainer_quals q WHERE q.course_id=c.id) AS trainers
    FROM courses c WHERE c.audience=$1 ORDER BY array_position($2::text[], c.category), c.title`, [AUD_DB(aud), CATEGORIES]);
  const cats = CATEGORIES.map(k => [k, rows.filter(r => r.category === k).length] as const).filter(([, n]) => n > 0);
  const shown = searchParams.cat ? rows.filter(r => r.category === searchParams.cat) : rows;
  return (
    <>
      <div className="head">
        <div><h1>Сургалт</h1><p className="muted">{aud === 'internal' ? 'Proliance-ийн ажилтнуудын дотоод сургалт. Харилцагчдад харагдахгүй.' : 'Харилцагч байгууллагын ажилтнуудад бүтээгдэхүүнээр нээгдэх сургалт. Дотоод ажилтнуудад харагдахгүй.'}</p></div>
        <Link className="btn" href={`/admin/courses/new?aud=${aud}`}>+ Шинэ сургалт</Link>
      </div>
      <AudTabs base="/admin/courses" cur={aud} counts={counts} />
      <Flash sp={searchParams} />
      <div className="acts" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
        <Link className={`btn sm ${searchParams.cat ? 'ghost' : ''}`} href={`/admin/courses?aud=${aud}`}>Бүх төрөл ({rows.length})</Link>
        {cats.map(([k, n]) => <Link key={k} className={`btn sm ${searchParams.cat === k ? '' : 'ghost'}`} href={`/admin/courses?aud=${aud}&cat=${k}`}>{CATEGORY_LABEL[k]} ({n})</Link>)}
      </div>
      <div className="list">
        {shown.map(c => (
          <Link key={c.id} href={`/admin/courses/${c.id}`} className="row">
            <div><strong>{c.title}</strong>
              <div className="meta">
                <Chip label={CATEGORY_LABEL[c.category]} tone={CAT_TONE[c.category]} />
                {aud === 'customer' && <span className="num">{c.products || 'Бүтээгдэхүүн холбоогүй'}</span>}
                {c.trainers > 0 && <span>{c.trainers} сургагч</span>}
                {c.has_draft && <span>Ноорог хувилбар бий</span>}
              </div></div>
            <div className="acts">{c.ver ? <Chip label={`v${c.ver} · ${fmtDate(c.pub)}`} tone="brand" /> : <Chip label="Нийтлэгдээгүй" tone="warn" />}</div>
          </Link>
        ))}
        {!shown.length && <div className="empty">Сургалт алга.</div>}
      </div>
    </>
  );
}
