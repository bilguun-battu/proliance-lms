import Shell from '@/components/Shell';
import { requireUser, PORTAL_ROLES } from '@/lib/auth';
import { one } from '@/lib/db';
import { learnerCourseIds, courseProgress } from '@/lib/progress';
import { isInstructor, pendingAttendance } from '@/lib/teach';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(...PORTAL_ROLES);
  let required = 0;
  for (const id of await learnerCourseIds(user.id)) required += (await courseProgress(user.id, id))?.left ?? 0;
  const unread = (await one<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [user.id]))!.n;
  const tabs = [
    { href: '/portal', label: 'Миний сургалт', badge: required, exact: false },
    { href: '/portal/schedule', label: 'Миний хуваарь', badge: 0 },
    { href: '/portal/notifications', label: 'Мэдэгдэл', badge: unread },
    { href: '/portal/profile', label: 'Миний профайл', badge: 0 },
  ];
  // Сургагч эрхтэй хүнд заах хуваарь үргэлж харагдана (эхний таб)
  if (user.role === 'TRAINER') tabs.unshift({ href: '/portal/teach', label: 'Заах хуваарь', badge: await pendingAttendance(user.id), exact: false });
  else if (await isInstructor(user.id)) tabs.splice(2, 0, { href: '/portal/teach', label: 'Заах хуваарь', badge: await pendingAttendance(user.id) });
  const quals = (await one<{ n: number }>('SELECT count(*)::int AS n FROM trainer_quals WHERE user_id=$1', [user.id]))!.n;
  if (quals || user.role === 'TRAINER') {
    const pending = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM practical_records r JOIN trainer_quals q ON q.course_id=r.course_id AND q.user_id=$1
       WHERE r.status IN ('SUBMITTED','REQUESTED') AND r.user_id <> $1`, [user.id]))!.n;
    tabs.push({ href: '/portal/assess', label: 'Үнэлгээ хийх', badge: pending });
  }
  if (user.role === 'COORDINATOR') tabs.push({ href: '/org', label: 'Манай ажилтнууд', badge: 0 });
  if (user.role === 'TRAINING_ADMIN') tabs.push({ href: '/admin/sessions', label: 'Сургалтын админ', badge: 0 });
  return <Shell user={user} tabs={tabs}>{children}</Shell>;
}
