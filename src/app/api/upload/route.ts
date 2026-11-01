import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getSession } from '@/lib/auth';
import { one, run } from '@/lib/db';
import { uploadDir } from '@/lib/files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMITS = { video: 500 * 1048576, pdf: 50 * 1048576 };
const TYPES = { video: ['video/mp4', 'video/webm'], pdf: ['application/pdf'] };

// PUT /api/upload?module=<id>&kind=video|pdf  — биед файл өөрөө
export async function PUT(req: Request) {
  const u = await getSession();
  if (!u || u.role !== 'ADMIN') return new Response('Эрх хүрэхгүй байна.', { status: 403 });
  const url = new URL(req.url);
  const moduleId = url.searchParams.get('module') || '';
  const kind = url.searchParams.get('kind') as 'video' | 'pdf';
  if (kind !== 'video' && kind !== 'pdf') return new Response('Файлын төрөл буруу.', { status: 400 });
  const mod = await one<any>(`SELECT m.id FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE m.id=$1 AND v.status='DRAFT'`, [moduleId]);
  if (!mod) return new Response('Зөвхөн ноорог хувилбарын модульд файл байршуулна.', { status: 400 });
  const mime = (req.headers.get('content-type') || '').split(';')[0];
  if (!TYPES[kind].includes(mime)) return new Response(kind === 'video' ? 'MP4 эсвэл WebM видео сонгоно уу.' : 'PDF файл сонгоно уу.', { status: 415 });
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > LIMITS[kind]) return new Response(`Файл хэт том байна (${kind === 'video' ? '500' : '50'}MB хүртэл).`, { status: 413 });
  if (!req.body) return new Response('Файл хоосон байна.', { status: 400 });

  const name = decodeURIComponent(req.headers.get('x-filename') || 'file');
  const stored = crypto.randomUUID() + (kind === 'pdf' ? '.pdf' : path.extname(name).toLowerCase() || '.mp4');
  const full = path.join(uploadDir(), stored);
  let size = 0;
  const src = Readable.fromWeb(req.body as any);
  src.on('data', (ch: Buffer) => {
    size += ch.length;
    if (size > LIMITS[kind]) src.destroy(new Error('too large'));
  });
  try {
    await pipeline(src, fs.createWriteStream(full));
  } catch {
    fs.rmSync(full, { force: true });
    return new Response('Байршуулалт тасарсан эсвэл файл хэт том байна.', { status: 400 });
  }
  const f = await one<{ id: string }>('INSERT INTO files (name,mime,size,path) VALUES ($1,$2,$3,$4) RETURNING id', [name, mime, size, stored]);
  const col = kind === 'pdf' ? 'pdf_file' : 'video_file';
  await run(`UPDATE modules SET ${col}=$1${kind === 'video' ? ', video_url=NULL' : ''}, change = CASE WHEN change='SAME' THEN 'CHANGED' ELSE change END WHERE id=$2`, [f!.id, moduleId]);
  return Response.json({ id: f!.id });
}
