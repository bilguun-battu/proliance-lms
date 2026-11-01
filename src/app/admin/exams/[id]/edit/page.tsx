import Link from 'next/link';
import { notFound } from 'next/navigation';
import { one } from '@/lib/db';
import { Flash } from '@/components/ui';
import ExamSettings from '@/components/ExamSettings';

export default async function EditExam(props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const e = await one<any>('SELECT e.*, c.audience FROM exams e JOIN courses c ON c.id=e.course_id WHERE e.id=$1', [id]);
  if (!e) notFound();
  return (
    <>
      <div><Link className="link small" href={`/admin/exams/${e.id}`}>← {e.title}</Link></div>
      <div className="head"><div><h1>Тохиргоо засах</h1><p className="muted">#{e.num}</p></div></div>
      <Flash sp={sp} />
      <ExamSettings exam={e} audience={e.audience} />
    </>
  );
}
