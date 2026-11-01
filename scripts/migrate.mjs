// Өгөгдлийн сангийн хүснэгтүүдийг үүсгэнэ: npm run db:migrate
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadEnv } from './env.mjs';

loadEnv();
const sql = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(sql);
await client.end();
console.log('Өгөгдлийн сан бэлэн боллоо.');
