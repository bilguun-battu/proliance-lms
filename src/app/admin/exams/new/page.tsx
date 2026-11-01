import Link from 'next/link';
import { Flash } from '@/components/ui';
import ExamSettings from '@/components/ExamSettings';
import { audOf, AUD_DB } from '@/components/AudTabs';

export default async function NewExam(props: { searchParams: Promise<{ ok?: string; err?: string; aud?: string }> }) {
  const sp = await props.searchParams;
  const aud = audOf(sp.aud);
  return (
    <>
      <div><Link className="link small" href={`/admin/exams?aud=${aud}`}>← Шалгалтын материал</Link></div>
      <div className="head"><div><h1>Шалгалт үүсгэх</h1><p className="muted">{aud === 'internal' ? 'Дотоод сургалтын' : 'Харилцагчийн сургалтын'} шалгалт. Үүсгэсний дараа бүлэг, асуултаа нэмнэ.</p></div></div>
      <Flash sp={sp} />
      <ExamSettings audience={AUD_DB(aud) as 'CUSTOMER' | 'INTERNAL'} />
    </>
  );
}
