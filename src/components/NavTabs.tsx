'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type Tab = { href: string; label: string; badge?: number; exact?: boolean };

export default function NavTabs({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  // Хамгийн урт таарсан холбоос идэвхтэй болно
  const matches = tabs.filter(t => (t.exact ? path === t.href : path === t.href || path.startsWith(t.href + '/')));
  const active = matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="tabs">
      <div className="wrap tabrow">
        {tabs.map(t => (
          <Link key={t.href} href={t.href} className="tab" aria-current={t.href === active ? 'page' : undefined}>
            {t.label}
            {t.badge ? <span className="badge">{t.badge}</span> : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}
