// Нэг командаар компьютер дээрээ ажиллуулах: npm run local
// PostgreSQL суулгаагүй бол суулгацгүй (embedded) PostgreSQL-ийг автоматаар асаана.
// Сонголт: --prod (бүтээж, production горимоор), --no-seed (жишээ өгөгдөлгүй)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ensureEnv, switchToEmbedded } from './ensure-env.mjs';

const root = process.cwd();
const prod = process.argv.includes('--prod');
const noSeed = process.argv.includes('--no-seed');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 18 || (major === 18 && minor < 18)) {
  console.error(`✖ Node.js ${process.versions.node} хуучин байна. 20 эсвэл түүнээс дээш хувилбар суулгана уу: https://nodejs.org`);
  process.exit(1);
}

function readEnv() {
  const env = {};
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return env;
}

function run(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { stdio: 'inherit', cwd: root, env: { ...process.env, ...extraEnv } });
    p.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${args.join(' ')} алдаатай дууслаа (${code})`))));
  });
}

async function canConnect(url) {
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try { await c.connect(); await c.end(); return { ok: true }; }
  catch (e) { await c.end().catch(() => {}); return { ok: false, code: e.code }; }
}

let pgServer = null;
async function startEmbedded(url) {
  const u = new URL(url);
  let EmbeddedPostgres;
  try {
    ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
  } catch {
    console.error('✖ embedded-postgres олдсонгүй. "npm install" дахин ажиллуулна уу.');
    process.exit(1);
  }
  const dir = path.join(root, '.pgdata');
  const fresh = !fs.existsSync(path.join(dir, 'PG_VERSION'));
  pgServer = new EmbeddedPostgres({
    databaseDir: dir,
    port: Number(u.port || 5439),
    user: decodeURIComponent(u.username || 'postgres'),
    password: decodeURIComponent(u.password || 'postgres'),
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--no-locale', '--lc-messages=C'],
    createPostgresUser: process.platform === 'linux' && process.getuid?.() === 0,
    onLog: () => {},
    onError: m => { const s = String(m?.message ?? m); if (/error|fatal/i.test(s)) console.error(s.trim()); },
  });
  if (fresh) {
    console.log('Суулгацгүй PostgreSQL-ийг анх удаа бэлтгэж байна (.pgdata)…');
    await pgServer.initialise();
  }
  await pgServer.start();
  console.log(`PostgreSQL асав: 127.0.0.1:${u.port || 5439}`);
}

async function stop() {
  if (pgServer) { await pgServer.stop().catch(() => {}); pgServer = null; }
}

async function main() {
  if (ensureEnv({ embedded: true })) console.log('Анхны тохиргоо: суулгацгүй PostgreSQL ашиглана.');
  let env = readEnv();

  if (env.LOCAL_DB !== 'embedded') {
    const r = await canConnect(env.DATABASE_URL);
    if (!r.ok && ['ECONNREFUSED', 'ENOTFOUND', '28P01', '28000', undefined].includes(r.code)) {
      console.log(`.env доторх PostgreSQL-д холбогдож чадсангүй (${r.code ?? 'тохиргоо алга'}).`);
      switchToEmbedded();
      env = readEnv();
    }
  }
  if (env.LOCAL_DB === 'embedded') await startEmbedded(env.DATABASE_URL);

  await run(['scripts/migrate.mjs']);
  await run(['scripts/seed.mjs', ...(noSeed ? ['--admin-only'] : [])]);

  // Компьютер дээр ажиллуулахад хаяг нь localhost байх ёстой (https хаягтай бол нэвтрэлтийн cookie ажиллахгүй)
  let appUrl = env.APP_URL || 'http://localhost:3000';
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(appUrl)) {
    console.log(`APP_URL=${appUrl} нь серверийн хаяг тул энэ удаад http://localhost:3000 ашиглана.`);
    appUrl = 'http://localhost:3000';
  }
  process.env.APP_URL = appUrl;
  process.env.NEXT_PUBLIC_BASE_PATH = '';
  const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (prod) await run([next, 'build'], { NODE_ENV: 'production' });
  const port = new URL(appUrl).port || '3000';
  console.log(`\n✔ Бэлэн: ${appUrl}\n  Админ: ${env.ADMIN_EMAIL || 'admin@proliance.mn'} / ${env.ADMIN_PASSWORD || 'Proliance2026!'}${noSeed ? '' : '\n  Жишээ хэрэглэгчид: нууц үг Test1234! (README-г харна уу)'}\n  Зогсоох: Ctrl+C\n`);
  const app = spawn(process.execPath, [next, prod ? 'start' : 'dev', '-p', port], { stdio: 'inherit', cwd: root, env: { ...process.env, ...(prod ? { NODE_ENV: 'production' } : {}) } });
  const shutdown = async () => { app.kill(); await stop(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  app.on('exit', async code => { await stop(); process.exit(code ?? 0); });
}

main().catch(async e => {
  console.error('\n✖ ' + (e.message || e));
  await stop();
  process.exit(1);
});
