import { requireUser } from '@/lib/auth';
import { AssessForm } from '@/components/AssessViews';

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; err?: string } }) {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  return <AssessForm user={u} base="/portal/assess" id={params.id} sp={searchParams} />;
}
