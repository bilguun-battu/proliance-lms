import 'server-only';
import path from 'node:path';
import fs from 'node:fs';

export function uploadDir() {
  const dir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
