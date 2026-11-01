import Link from 'next/link';
import { notFound } from 'next/navigation';
import { one } from '@/lib/db';
import { saveQuestion } from '@/app/actions/exams';
import { examSections } from '@/lib/exams';
import { Flash } from '@/components/ui';
import QuestionForm from '@/components/QuestionForm';

export default async function QuestionEdit(
  props: { params: Promise<{ id: string; qid: string }>; searchParams: Promise<{ ok?: string; err?: string; section?: string; t?: string }> }
) {
  const { id, qid } = await props.params;
  const sp = await props.searchParams;
  const e = await one<any>('SELECT id, title, num FROM exams WHERE id=$1', [id]);
  if (!e) notFound();
  const sections = await examSections(e.id);
  if (!sections.length) notFound();
  let q: any;
  if (qid === 'new') {
    q = { section_id: sections.find(s => s.id === sp.section)?.id ?? sections[sections.length - 1].id, text: '', qtype: 'RADIO', options: [], correct: [], points: 1, image_file: null };
  } else {
    const r = await one<any>('SELECT q.* FROM exam_questions q JOIN exam_sections s ON s.id=q.section_id WHERE q.id=$1 AND s.exam_id=$2', [qid, e.id]);
    if (!r) notFound();
    q = { id: r.id, section_id: r.section_id, text: r.text, qtype: r.qtype, options: r.qtype === 'YESNO' ? [] : r.options ?? [], position: r.position,
      correct: Array.isArray(r.correct) ? r.correct : r.correct_index != null ? [r.correct_index] : [], points: r.points, image_file: r.image_file };
  }
  return (
    <>
      <div><Link className="link small" href={`/admin/exams/${e.id}`}>← #{e.num} {e.title}</Link></div>
      <div className="head"><h1>{qid === 'new' ? 'Асуулт нэмэх' : 'Асуулт засах'}</h1></div>
      <Flash sp={sp} />
      <QuestionForm key={`${qid}-${sp.t ?? ''}-${sp.err ?? ''}`} action={saveQuestion} examId={e.id} q={q} sections={sections} />
    </>
  );
}
