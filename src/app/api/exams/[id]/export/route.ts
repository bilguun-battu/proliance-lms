import ExcelJS from 'exceljs';
import { getSession } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { fmtDateTime } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const u = await getSession();
  if (!u || u.role !== 'ADMIN') return new Response('Эрхгүй.', { status: 403 });
  const r = await one<any>('SELECT r.*, e.title FROM exam_runs r JOIN exams e ON e.id=r.exam_id WHERE r.id=$1', [params.id]);
  if (!r) return new Response('Олдсонгүй.', { status: 404 });
  const rows = await all<any>(`
    SELECT u.name, u.email, o.name AS org, v.name AS variant, a.score, a.passed, a.started_at, a.submitted_at
      FROM exam_attempts a JOIN users u ON u.id=a.user_id LEFT JOIN orgs o ON o.id=u.org_id JOIN exam_variants v ON v.id=a.variant_id
     WHERE a.run_id=$1 ORDER BY o.name, u.name`, [r.id]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Шалгалтын дүн');
  ws.columns = [
    { header: 'Байгууллага', key: 'org', width: 28 }, { header: 'Нэр', key: 'name', width: 22 }, { header: 'Имэйл', key: 'email', width: 28 },
    { header: 'Хувилбар', key: 'variant', width: 14 }, { header: 'Оноо (%)', key: 'score', width: 10 }, { header: 'Дүн', key: 'res', width: 12 },
    { header: 'Эхэлсэн', key: 'started', width: 18 }, { header: 'Илгээсэн', key: 'submitted', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const x of rows) ws.addRow({ ...x, res: x.submitted_at ? (x.passed ? 'Тэнцсэн' : 'Тэнцээгүй') : 'Дуусгаагүй', started: fmtDateTime(x.started_at), submitted: fmtDateTime(x.submitted_at) });
  const buf = await wb.xlsx.writeBuffer();
  const name = `шалгалт_${r.title}_${fmtDateTime(r.opened_at).slice(0, 10)}.xlsx`;
  return new Response(buf as ArrayBuffer, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
  } });
}
