import 'server-only';
import path from 'node:path';
import fs from 'node:fs';

export function uploadDir() {
  const dir = path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || './uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Маягтаар ирсэн файлыг (server action) хадгалж files хүснэгтэд бүртгэнэ
export async function saveFormFile(file: File | null, kinds: Record<string, string>, maxMb: number): Promise<string | null | { error: string }> {
  if (!file || typeof file === 'string' || !file.size) return null;
  const ext = kinds[file.type];
  if (!ext) return { error: `Зөвшөөрөгдөх файл: ${[...new Set(Object.values(kinds))].join(', ')}` };
  if (file.size > maxMb * 1048576) return { error: `Файл ${maxMb}MB-аас хэтэрсэн байна.` };
  const { one } = await import('./db');
  const crypto = await import('node:crypto');
  const stored = crypto.randomUUID() + ext;
  fs.writeFileSync(path.join(uploadDir(), stored), Buffer.from(await file.arrayBuffer()));
  const f = await one<{ id: string }>('INSERT INTO files (name,mime,size,path) VALUES ($1,$2,$3,$4) RETURNING id', [file.name, file.type, file.size, stored]);
  return f!.id;
}
export const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
export const PDF_TYPES = { 'application/pdf': '.pdf' };
