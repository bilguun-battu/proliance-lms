import Link from 'next/link';
import { notFound } from 'next/navigation';
import { one } from '@/lib/db';
import { closeEvalRun, extendEvalRun } from '@/app/actions/evals';
import { evalUrl, summarize } from '@/lib/evals';
import { qrSvg, runIsOpen } from '@/lib/exams';
import { Flash, Chip } from '@/components/ui';
import { fmtDateTime, fmtSession } from '@/lib/format';
import Submit from '@/components/Submit';
import LiveRefresh from '@/components/LiveRefresh';
import CopyLink from '@/components/CopyLink';
import EvalResults from '@/components/EvalResults';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default async function LiveEval(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const r = await one<any>(`
    SELECT r.*, t.name, t.anonymous, c.title AS course, s.starts_at AS session_at, s.location
      FROM eval_runs r JOIN eval_templates t ON t.id=r.template_id LEFT JOIN courses c ON c.id=r.course_id LEFT JOIN sessions s ON s.id=r.session_id WHERE r.id=$1`, [params.id]);
  if (!r) notFound();
  const open = runIsOpen(r);
  const url = evalUrl(r.token);
  const svg = open ? await qrSvg(url) : '';
  const data = await summarize([r.id], !r.anonymous);
  return (
    <>
      <div><Link className="link small" href={`/admin/evaluations/${r.template_id}`}>← {r.name}</Link></div>
      <div className="head">
        <div><h1>Хичээлийн үнэлгээ</h1><p className="muted">{r.course ?? ''}{r.session_at ? ` · ${fmtSession(r.session_at)}, ${r.location}` : ''}{r.instructor ? ` · ${r.instructor}` : ''}</p></div>
        {open ? <LiveRefresh until={r.closes_at} active /> : <Chip label={`Хаагдсан · ${fmtDateTime(r.closed_at ?? r.closes_at)}`} />}
      </div>
      <Flash sp={searchParams} />
      {open && <section className="panel" style={{ textAlign: 'center', justifyItems: 'center' }}>
        <h2>Хичээлээ үнэлнэ үү: QR кодыг утсаараа уншуулна уу</h2>
        <div style={{ width: 'min(380px, 80vw)' }} dangerouslySetInnerHTML={{ __html: svg }} />
        <CopyLink url={url} />
        <p className="small muted">{r.anonymous ? 'Нэргүй үнэлгээ. ' : ''}Нэг хүн нэг удаа бөглөнө. Хаагдсаны дараа холбоос ажиллахгүй.</p>
        <div className="acts" style={{ justifyContent: 'center' }}>
          <form action={extendEvalRun}><input type="hidden" name="run_id" value={r.id} /><Submit className="btn ghost">+15 минут сунгах</Submit></form>
          <form action={closeEvalRun}><input type="hidden" name="run_id" value={r.id} /><Submit className="btn danger" confirmText="Үнэлгээг хааж, холбоосыг идэвхгүй болгох уу?">Үнэлгээ хаах</Submit></form>
        </div>
      </section>}
      <section className="panel">
        <div className="head"><h2>Үр дүн</h2><a className="btn sm ghost" href={`${base}/api/evaluations/${r.id}/export`}>Excel татах</a></div>
        <EvalResults data={data} />
      </section>
    </>
  );
}
