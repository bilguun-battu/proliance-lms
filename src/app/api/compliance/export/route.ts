import ExcelJS from 'exceljs';
import { getSession, isStaff } from '@/lib/auth';
import { complianceRows, COMP_LABEL } from '@/lib/compliance';
import { fmtDate } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = await getSession();
  if (!u || (!isStaff(u.role) && u.role !== 'COORDINATOR')) return new Response('Эрхгүй.', { status: 403 });
  const sp = new URL(req.url).searchParams;
  const rows0 = await complianceRows({ course: sp.get('course') || undefined, department: sp.get('department') || undefined, org: u.role === 'COORDINATOR' ? u.orgId! : sp.get('org') || undefined, audience: sp.get('aud') === 'customer' ? 'CUSTOMER' : sp.get('aud') === 'internal' ? 'INTERNAL' : undefined });
  const q = (sp.get('q') ?? '').trim().toLowerCase();
  const st = sp.get('status');
  const rows = rows0.filter(r => (!q || `${r.name} ${r.email ?? ''}`.toLowerCase().includes(q))
    && (st === 'late' ? ['OVERDUE', 'EXPIRED'].includes(r.status) : st === 'soon' ? ['DUE_SOON', 'EXPIRING'].includes(r.status) : true));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Заавал хамрагдах сургалт');
  ws.columns = [
    { header: 'Нэр', key: 'name', width: 22 }, { header: 'Имэйл', key: 'email', width: 28 }, { header: 'Байгууллага', key: 'org', width: 26 },
    { header: 'Хэлтэс', key: 'department', width: 20 }, { header: 'Албан тушаал', key: 'position', width: 22 }, { header: 'Сургалт', key: 'course', width: 36 },
    { header: 'Төлөв', key: 'st', width: 18 }, { header: 'Эцсийн хугацаа', key: 'due', width: 14 }, { header: 'Дууссан', key: 'done_at', width: 12 },
    { header: 'Хүчинтэй хүртэл', key: 'valid', width: 14 }, { header: 'Давтамж (сар)', key: 'recurrence', width: 12 }, { header: 'Модуль', key: 'mods', width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) ws.addRow({ ...r, st: COMP_LABEL[r.status][0], due: fmtDate(r.due), done_at: fmtDate(r.completedAt), valid: fmtDate(r.validUntil), mods: `${r.done}/${r.total}` });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`заавал_хамрагдах_сургалт_${new Date().toISOString().slice(0, 10)}.xlsx`)}`,
  } });
}
