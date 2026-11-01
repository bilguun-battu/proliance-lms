import { requireUser } from '@/lib/auth';
import { AssessForm } from '@/components/AssessViews';

export default async function Page(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const u = await requireUser('LEARNER', 'COORDINATOR');
  return <AssessForm user={u} base="/portal/assess" id={params.id} sp={searchParams} />;
}
