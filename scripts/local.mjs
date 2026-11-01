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

// Суулгацгүй PostgreSQL: npm-ээр ирсэн PostgreSQL програмыг (@embedded-postgres/<платформ>) шууд ажиллуулна
let pgStarted = false;
let pgBin = null;
async function binaries() {
  const plat = process.platform === 'win32' ? 'windows' : process.platform;
  try {
    return (await import(`@embedded-postgres/${plat}-${process.arch}`));
  } catch {
    console.error(`✖ Энэ компьютерт (${process.platform}-${process.arch}) тохирох суулгацгүй PostgreSQL олдсонгүй. "npm install" дахин ажиллуулах эсвэл PostgreSQL суулгаад .env-д DATABASE_URL тохируулна уу.`);
    process.exit(1);
  }
}

function exec(file, args) {
  return new Promise(resolve => {
    const p = spawn(file, args, { cwd: root, env: { ...process.env, LC_MESSAGES: 'C' }, windowsHide: true });
    let out = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (out += d));
    p.on('error', e => resolve({ code: -1, out: out + String(e) }));
    p.on('exit', code => resolve({ code, out }));
  });
}

async function startEmbedded(url) {
  if (process.platform !== 'win32' && process.getuid?.() === 0) {
    console.error('✖ PostgreSQL-ийг root хэрэглэгчээр ажиллуулах боломжгүй. Энгийн хэрэглэгчээр "npm run local" ажиллуулна уу.');
    process.exit(1);
  }
  const u = new URL(url);
  pgBin = await binaries();
  const dir = path.join(root, '.pgdata');
  if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) {
    console.log('Суулгацгүй PostgreSQL-ийг анх удаа бэлтгэж байна (.pgdata)…');
    fs.rmSync(dir, { recursive: true, force: true });
    const pwfile = path.join(root, '.pgpass.tmp');
    fs.writeFileSync(pwfile, decodeURIComponent(u.password || 'postgres') + '\n');
    const r = await exec(pgBin.initdb, ['-D', dir, '-U', decodeURIComponent(u.username || 'postgres'), `--pwfile=${pwfile}`,
      '--auth=scram-sha-256', '--encoding=UTF8', '--no-locale', '--lc-messages=C']);
    fs.rmSync(pwfile, { force: true });
    if (r.code !== 0) {
      console.error(r.out);
      throw new Error('PostgreSQL-ийг бэлтгэж чадсангүй (дээрх мессежийг харна уу).');
    }
  }
  const port = u.port || '5439';
  // pg_ctl нь Windows-ийн администратор эрхтэй хэрэглэгч дээр ч эрхийг нь бууруулж аюулгүй асаана
  const st = await exec(pgBin.pg_ctl, ['-D', dir, 'status']);
  if (st.code === 0) {
    console.log(`PostgreSQL аль хэдийн ажиллаж байна: 127.0.0.1:${port}`);
  } else {
    const logFile = path.join(dir, 'server.log');
    const r = await exec(pgBin.pg_ctl, ['-D', dir, '-l', logFile, '-w', '-t', '90', '-o',
      `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=`, 'start']);
    if (r.code !== 0) {
      const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/).slice(-15).join('\n') : '';
      console.error((r.out + '\n' + tail).trim());
      throw new Error(/already in use|Address already|бусад/i.test(tail)
        ? `${port} порт эзлэгдсэн байна. Өөр "npm run local" ажиллаж байгаа эсэхийг шалгана уу.`
        : 'PostgreSQL асаж чадсангүй (дээрх мессежийг харна уу).');
    }
    console.log(`PostgreSQL асав: 127.0.0.1:${port}`);
  }
  pgStarted = true;
}

async function stop() {
  if (!pgStarted) return;
  pgStarted = false;
  await exec(pgBin.pg_ctl, ['-D', path.join(root, '.pgdata'), 'stop', '-m', 'fast', '-w']);
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
  let stopping = false;
  const shutdown = async () => { if (stopping) return; stopping = true; app.kill(); await stop(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  app.on('exit', async code => { await stop(); process.exit(code ?? 0); });
}

main().catch(async e => {
  console.error('\n✖ ' + ((e && e.message) || String(e)));
  await stop();
  process.exit(1);
});
