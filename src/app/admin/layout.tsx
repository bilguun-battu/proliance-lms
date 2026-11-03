import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Shell from '@/components/Shell';
import { requireUser, STAFF_ROLES, TRAINING_ADMIN_PATHS } from '@/lib/auth';
import { one } from '@/lib/db';
import { isInstructor } from '@/lib/teach';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(...STAFF_ROLES);
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const path = ((await headers()).get('x-pathname') ?? '').replace(base, '') || '/admin';
  const ta = user.role === 'TRAINING_ADMIN';
  // Сургалтын админ зөвхөн өөрийн хэсгүүдэд нэвтэрнэ
  if (ta && !TRAINING_ADMIN_PATHS.some(p => path === p || path.startsWith(p + '/'))) redirect('/admin/sessions');
  const pending = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM practical_records WHERE status IN ('SUBMITTED','REQUESTED')`))!.n;
  const kbOpen = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM kb_questions WHERE NOT resolved AND (NOT answered OR helpful = false)`))!.n;
  const all = [
    { href: '/admin', label: 'Тойм', exact: true },
    { href: '/admin/courses', label: 'Сургалт' },
    { href: '/admin/assignments', label: 'Заавал сургалт оноох' },
    { href: '/admin/compliance', label: 'Заавал сургалтын тайлан' },
    { href: '/admin/matrix', label: 'Сургалтын матриц' },
    { href: '/admin/sessions', label: 'Хуваарь' },
    { href: '/admin/exams', label: 'Шалгалт' },
    { href: '/admin/evaluations', label: 'Үнэлгээ' },
    { href: '/admin/assess', label: 'OJT / VoC', badge: pending },
    { href: '/admin/kb', label: 'Сургалтын туслах', badge: kbOpen },
    { href: '/admin/trainers', label: 'Сургагч багш' },
    { href: '/admin/orgs', label: 'Байгууллага' },
    { href: '/admin/learners', label: 'Хэрэглэгч' },
    { href: '/admin/products', label: 'Бүтээгдэхүүн' },
    { href: '/admin/reports', label: 'Тайлан' },
  ];
  const tabs = ta ? all.filter(t => TRAINING_ADMIN_PATHS.includes(t.href)) : all;
  // Сургалтын админ өөрөө багшилдаг бол өөрийн заах хуваарь, суралцагчийн хэсэг рүү шилжинэ
  if (ta) {
    if (await isInstructor(user.id)) tabs.push({ href: '/portal/teach', label: 'Миний заах хуваарь' });
    tabs.push({ href: '/portal', label: 'Миний сургалт', exact: true });
  }
  return <Shell user={user} tabs={tabs}>{children}</Shell>;
}
