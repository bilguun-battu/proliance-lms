import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser, PORTAL_ROLES } from '@/lib/auth';
import { canManageOffering, getOffering } from '@/lib/offerings';
import { Flash } from '@/components/ui';
import OfferingManage from '@/components/OfferingManage';

export default async function TeachOffering(props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireUser(...PORTAL_ROLES);
  const { id } = await props.params;
  if (!(await getOffering(id)) || !(await canManageOffering(me, id))) notFound();
  return (
    <>
      <div><Link className="link small" href="/portal/teach">← Заах хуваарь</Link></div>
      <Flash sp={await props.searchParams} />
      <OfferingManage id={id} me={me} base="/portal/teach" examBase="/portal/teach/exam" />
    </>
  );
}
