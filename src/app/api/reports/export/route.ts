import ExcelJS from 'exceljs';
import { getSession } from '@/lib/auth';
import { progressRows, activityRows, personRows, certificateRows } from '@/lib/reports';
import { ACTION_LABEL, fmtDateTime, fmtDate } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = await getSession();
  if (!u || (u.role !== 'ADMIN' && u.role !== 'COORDINATOR')) return new Response('Эрхгүй.', { status: 403 });
  const sp = new URL(req.url).searchParams;
  const f = { course: sp.get('course') || undefined, org: u.role === 'COORDINATOR' ? u.orgId! : sp.get('org') || undefined, from: sp.get('from') || undefined, to: sp.get('to') || undefined, aud: sp.get('aud') || undefined, kind: sp.get('kind') || undefined };
  const wb = new ExcelJS.Workbook();

  const h = wb.addWorksheet('Хүн бүрээр');
  h.columns = [
    { header: 'Байгууллага', key: 'org', width: 28 }, { header: 'Нэр', key: 'name', width: 22 }, { header: 'Албан тушаал', key: 'position', width: 22 },
    { header: 'Хэлтэс', key: 'department', width: 20 }, { header: 'Заавал хамрагдах (нийт)', key: 'mandTotal', width: 14 },
    { header: 'Заавал хамрагдах (хүчинтэй)', key: 'mandOk', width: 14 }, { header: 'Хугацаа хэтэрсэн', key: 'mandLate', width: 12 },
    { header: 'Нийт дуусгасан сургалт', key: 'completed', width: 14 }, { header: 'Үүнээс сонгон', key: 'optional', width: 12 }, { header: 'Гэрчилгээ', key: 'certs', width: 10 },
  ];
  for (const r of await personRows(f)) h.addRow(r);

  const p = wb.addWorksheet('Явц');
  p.columns = [
    { header: 'Байгууллага', key: 'org', width: 28 }, { header: 'Нэр', key: 'name', width: 22 }, { header: 'Албан тушаал', key: 'position', width: 20 },
    { header: 'Имэйл', key: 'email', width: 28 }, { header: 'Сургалт', key: 'title', width: 36 }, { header: 'Төрөл', key: 'categoryLabel', width: 20 }, { header: 'Ангилал', key: 'kindLabel', width: 18 }, { header: 'Хувилбар', key: 'version', width: 10 },
    { header: 'Төлөв', key: 'status', width: 22 }, { header: 'Дууссан модуль', key: 'done', width: 14 }, { header: 'Нийт модуль', key: 'total', width: 12 },
    { header: 'Дундаж оноо', key: 'avg', width: 12 }, { header: 'Сүүлийн үйлдэл', key: 'last', width: 18 },
  ];
  for (const r of await progressRows(f)) p.addRow({ ...r, last: fmtDateTime(r.last) });

  const ce = wb.addWorksheet('Гэрчилгээ');
  ce.columns = [
    { header: 'Дугаар', key: 'number', width: 16 }, { header: 'Нэр', key: 'user_name', width: 22 }, { header: 'Байгууллага', key: 'org_name', width: 26 },
    { header: 'Албан тушаал (олгох үед)', key: 'position', width: 22 }, { header: 'Сургалт', key: 'course_title', width: 36 },
    { header: 'Заавал хамрагдах', key: 'mand', width: 12 }, { header: 'Олгосон', key: 'issued', width: 12 }, { header: 'Хүчинтэй хүртэл', key: 'valid', width: 14 },
  ];
  for (const r of await certificateRows(f, 50000)) ce.addRow({ ...r, mand: r.mandatory ? 'Тийм' : 'Үгүй', issued: fmtDate(r.issued_at), valid: r.valid_until ? fmtDate(r.valid_until) : 'Хугацаагүй' });

  const a = wb.addWorksheet('Үйлдлийн бүртгэл');
  a.columns = [
    { header: 'Огноо', key: 'at', width: 18 }, { header: 'Нэр', key: 'name', width: 22 }, { header: 'Байгууллага', key: 'org', width: 28 },
    { header: 'Сургалт', key: 'course', width: 36 }, { header: 'Үйлдэл', key: 'action', width: 20 }, { header: 'Дэлгэрэнгүй', key: 'detail', width: 36 },
  ];
  for (const r of await activityRows(f, 50000)) a.addRow({ ...r, at: fmtDateTime(r.at), action: ACTION_LABEL[r.action] ?? r.action });
  for (const ws of [h, p, ce, a]) { ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }]; }

  const buf = await wb.xlsx.writeBuffer();
  const name = `сургалтын_тайлан_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buf as ArrayBuffer, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
  } });
}
