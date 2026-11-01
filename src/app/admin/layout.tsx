import Shell from '@/components/Shell';
import { requireUser } from '@/lib/auth';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('ADMIN');
  const pending = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM practical_records WHERE status IN ('SUBMITTED','REQUESTED')`))!.n;
  return (
    <Shell user={user} tabs={[
      { href: '/admin', label: 'Тойм', exact: true },
      { href: '/admin/courses', label: 'Сургалт' },
      { href: '/admin/compliance', label: 'Заавал хамрагдах сургалт' },
      { href: '/admin/matrix', label: 'Сургалтын матриц' },
      { href: '/admin/sessions', label: 'Хуваарь' },
      { href: '/admin/exams', label: 'Шалгалт' },
      { href: '/admin/evaluations', label: 'Үнэлгээ' },
      { href: '/admin/assess', label: 'OJT / VoC', badge: pending },
      { href: '/admin/trainers', label: 'Сургагч багш' },
      { href: '/admin/orgs', label: 'Байгууллага' },
      { href: '/admin/learners', label: 'Хэрэглэгч' },
      { href: '/admin/products', label: 'Бүтээгдэхүүн' },
      { href: '/admin/reports', label: 'Тайлан' },
    ]}>{children}</Shell>
  );
}
