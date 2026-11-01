import Link from 'next/link';
import { ymd, hm } from '@/lib/format';

export type CalItem = { at: string; title: string; sub?: string; href: string; tone?: string };
const WD = ['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'];

// Сарын хуанли: хичээлийн цагуудыг өдөр бүрээр харуулна. month = 'YYYY-MM'
export default function MonthCalendar({ month, items, link }: { month: string; items: CalItem[]; link: (m: string) => string }) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const today = ymd(new Date());
  const byDay = new Map<string, CalItem[]>();
  for (const it of items) { const k = ymd(it.at); byDay.set(k, [...(byDay.get(k) ?? []), it]); }
  return (
    <section className="panel cal">
      <div className="head" style={{ alignItems: 'center' }}>
        <Link className="btn sm ghost" href={link(prev)}>‹</Link>
        <h2>{y} оны {m}-р сар</h2>
        <Link className="btn sm ghost" href={link(next)}>›</Link>
      </div>
      <div className="calgrid">
        {WD.map(d => <div key={d} className="calwd">{d}</div>)}
        {cells.map((d, i) => {
          const key = d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
          const list = d ? (byDay.get(key) ?? []).sort((a, b) => a.at.localeCompare(b.at)) : [];
          return (
            <div key={i} className={`calday ${!d ? 'off' : ''} ${key === today ? 'today' : ''}`}>
              {d && <span className="caln">{d}</span>}
              {list.map((it, j) => (
                <Link key={j} href={it.href} className={`calev t-${it.tone ?? 'brand'}`} title={`${hm(it.at)} ${it.title}${it.sub ? ` · ${it.sub}` : ''}`}>
                  <strong>{hm(it.at)}</strong> {it.title}
                </Link>))}
            </div>);
        })}
      </div>
    </section>
  );
}
