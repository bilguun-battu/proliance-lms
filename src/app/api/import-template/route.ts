import ExcelJS from 'exceljs';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const u = await getSession();
  if (!u || u.role !== 'ADMIN') return new Response('Эрхгүй.', { status: 403 });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Суралцагч');
  ws.columns = [
    { header: 'Нэр', width: 24 }, { header: 'Албан тушаал', width: 24 }, { header: 'Имэйл', width: 30 },
    { header: 'Утас', width: 14 }, { header: 'Байгууллага', width: 30 }, { header: 'Хэлтэс', width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow(['Б. Жишээ', 'Лаборант', 'jishee@example.mn', '99112233', 'Жишээ: Нэгдсэн эмнэлэг', '']);
  ws.addRow(['Д. Жишээ', 'Борлуулалтын менежер', 'jishee2@proliance.mn', '99112244', 'Пролианс ХХК', 'Борлуулалт']);
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('суралцагч_загвар.xlsx')}`,
  } });
}
