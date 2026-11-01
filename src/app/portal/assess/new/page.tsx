import { requireUser, PORTAL_ROLES } from '@/lib/auth';
import { AssessForm } from '@/components/AssessViews';

export default async function Page(
  props: { searchParams: Promise<{ m?: string; u?: string; ok?: string; err?: string }> }
) {
  const searchParams = await props.searchParams;
  const u = await requireUser(...PORTAL_ROLES);
  return <AssessForm user={u} base="/portal/assess" newParams={searchParams} sp={searchParams} />;
}
