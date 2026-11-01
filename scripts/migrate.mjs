// Өгөгдлийн сангийн хүснэгтүүдийг үүсгэнэ: npm run db:migrate
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './env.mjs';
import { connect } from './db-util.mjs';

loadEnv();
const sql = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
const client = await connect();
try {
  await client.query(sql);
} catch (e) {
  console.error('\n✖ Хүснэгт үүсгэхэд алдаа гарлаа: ' + e.message + '\n');
  process.exit(1);
}
await client.end();
console.log('Өгөгдлийн сан бэлэн боллоо.');
