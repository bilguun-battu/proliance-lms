import ExcelJS from 'exceljs';
import { getSession } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { summarize, EvalAnswer } from '@/lib/evals';
import { fmtDateTime } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const u = await getSession();
  if (!u || u.role !== 'ADMIN') return new Response('Эрхгүй.', { status: 403 });
  const r = await one<any>('SELECT r.*, t.name, t.anonymous FROM eval_runs r JOIN eval_templates t ON t.id=r.template_id WHERE r.id=$1', [params.id]);
  if (!r) return new Response('Олдсонгүй.', { status: 404 });
  const wb = new ExcelJS.Workbook();
  const sum = await summarize([r.id], !r.anonymous);
  const ws = wb.addWorksheet('Хураангуй');
  ws.columns = [{ header: 'Хэсэг', key: 'section', width: 24 }, { header: 'Асуулт', key: 'text', width: 60 }, { header: 'Хариулт', key: 'n', width: 10 },
    { header: 'Дундаж (1–5)', key: 'avg', width: 12 }, { header: '1', key: 'd1', width: 6 }, { header: '2', key: 'd2', width: 6 }, { header: '3', key: 'd3', width: 6 },
    { header: '4', key: 'd4', width: 6 }, { header: '5', key: 'd5', width: 6 }, { header: 'Сонголт', key: 'ch', width: 40 }];
  for (const s of sum.stats) ws.addRow({ section: s.section, text: s.text, n: s.n, avg: s.avg ? Number(s.avg.toFixed(2)) : null,
    d1: s.kind === 'RATING' ? s.dist[0] : null, d2: s.kind === 'RATING' ? s.dist[1] : null, d3: s.kind === 'RATING' ? s.dist[2] : null,
    d4: s.kind === 'RATING' ? s.dist[3] : null, d5: s.kind === 'RATING' ? s.dist[4] : null,
    ch: s.kind === 'CHOICE' ? Object.entries(s.choices).map(([k, v]) => `${k}: ${v}`).join('; ') : s.kind === 'TEXT' ? `${s.comments.length} сэтгэгдэл` : '' });
  const rows = await all<{ answers: EvalAnswer[]; name: string; org: string; submitted_at: string }>(`
    SELECT x.answers, u.name, o.name AS org, x.submitted_at FROM eval_responses x JOIN users u ON u.id=x.user_id LEFT JOIN orgs o ON o.id=u.org_id WHERE x.run_id=$1 ORDER BY x.submitted_at`, [r.id]);
  const d = wb.addWorksheet('Хариултууд');
  const qs = rows[0]?.answers ?? [];
  d.columns = [{ header: 'Огноо', key: 'at', width: 18 }, ...(r.anonymous ? [] : [{ header: 'Нэр', key: 'name', width: 22 }, { header: 'Байгууллага', key: 'org', width: 26 }]),
    ...qs.map((q, i) => ({ header: q.text, key: `q${i}`, width: q.kind === 'TEXT' ? 40 : 14 }))];
  for (const x of rows) d.addRow({ at: fmtDateTime(x.submitted_at), name: x.name, org: x.org, ...Object.fromEntries(x.answers.map((a, i) => [`q${i}`, a.value])) });
  for (const w of [ws, d]) w.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`үнэлгээ_${fmtDateTime(r.opened_at).slice(0, 10)}.xlsx`)}`,
  } });
}
