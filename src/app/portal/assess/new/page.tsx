import { requireUser } from '@/lib/auth';
import { AssessForm } from '@/components/AssessViews';

export default async function Page(
  props: { searchParams: Promise<{ m?: string; u?: string; ok?: string; err?: string }> }
) {
  const searchParams = await props.searchParams;
  const u = await requireUser('LEARNER', 'COORDINATOR');
  return <AssessForm user={u} base="/portal/assess" newParams={searchParams} sp={searchParams} />;
}
