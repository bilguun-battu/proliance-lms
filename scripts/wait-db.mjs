// Өгөгдлийн сан бэлэн болтол хүлээнэ (Docker, Codespaces эхлэхэд)
import pg from 'pg';
import { loadEnv } from './env.mjs';
import { requireUrl } from './db-util.mjs';

loadEnv();
requireUrl();
for (let i = 1; i <= 60; i++) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await c.connect();
    await c.end();
    console.log('Өгөгдлийн сан бэлэн.');
    process.exit(0);
  } catch (e) {
    console.log(`Өгөгдлийн санг хүлээж байна (${i}/60): ${e.message}`);
    await new Promise(r => setTimeout(r, 2000));
  }
}
console.error('Өгөгдлийн санд холбогдож чадсангүй.');
process.exit(1);
