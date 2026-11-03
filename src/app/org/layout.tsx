import Shell from '@/components/Shell';
import { requireUser } from '@/lib/auth';
import { orgUnread } from '@/lib/requests';

export const dynamic = 'force-dynamic';

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('COORDINATOR');
  return (
    <Shell user={user} tabs={[
      { href: '/org', label: 'Манай ажилтнууд', exact: true },
      { href: '/org/requests', label: 'Сургалтын хүсэлт', badge: await orgUnread(user.orgId!) },
      { href: '/portal', label: 'Миний сургалт' },
      { href: '/portal/schedule', label: 'Миний хуваарь' },
      { href: '/portal/notifications', label: 'Мэдэгдэл' },
    ]}>{children}</Shell>
  );
}
