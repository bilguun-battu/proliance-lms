import Shell from '@/components/Shell';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('COORDINATOR');
  return (
    <Shell user={user} tabs={[
      { href: '/org', label: 'Манай ажилтнууд' },
      { href: '/portal', label: 'Миний сургалт' },
      { href: '/portal/schedule', label: 'Миний хуваарь' },
      { href: '/portal/notifications', label: 'Мэдэгдэл' },
    ]}>{children}</Shell>
  );
}
