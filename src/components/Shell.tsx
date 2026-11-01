import Link from 'next/link';
import NavTabs, { Tab } from './NavTabs';
import { logoutAction } from '@/app/actions/auth';
import type { SessionUser } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/format';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function Shell({ user, tabs, children }: { user: SessionUser; tabs: Tab[]; children: React.ReactNode }) {
  return (
    <>
      <header className="top">
        <div className="wrap top-in">
          <Link href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${base}/logo.png`} alt="Proliance, зөв шийдлийг хамтдаа" />
            <span className="pill">Сургалт</span>
          </Link>
          <div className="who">
            <span><strong>{user.name}</strong> <span className="muted small">· {ROLE_LABEL[user.role]}</span></span>
            <form action={logoutAction}><button className="btn ghost sm">Гарах</button></form>
          </div>
        </div>
      </header>
      <NavTabs tabs={tabs} />
      <main className="wrap">{children}</main>
    </>
  );
}
