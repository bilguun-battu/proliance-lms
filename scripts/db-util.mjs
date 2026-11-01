// Өгөгдлийн санд холбогдох туслах: ойлгомжтой алдааны мессеж, өгөгдлийн сан байхгүй бол үүсгэнэ
import pg from 'pg';

export function hint(e, url) {
  const u = safeUrl(url);
  switch (e.code) {
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
      return `PostgreSQL ${u ? `${u.hostname}:${u.port || 5432}` : ''} дээр ажиллахгүй байна.\n` +
        `  → PostgreSQL суулгаагүй бол: .env файлыг устгаад "npm run local" ажиллуулна (суулгацгүй өгөгдлийн сан автоматаар асна).\n` +
        `  → Суулгасан бол PostgreSQL үйлчилгээг асааж, .env доторх DATABASE_URL-ийг шалгана.`;
    case '28P01':
    case '28000':
      return `PostgreSQL-ийн хэрэглэгчийн нэр эсвэл нууц үг буруу байна (${u?.username}).\n` +
        `  → .env доторх DATABASE_URL-ийг өөрийн PostgreSQL-ийн хэрэглэгч, нууц үгээр засна.\n` +
        `  → Эсвэл .env-ийг устгаад "npm run local" ажиллуулна.`;
    default:
      return null;
  }
}

function safeUrl(url) {
  try { return new URL(url); } catch { return null; }
}

export function requireUrl() {
  if (!process.env.DATABASE_URL) {
    console.error('\n✖ DATABASE_URL тохируулаагүй байна. "npm run setup" (эсвэл "npm run local") ажиллуулж .env үүсгэнэ үү.\n');
    process.exit(1);
  }
  return process.env.DATABASE_URL;
}

// Холбогдоно. Өгөгдлийн сан байхгүй (3D000) бол "postgres" сангаар дамжин үүсгээд дахин оролдоно.
export async function connect(url = requireUrl()) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const c = new pg.Client({ connectionString: url });
    try {
      await c.connect();
      return c;
    } catch (e) {
      await c.end().catch(() => {});
      if (e.code === '3D000' && attempt === 0) {
        const u = new URL(url);
        const name = decodeURIComponent(u.pathname.slice(1));
        u.pathname = '/postgres';
        const admin = new pg.Client({ connectionString: u.toString() });
        try {
          await admin.connect();
          await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
          console.log(`Өгөгдлийн сан "${name}" үүслээ.`);
        } catch (e2) {
          fail(e2, url, `"${name}" өгөгдлийн санг үүсгэж чадсангүй. PostgreSQL-д үүсгэх эрхтэй хэрэглэгчээр холбогдох эсвэл гараар үүсгэнэ үү.`);
        } finally {
          await admin.end().catch(() => {});
        }
        continue;
      }
      fail(e, url);
    }
  }
}

export function fail(e, url, extra) {
  console.error('\n✖ Өгөгдлийн санд холбогдож чадсангүй: ' + (e.message || e));
  const h = hint(e, url);
  if (h) console.error('  ' + h);
  if (extra) console.error('  ' + extra);
  console.error('');
  process.exit(1);
}
