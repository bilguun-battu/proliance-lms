import { requireUser, PORTAL_ROLES } from '@/lib/auth';
import { AssessQueue } from '@/components/AssessViews';

export default async function Page(props: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const searchParams = await props.searchParams;
  const u = await requireUser(...PORTAL_ROLES);
  return <AssessQueue user={u} base="/portal/assess" sp={searchParams} />;
}
