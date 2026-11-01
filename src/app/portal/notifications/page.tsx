import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { all, run } from '@/lib/db';
import { Chip } from '@/components/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';

export default async function Notifications() {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const rows = await all<any>('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [u.id]);
  await run('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [u.id]);
  return (
    <>
      <div className="head"><div><h1>Мэдэгдэл</h1><p className="muted">Таны үзсэн сургалт шинэчлэгдэхэд энд болон {u.email} хаягаар мэдэгдэл ирнэ.</p></div></div>
      {rows.length ? <div className="list">{rows.map(n => (
        <div key={n.id} className={`row ${n.read_at ? '' : 'req'}`} style={{ ['--c' as any]: 'var(--brand)', alignItems: 'start' }}>
          <div>
            <div className="acts" style={{ justifyContent: 'flex-start' }}><strong>{n.title}</strong>{!n.read_at && <Chip label="Шинэ" tone="warn" />}</div>
            <div className="small" style={{ whiteSpace: 'pre-line', marginTop: 4 }}>{n.body}</div>
            <div className="meta"><span>{fmtDateTime(n.created_at)}</span>{n.due_at && <span>Хугацаа: {fmtDate(n.due_at)}</span>}</div>
          </div>
          {n.course_id && <div className="acts"><Link className="btn sm" href={`/portal/courses/${n.course_id}`}>Сургалт руу очих</Link></div>}
        </div>))}</div>
        : <div className="list"><div className="empty">Мэдэгдэл алга.</div></div>}
    </>
  );
}
