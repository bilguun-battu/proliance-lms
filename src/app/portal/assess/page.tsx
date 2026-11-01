import { requireUser } from '@/lib/auth';
import { AssessQueue } from '@/components/AssessViews';

export default async function Page({ searchParams }: { searchParams: { ok?: string; err?: string } }) {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  return <AssessQueue user={u} base="/portal/assess" sp={searchParams} />;
}
