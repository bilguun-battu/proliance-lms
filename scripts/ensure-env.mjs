// .env байхгүй бол үүсгэнэ (Windows, macOS, Linux дээр адилхан): npm run setup
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const file = path.join(process.cwd(), '.env');
const rand = n => crypto.randomBytes(n).toString('hex');

// embedded = true: PostgreSQL суулгаагүй үед ашиглах суулгацгүй өгөгдлийн сан (npm run local)
export function ensureEnv({ embedded = true } = {}) {
  if (fs.existsSync(file)) return false;
  const pw = rand(12);
  const lines = [
    '# npm run setup / npm run local автоматаар үүсгэсэн. Серверт байршуулахдаа .env.example-ийг харна.',
    embedded ? '# Суулгацгүй PostgreSQL (.pgdata хавтаст хадгалагдана)' : '# Өөрийн PostgreSQL',
    embedded ? 'LOCAL_DB=embedded' : '',
    embedded ? `DATABASE_URL=postgresql://postgres:${pw}@127.0.0.1:5439/proliance_lms`
      : 'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/proliance_lms',
    `AUTH_SECRET=${rand(32)}`,
    'APP_URL=http://localhost:3000',
    'UPLOAD_DIR=./uploads',
    'ADMIN_EMAIL=admin@proliance.mn',
    'ADMIN_PASSWORD=Proliance2026!',
    `CRON_SECRET=${rand(16)}`,
    'APP_TZ=Asia/Ulaanbaatar',
    'NEXT_PUBLIC_BASE_PATH=',
    '',
  ].filter(l => l !== '');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  console.log('.env үүслээ.');
  return true;
}

// Одоо байгаа .env-ийг суулгацгүй өгөгдлийн сан руу шилжүүлнэ (хуучныг .env.bak болгож хадгална)
export function switchToEmbedded() {
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  const pw = rand(12);
  let s = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  s = s.split('\n').filter(l => !/^\s*(DATABASE_URL|LOCAL_DB)\s*=/.test(l)).join('\n').trim();
  s = `LOCAL_DB=embedded\nDATABASE_URL=postgresql://postgres:${pw}@127.0.0.1:5439/proliance_lms\n${s}\n`;
  if (!/^\s*AUTH_SECRET\s*=\s*\S/m.test(s) || /AUTH_SECRET=change-me/.test(s)) s = s.replace(/^\s*AUTH_SECRET\s*=.*$/m, '') + `AUTH_SECRET=${rand(32)}\n`;
  fs.writeFileSync(file, s);
  console.log('.env-ийг суулгацгүй өгөгдлийн сан руу шилжүүллээ (хуучин нь .env.bak).');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('ensure-env.mjs')) {
  if (!ensureEnv({ embedded: !process.argv.includes('--own-postgres') })) console.log('.env аль хэдийн байна, өөрчлөөгүй.');
}
