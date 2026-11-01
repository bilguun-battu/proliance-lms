import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { one } from '@/lib/db';
import ProfileView from '@/components/ProfileView';

// Байгууллагын хариуцагч өөрийн ажилтны профайлыг харна
export default async function OrgPerson({ params }: { params: { id: string } }) {
  const me = await requireUser('COORDINATOR');
  const u = await one<any>('SELECT id FROM users WHERE id=$1 AND org_id=$2', [params.id, me.orgId]);
  if (!u) notFound();
  return (
    <>
      <div><Link className="link small" href="/org">← Ажилтнууд</Link></div>
      <div className="head"><div><h1>Ажилтны сургалтын профайл</h1></div></div>
      <ProfileView userId={u.id} />
    </>
  );
}
