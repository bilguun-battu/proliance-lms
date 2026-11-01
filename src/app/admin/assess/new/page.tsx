import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { AssessForm } from '@/components/AssessViews';

export default async function Page(
  props: { searchParams: Promise<{ m?: string; u?: string; ok?: string; err?: string }> }
) {
  const searchParams = await props.searchParams;
  const u = await requireUser(...STAFF_ROLES);
  return <AssessForm user={u} base="/admin/assess" newParams={searchParams} sp={searchParams} />;
}
