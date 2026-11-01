import Link from 'next/link';

export type Aud = 'customer' | 'internal';
export const audOf = (v?: string): Aud => (v === 'internal' ? 'internal' : 'customer');
export const AUD_DB = (a: Aud) => (a === 'internal' ? 'INTERNAL' : 'CUSTOMER');

// Харилцагчийн / дотоод сургалтыг тусад нь харуулах шилжүүлэгч
export default function AudTabs({ base, cur, counts, extra = {} }: { base: string; cur: Aud; counts?: { customer?: number; internal?: number }; extra?: Record<string, string | undefined> }) {
  const href = (a: Aud) => {
    const q = new URLSearchParams(Object.entries({ ...extra, aud: a }).filter(([, v]) => v) as [string, string][]);
    return `${base}?${q.toString()}`;
  };
  const item = (a: Aud, label: string) => (
    <Link href={href(a)} className="audtab" aria-current={cur === a ? 'page' : undefined}>
      {label}{counts?.[a] !== undefined && <span className="audn">{counts[a]}</span>}
    </Link>
  );
  return <div className="audtabs" role="tablist">{item('customer', 'Харилцагчийн сургалт')}{item('internal', 'Дотоод сургалт')}</div>;
}
