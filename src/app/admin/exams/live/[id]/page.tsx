import LiveExamView from '@/components/LiveExamView';

export default async function LiveExam(props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await props.params;
  return <LiveExamView id={id} searchParams={await props.searchParams} admin />;
}
