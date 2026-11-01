import { requireUser } from '@/lib/auth';
import { AssessForm } from '@/components/AssessViews';

export default async function Page({ searchParams }: { searchParams: { m?: string; u?: string; ok?: string; err?: string } }) {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  return <AssessForm user={u} base="/portal/assess" newParams={searchParams} sp={searchParams} />;
}
