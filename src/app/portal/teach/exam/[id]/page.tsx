import { notFound } from 'next/navigation';
import { requireUser, PORTAL_ROLES } from '@/lib/auth';
import { one } from '@/lib/db';
import { canManageOffering } from '@/lib/offerings';
import LiveExamView from '@/components/LiveExamView';

export default async function TeachExam(props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireUser(...PORTAL_ROLES);
  const { id } = await props.params;
  const r = await one<any>('SELECT s.offering_id FROM exam_runs r JOIN sessions s ON s.id=r.session_id WHERE r.id=$1', [id]);
  if (!r?.offering_id || !(await canManageOffering(me, r.offering_id))) notFound();
  return <LiveExamView id={id} searchParams={await props.searchParams} admin={false} />;
}
