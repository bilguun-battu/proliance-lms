import Link from 'next/link';
import { Chip } from '@/components/ui';
import { offCode, enrollOpen, type OfferingRow } from '@/lib/offerings';
import { fmtDate, hm } from '@/lib/format';

const MON = ['1-р сар', '2-р сар', '3-р сар', '4-р сар', '5-р сар', '6-р сар', '7-р сар', '8-р сар', '9-р сар', '10-р сар', '11-р сар', '12-р сар'];

// Хуваарьт сургалтын жагсаалт (админ ба сургагч багш)
export default function OfferingList({ rows, href, empty }: { rows: OfferingRow[]; href: (id: string) => string; empty: string }) {
  if (!rows.length) return <div className="list"><div className="empty">{empty}</div></div>;
  return (
    <div className="offlist">{rows.map(o => {
      const d = o.first_at ? new Date(o.first_at) : null;
      const ymdParts = d ? fmtDate(d).split('.') : null;
      const full = o.taken >= o.max_capacity;
      const tone = o.status === 'CANCELLED' ? 'var(--neutral)' : o.audience === 'INTERNAL' ? 'var(--green)' : 'var(--brand)';
      return (
        <Link key={o.id} href={href(o.id)} className="offrow" style={{ ['--c' as any]: tone }}>
          <div className="offdate">{ymdParts ? <><span>{MON[Number(ymdParts[1]) - 1]}</span><b className="num">{ymdParts[2]}</b><span>{hm(d!)}</span></> : <span>Цаггүй</span>}</div>
          <div>
            <div className="small muted"><span className="num">{offCode(o.num)}</span>{o.nsessions > 1 ? ` · ${o.nsessions} хичээл, ${fmtDate(o.last_at)} хүртэл` : ''}</div>
            <strong>{o.course}</strong>
            <div className="meta"><span>{o.location || '—'}</span>{o.instructor && <span>Багш: {o.instructor}</span>}
              {o.status === 'CANCELLED' ? <Chip label="Цуцлагдсан" tone="crit" /> : enrollOpen(o) ? <Chip label="Бүртгэл нээлттэй" tone="ok" /> : <Chip label="Бүртгэл хаагдсан" />}
              {o.min_capacity > 0 && o.taken < o.min_capacity && o.status !== 'CANCELLED' && <Chip label={`Доод тал нь ${o.min_capacity} хүн`} tone="warn" />}</div>
          </div>
          <div className="offseat">
            <span className="small num"><strong>{o.taken}/{o.max_capacity}</strong> бүртгэгдсэн{o.waiting ? ` · ${o.waiting} хүлээлгэнд` : ''}</span>
            <div className="bar"><span style={{ width: `${Math.min(100, Math.round((o.taken / Math.max(1, o.max_capacity)) * 100))}%`, background: full ? 'var(--warn)' : undefined }} /></div>
          </div>
        </Link>);
    })}</div>
  );
}
