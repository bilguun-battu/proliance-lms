import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { Flash, Chip } from '@/components/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { REQ_KIND, REQ_STATUS, reqCode } from '@/lib/requests';

// Байгууллагын хариуцагчийн илгээсэн сургалтын хүсэлтүүд
export default async function OrgRequests(props: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await props.searchParams;
  const u = await requireUser('COORDINATOR');
  const rows = await all<any>(`SELECT r.*, c.title AS course, (SELECT count(*)::int FROM training_request_people p WHERE p.request_id=r.id) AS people,
      r.last_admin_at > coalesce(r.org_seen_at, 'epoch') AS unread
    FROM training_requests r LEFT JOIN courses c ON c.id=r.course_id WHERE r.org_id=$1 ORDER BY r.updated_at DESC`, [u.orgId]);
  return (
    <>
      <div className="head">
        <div><h1>Сургалтын хүсэлт</h1><p className="muted">Шинэ ажилтны сургалт, давтан сургалт, нэмэлт сургалтын хүсэлтээ утас, имэйлээр бус эндээс илгээнэ. Proliance-ийн хариу, хуваарь энд болон мэдэгдлээр ирнэ.</p></div>
        <Link className="btn" href="/org/requests/new">+ Шинэ хүсэлт</Link>
      </div>
      <Flash sp={sp} />
      {rows.length ? <div className="list">{rows.map(r => (
        <Link key={r.id} href={`/org/requests/${r.id}`} className="row">
          <div><strong>{REQ_KIND[r.kind][0]}{r.course ? ` · ${r.course}` : r.topic ? ` · ${r.topic}` : ''}</strong>
            <div className="meta"><span className="num">{reqCode(r.num)}</span><span>{fmtDate(r.created_at)}</span>{r.people > 0 && <span>{r.people} хүн</span>}
              <span>Сүүлд: {fmtDateTime(r.updated_at)}</span></div></div>
          <div className="acts">{r.unread && <Chip label="Шинэ хариу" tone="warn" />}<Chip label={REQ_STATUS[r.status][0]} tone={REQ_STATUS[r.status][1]} /></div>
        </Link>))}</div>
        : <div className="list"><div className="empty">Одоогоор хүсэлт илгээгээгүй байна. <Link className="link" href="/org/requests/new">Шинэ хүсэлт илгээх</Link></div></div>}
    </>
  );
}
