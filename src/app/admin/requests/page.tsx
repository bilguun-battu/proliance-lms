import Link from 'next/link';
import { all } from '@/lib/db';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { Flash, Chip } from '@/components/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { REQ_KIND, REQ_STATUS, reqCode } from '@/lib/requests';

const TABS: [string, string][] = [['open', 'Шийдвэрлэх'], ['NEW', 'Шинэ'], ['IN_REVIEW', 'Хянаж байна'], ['SCHEDULED', 'Хуваарь гарсан'], ['closed', 'Хаагдсан'], ['all', 'Бүгд']];

// Харилцагч байгууллагуудын сургалтын хүсэлт
export default async function AdminRequests(props: { searchParams: Promise<{ ok?: string; err?: string; f?: string; org?: string }> }) {
  const sp = await props.searchParams;
  await requireUser(...STAFF_ROLES);
  const f = TABS.some(t => t[0] === sp.f) ? sp.f! : 'open';
  const where = f === 'open' ? `r.status IN ('NEW','IN_REVIEW','SCHEDULED')` : f === 'closed' ? `r.status IN ('DONE','REJECTED','CANCELLED')` : f === 'all' ? 'true' : `r.status='${f}'`;
  const rows = await all<any>(`SELECT r.*, o.name AS org, c.title AS course, u.name AS requester,
      (SELECT count(*)::int FROM training_request_people p WHERE p.request_id=r.id) AS people,
      (SELECT count(*)::int FROM training_request_people p WHERE p.request_id=r.id AND p.user_id IS NULL) AS unregistered,
      (r.status='NEW' OR (r.last_org_at > coalesce(r.admin_seen_at,'epoch') AND r.last_org_at > coalesce(r.last_admin_at,'epoch'))) AS attention
    FROM training_requests r JOIN orgs o ON o.id=r.org_id LEFT JOIN courses c ON c.id=r.course_id LEFT JOIN users u ON u.id=r.requested_by
    WHERE ${where} AND ($1::uuid IS NULL OR r.org_id=$1) ORDER BY attention DESC, r.updated_at DESC`, [sp.org || null]);
  const counts = await all<any>(`SELECT status, count(*)::int AS n FROM training_requests GROUP BY 1`);
  const n = (k: string) => counts.filter(c => k === 'open' ? ['NEW', 'IN_REVIEW', 'SCHEDULED'].includes(c.status) : k === 'closed' ? ['DONE', 'REJECTED', 'CANCELLED'].includes(c.status) : k === 'all' || c.status === k).reduce((a, c) => a + c.n, 0);
  return (
    <>
      <div className="head"><div><h1>Сургалтын хүсэлт</h1>
        <p className="muted">Харилцагч байгууллагуудын хариуцагчийн илгээсэн шинэ ажилтны, давтан болон нэмэлт сургалтын хүсэлт. Хариу бичих, шинэ ажилтанд эрх үүсгэх, хуваарьт бүртгэхийг хүсэлт дотроос нь хийнэ.</p></div></div>
      <Flash sp={sp} />
      <nav className="viewtabs" aria-label="Шүүлт">{TABS.map(([k, l]) => (
        <Link key={k} href={`/admin/requests?f=${k}`} aria-current={f === k ? 'page' : undefined}>{l} <span className="muted small num">{n(k)}</span></Link>))}</nav>
      {rows.length ? <div className="list">{rows.map(r => (
        <Link key={r.id} href={`/admin/requests/${r.id}`} className="row">
          <div><strong>{r.org}</strong> · {REQ_KIND[r.kind][0]}{r.course ? ` · ${r.course}` : r.topic ? ` · ${r.topic}` : ''}
            <div className="meta"><span className="num">{reqCode(r.num)}</span><span>{r.requester ?? '—'}</span><span>{fmtDate(r.created_at)}</span>
              {r.people > 0 && <span>{r.people} хүн{r.unregistered ? ` (${r.unregistered} бүртгэлгүй)` : ''}</span>}<span>Сүүлд: {fmtDateTime(r.updated_at)}</span></div></div>
          <div className="acts">{r.attention && r.status !== 'NEW' && <Chip label="Шинэ мессеж" tone="warn" />}<Chip label={REQ_STATUS[r.status][0]} tone={REQ_STATUS[r.status][1]} /></div>
        </Link>))}</div>
        : <div className="list"><div className="empty">Хүсэлт алга.</div></div>}
    </>
  );
}
