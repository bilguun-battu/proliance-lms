import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getSession } from '@/lib/auth';
import { one } from '@/lib/db';
import { uploadDir } from '@/lib/files';
import { learnerCourseIds, logActivity } from '@/lib/progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Нэвтэрсэн, тухайн сургалтад эрхтэй хэрэглэгчид л файлыг урсгалаар өгнө (Range дэмжинэ)
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const u = await getSession();
  if (!u) return new Response('Нэвтэрнэ үү.', { status: 401 });
  const f = await one<any>('SELECT * FROM files WHERE id=$1', [params.id]);
  if (!f) return new Response('Файл олдсонгүй.', { status: 404 });

  if (u.role !== 'ADMIN') {
    const uses = await one<any>(`
      SELECT v.course_id, m.module_key, m.title FROM modules m JOIN course_versions v ON v.id=m.version_id
       WHERE v.status='PUBLISHED' AND (m.video_file=$1 OR m.pdf_file=$1) AND v.course_id = ANY($2) LIMIT 1`,
      [f.id, await learnerCourseIds(u.id)]);
    if (!uses) return new Response('Энэ файлыг үзэх эрхгүй байна.', { status: 403 });
    if (f.mime === 'application/pdf' && !req.headers.get('range')) await logActivity(u.id, uses.course_id, uses.module_key, 'PDF', uses.title);
  }

  const full = path.join(uploadDir(), path.basename(f.path));
  if (!fs.existsSync(full)) return new Response('Файл серверт алга.', { status: 404 });
  const size = fs.statSync(full).size;
  const headers: Record<string, string> = {
    'Content-Type': f.mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
  };
  const range = req.headers.get('range');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? Number(m[1]) : 0;
    let end = m && m[2] ? Number(m[2]) : size - 1;
    if (!m || !m[1]) { start = Math.max(0, size - Number(m?.[2] || 0)); end = size - 1; }
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(full, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(full)) as ReadableStream, { headers: { ...headers, 'Content-Length': String(size) } });
}
