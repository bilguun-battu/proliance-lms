// Анхны админ болон жишээ өгөгдөл: npm run db:seed
// Жишээ өгөгдөл хэрэггүй бол: npm run db:seed -- --admin-only
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { loadEnv } from './env.mjs';
import { connect } from './db-util.mjs';

loadEnv();
const adminOnly = process.argv.includes('--admin-only');
const db = await connect();
if (!(await db.query(`SELECT to_regclass('public.users') AS t`)).rows[0].t) {
  console.error('\n✖ Хүснэгтүүд үүсээгүй байна. Эхлээд "npm run db:migrate" ажиллуулна уу.\n');
  process.exit(1);
}
const one = async (q, p) => (await db.query(q, p)).rows[0];

const email = (process.env.ADMIN_EMAIL || 'admin@proliance.mn').toLowerCase();
const exists = await one('SELECT id FROM users WHERE email=$1', [email]);
if (!exists) {
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Proliance2026!', 10);
  await db.query(`INSERT INTO users (email,name,role,password_hash) VALUES ($1,'Proliance админ','ADMIN',$2)`, [email, hash]);
  console.log('Админ үүслээ:', email);
} else {
  console.log('Админ аль хэдийн байна:', email);
}

const hasData = await one('SELECT count(*)::int AS n FROM courses');
if (adminOnly || hasData.n > 0) {
  await db.end();
  process.exit(0);
}


// Жишээ модульд хавсаргах энгийн PDF (бодит гарын авлагаар солигдоно)
function samplePdf(title) {
  const text = `Proliance - sample manual: ${title}`.replace(/[()\\]/g, '');
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(uploadDir, { recursive: true });
let pdfN = 0;
async function addPdf(title) {
  const name = `sample-${++pdfN}.pdf`;
  const buf = samplePdf(`module ${pdfN}`);
  fs.writeFileSync(path.join(uploadDir, name), buf);
  return (await one('INSERT INTO files (name,mime,size,path) VALUES ($1,$2,$3,$4) RETURNING id', [`${title}.pdf`, 'application/pdf', buf.length, name])).id;
}

const demoHash = await bcrypt.hash('Test1234!', 10);
const p1 = await one(`INSERT INTO products (code,name,category) VALUES ('SYS-HEM','Sysmex гематологийн анализатор','Эмнэлгийн тоног төхөөрөмж') RETURNING id`);
const p2 = await one(`INSERT INTO products (code,name,category) VALUES ('KS-ENDO','Karl Storz дурангийн систем','Эмнэлгийн тоног төхөөрөмж') RETURNING id`);
const p3 = await one(`INSERT INTO products (code,name,category) VALUES ('DES-01','Багаж ариутгалын бодис','Ариутгал, цэвэрлэгээний бодис') RETURNING id`);

const o1 = await one(`INSERT INTO orgs (name,contact_name,phone) VALUES ('Жишээ: Нэгдсэн эмнэлэг','Д. Батбаяр','99000001') RETURNING id`);
const o2 = await one(`INSERT INTO orgs (name,contact_name,phone) VALUES ('Жишээ: Мэс заслын төв','С. Оюун','99000002') RETURNING id`);
await db.query('INSERT INTO org_products VALUES ($1,$2),($1,$3),($4,$3),($1,$5),($4,$5)', [o1.id, p1.id, p2.id, o2.id, p3.id]);

const users = [
  ['coordinator@example.mn', 'Д. Батбаяр', 'COORDINATOR', 'Лабораторийн эрхлэгч', o1.id, '99000001'],
  ['enkhjin@example.mn', 'Б. Энхжин', 'LEARNER', 'Лаборант', o1.id, '99000011'],
  ['temuulen@example.mn', 'Д. Тэмүүлэн', 'LEARNER', 'Био-анагаахын инженер', o1.id, '99000012'],
  ['sarnai@example.mn', 'Г. Сарнай', 'LEARNER', 'Мэс заслын сувилагч', o2.id, '99000013'],
];
for (const [e, n, r, pos, org, ph] of users) {
  await db.query('INSERT INTO users (email,name,role,position,org_id,phone,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)', [e, n, r, pos, org, ph, demoHash]);
}

async function course(title, desc, productId, modules, category = 'ELEARN') {
  const c = await one('INSERT INTO courses (title,description,category) VALUES ($1,$2,$3) RETURNING id', [title, desc, category]);
  await db.query('INSERT INTO course_products VALUES ($1,$2)', [c.id, productId]);
  const v = await one(`INSERT INTO course_versions (course_id,number,status,notes,published_at) VALUES ($1,1,'PUBLISHED','Анхны хувилбар.',now()) RETURNING id`, [c.id]);
  let pos = 1;
  for (const m of modules) {
    const mod = await one(
      `INSERT INTO modules (version_id,module_key,position,title,description,duration_min,pdf_file,format) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [v.id, 'm' + pos, pos, m.title, m.desc, m.dur, m.format && m.format !== 'ELEARN' ? null : await addPdf(m.title), m.format || 'ELEARN']
    );
    let qp = 1;
    for (const q of m.questions) {
      await db.query('INSERT INTO questions (module_id,position,text,options,correct_index) VALUES ($1,$2,$3,$4,$5)', [mod.id, qp++, q[0], JSON.stringify(q[1]), q[2]]);
    }
    pos++;
  }
}

await course('Гематологийн анализаторын ашиглалт', 'Sysmex анализаторыг аюулгүй, зөв ашиглах үндсэн сургалт.', p1.id, [
  { title: 'Биологийн аюулгүй байдал', desc: 'Дээжтэй ажиллах, хамгаалах хэрэгсэл, хог хаягдал.', dur: 20, questions: [
    ['Цусны дээжтэй ажиллахдаа заавал юу өмсөх вэ?', ['Бээлий', 'Малгай', 'Цаг'], 0],
    ['Хэрэглэсэн зүүг хаана хаях вэ?', ['Энгийн хогийн саванд', 'Хурц үзүүртэй хог хаягдлын саванд', 'Угаалтуурт'], 1],
  ] },
  { title: 'Өдөр тутмын ашиглалт, чанарын хяналт', desc: 'Асаах, чанарын хяналт хийх, дээж ажиллуулах дараалал.', dur: 30, questions: [
    ['Чанарын хяналтыг хэзээ хийх вэ?', ['Долоо хоногт нэг', 'Өдөр бүр ажил эхлэхийн өмнө', 'Алдаа гарахад л'], 1],
  ] },
  { title: 'Урвалж солих, арчилгаа (дадлага)', desc: 'Анализатор дээр урвалж солих, цэвэрлэгээ хийх гар ажиллагааны дадлага.', dur: 120, format: 'INPERSON', questions: [] },
  { title: 'Алдааны мэдээлэл ба оношлогоо', desc: 'Инженертэй онлайн уулзалт: түгээмэл алдаа, шийдвэрлэх арга.', dur: 60, format: 'ONLINE', questions: [] },
], 'BLENDED');
await course('Дурангийн системийн ашиглалт, ариутгал', 'Karl Storz дурангийн системийг ашиглах, цэвэрлэх, ариутгах.', p2.id, [
  { title: 'Системийн танилцуулга', desc: 'Үндсэн хэсгүүд, холболт.', dur: 15, questions: [] },
  { title: 'Цэвэрлэх, ариутгах журам', desc: 'Хэрэглэсний дараах цэвэрлэгээ, ариутгалын дараалал.', dur: 30, questions: [
    ['Дуранг хэрэглэсний дараа хамгийн түрүүнд юу хийх вэ?', ['Шууд ариутгах', 'Урьдчилсан цэвэрлэгээ хийх', 'Хатаах'], 1],
  ] },
  { title: 'Ариутгалын дадлага', desc: 'Харилцагчийн эмнэлэг дээр гар ажиллагааны дадлага.', dur: 180, format: 'INPERSON', questions: [] },
], 'BLENDED');
// Тус бүр нэг хэлбэрийн сургалт: цахим, онлайн
await course('Ариутгалын бодисын зөв хэрэглээ', 'Бодисыг найруулах, хэрэглэх, хадгалах заавар. Бие даан үзэх цахим сургалт.', p3.id, [
  { title: 'Найруулах, хэрэглэх', desc: 'Найруулгын харьцаа, үйлчлэх хугацаа.', dur: 15, questions: [
    ['Ариутгалын бодисыг ямар харьцаагаар найруулах вэ?', ['Үйлдвэрлэгчийн зааврын дагуу', 'Нүдээрээ тааруулж', 'Аль болох өтгөн'], 0],
  ] },
  { title: 'Хадгалах, аюулгүй ажиллагаа', desc: 'Хадгалах нөхцөл, хамгаалах хэрэгсэл.', dur: 10, questions: [
    ['Бодистой ажиллахдаа юу хэрэглэх вэ?', ['Бээлий, нүдний шил', 'Юу ч хэрэггүй', 'Зөвхөн малгай'], 0],
  ] },
], 'ELEARN');
await course('Sysmex программын шинэчлэлтийн танилцуулга', 'Шинэ программын боломжуудыг инженер онлайнаар танилцуулна.', p1.id, [
  { title: 'Шинэ программын танилцуулга', desc: 'Онлайн уулзалт: шинэ цэс, тохиргоо, асуулт хариулт.', dur: 60, format: 'ONLINE', questions: [] },
], 'ONLINE');

// Ирэх хичээлийн хуваарь
const courseRows = (await db.query('SELECT id, title FROM courses')).rows;
const c1 = courseRows.find(c => c.title.startsWith('Гематолог')).id, c2 = courseRows.find(c => c.title.startsWith('Дуранг')).id;
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
await db.query(`INSERT INTO sessions (course_id,module_key,starts_at,duration_min,location,instructor,seats) VALUES
  ($1,'m3',($3 || ' 10:00+08')::timestamptz,120,'Proliance сургалтын танхим, Midtown оффис, 3 давхар','Б. Ганбаатар, инженер',12),
  ($1,'m3',($4 || ' 14:00+08')::timestamptz,120,'Proliance сургалтын танхим, Midtown оффис, 3 давхар','Б. Ганбаатар, инженер',12),
  ($2,'m3',($5 || ' 09:30+08')::timestamptz,180,'Харилцагчийн эмнэлэг дээр','С. Номин, инженер',8)`, [c1, c2, day(7), day(14), day(20)]);
await db.query(`INSERT INTO sessions (course_id,module_key,starts_at,duration_min,location,link,instructor,seats) VALUES
  ($1,'m4',($2 || ' 15:00+08')::timestamptz,60,'Онлайн','https://meet.google.com/abc-defg-hij','Б. Ганбаатар, инженер',30)`, [c1, day(5)]);

// Жишээ шалгалт: 2 хувилбартай
const ex = (await db.query(`INSERT INTO exams (course_id,module_key,title,duration_min,pass_score) VALUES ($1,'m3','Урвалж солих дадлагын шалгалт',15,70) RETURNING id`, [c1])).rows[0];
const bank = {
  'А хувилбар': [
    ['Урвалж солихын өмнө юуг шалгах вэ?', ['Дуусах хугацаа', 'Савны өнгө', 'Үнэ'], 0],
    ['Урвалж солисны дараа юу хийх вэ?', ['Шууд дээж ажиллуулах', 'Чанарын хяналт хийх', 'Төхөөрөмжийг унтраах'], 1],
    ['Хэрэглэсэн урвалжийн савыг хаана хаях вэ?', ['Энгийн хогт', 'Химийн хог хаягдлын саванд', 'Угаалтуурт'], 1],
  ],
  'Б хувилбар': [
    ['Урвалжийг ямар температурт хадгалах вэ?', ['Үйлдвэрлэгчийн зааврын дагуу', 'Өрөөний температурт үргэлж', 'Хөлдөөж'], 0],
    ['Урвалж солих үед ямар хамгаалах хэрэгсэл хэрэглэх вэ?', ['Бээлий, нүдний шил', 'Ямар ч хэрэггүй', 'Зөвхөн маск'], 0],
    ['Урвалж солисон тухай хаана бүртгэх вэ?', ['Бүртгэх шаардлагагүй', 'Төхөөрөмжийн бүртгэлийн дэвтэрт', 'Утсандаа'], 1],
  ],
};
let vp = 1;
for (const [name, qs] of Object.entries(bank)) {
  const v = (await db.query('INSERT INTO exam_variants (exam_id,name,position) VALUES ($1,$2,$3) RETURNING id', [ex.id, name, vp++])).rows[0];
  let qp = 1;
  for (const q of qs) await db.query('INSERT INTO exam_questions (variant_id,position,text,options,correct_index) VALUES ($1,$2,$3,$4,$5)', [v.id, qp++, q[0], JSON.stringify(q[1]), q[2]]);
}

// Жишээ үнэлгээний маягт: хичээлийн төрөл бүрт
const evalQs = (online) => [
  ['Хичээлийн агуулга', 'RATING', 'Хичээлийн агуулга ажилд тань хэр хэрэгтэй байсан бэ?'],
  ['Хичээлийн агуулга', 'RATING', 'Материал ойлгомжтой, хангалттай байсан уу?'],
  ['Багшийн заах арга', 'RATING', 'Багш сэдвээ хэр сайн тайлбарласан бэ?'],
  ['Багшийн заах арга', 'RATING', 'Асуултад тодорхой, хангалттай хариулсан уу?'],
  ['Багшийн заах арга', 'RATING', online ? 'Жишээ, үзүүлэн хангалттай байсан уу?' : 'Дадлага, жишээ хангалттай байсан уу?'],
  ['Зохион байгуулалт', 'CHOICE', 'Хичээлийн үргэлжлэх хугацаа', ['Хэт богино', 'Тохиромжтой', 'Хэт урт']],
  ['Зохион байгуулалт', 'RATING', online ? 'Дуу, дүрсний чанар' : 'Орчин, тоног төхөөрөмжийн бэлэн байдал'],
  ['Санал', 'TEXT', 'Юуг сайжруулбал зохих вэ?', [], false],
];
for (const [name, format, online] of [['Биечлэн хичээлийн үнэлгээ', 'INPERSON', false], ['Онлайн хичээлийн үнэлгээ', 'ONLINE', true]]) {
  const t = (await db.query('INSERT INTO eval_templates (name,format,anonymous) VALUES ($1,$2,true) RETURNING id', [name, format])).rows[0];
  let p = 1;
  for (const [section, kind, text, opts = [], req = true] of evalQs(online)) {
    await db.query('INSERT INTO eval_questions (template_id,position,section,kind,text,options,required) VALUES ($1,$2,$3,$4,$5,$6,$7)', [t.id, p++, section, kind, text, JSON.stringify(opts), req]);
  }
}

// ===== Дотоод сургалт: Proliance-ийн ажилтнууд =====
const io = (await db.query(`INSERT INTO orgs (name,contact_name,is_internal) VALUES ('Пролианс ХХК','Хүний нөөц',true) RETURNING id`)).rows[0];
const staff = {};
for (const [email, name, pos, dept, daysAgo] of [
  ['ganbaatar@proliance.mn', 'О. Ганбаатар', 'Ахлах инженер', 'Инженерийн алба', 400],
  ['munkhzul@proliance.mn', 'Э. Мөнхзул', 'Борлуулалтын менежер', 'Борлуулалт', 200],
  ['baterdene@proliance.mn', 'Т. Бат-Эрдэнэ', 'Агуулахын ажилтан', 'Агуулах', 60],
  ['tuguldur@proliance.mn', 'Б. Төгөлдөр', 'Инженер', 'Инженерийн алба', 20],
]) {
  staff[email] = (await db.query(`INSERT INTO users (email,name,role,position,department,org_id,password_hash,created_at,position_since) VALUES ($1,$2,'LEARNER',$3,$4,$5,$6, now() - ($7 || ' days')::interval, now() - ($7 || ' days')::interval) RETURNING id`,
    [email, name, pos, dept, io.id, demoHash, String(daysAgo)])).rows[0].id;
}
async function internalCourse(title, desc, modules, category = 'ELEARN') {
  const c = (await db.query(`INSERT INTO courses (title,description,audience,category,for_customers,for_internal) VALUES ($1,$2,'INTERNAL',$3,false,true) RETURNING id`, [title, desc, category])).rows[0];
  const v = (await db.query(`INSERT INTO course_versions (course_id,number,status,notes,published_at) VALUES ($1,1,'PUBLISHED','Анхны хувилбар.',now() - interval '500 days') RETURNING id`, [c.id])).rows[0];
  let pos = 1;
  for (const m of modules) {
    const mod = (await db.query(`INSERT INTO modules (version_id,module_key,position,title,description,duration_min,pdf_file,format) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [v.id, 'm' + pos, pos, m.title, m.desc, m.dur, ['INPERSON', 'VOC'].includes(m.format) ? null : await addPdf(m.title), m.format || 'ELEARN'])).rows[0];
    let ip = 1;
    for (const t of m.items || []) await db.query('INSERT INTO module_items (module_id,position,text) VALUES ($1,$2,$3)', [mod.id, ip++, t]);
    let qp = 1;
    for (const q of m.questions || []) await db.query('INSERT INTO questions (module_id,position,text,options,correct_index) VALUES ($1,$2,$3,$4,$5)', [mod.id, qp++, q[0], JSON.stringify(q[1]), q[2]]);
    pos++;
  }
  return c.id;
}
const infosec = await internalCourse('Мэдээллийн аюулгүй байдал', 'Нууц үг, фишинг, харилцагчийн мэдээллийг хамгаалах.', [
  { title: 'Нууц үг ба хоёр шатлалт баталгаажуулалт', desc: 'Найдвартай нууц үг, хоёр шатлалт нэвтрэлт.', dur: 15, questions: [['Аль нь найдвартай нууц үг вэ?', ['123456', 'Нэр+төрсөн он', 'Урт, санамсаргүй хэллэг'], 2]] },
  { title: 'Фишинг имэйл таних', desc: 'Сэжигтэй имэйл, холбоосыг таних.', dur: 15, questions: [['Сэжигтэй холбоос ирвэл юу хийх вэ?', ['Шууд дарах', 'МТ-ийн албанд мэдэгдэх', 'Найздаа дамжуулах'], 1]] },
]);
const hse = await internalCourse('Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй', 'Агуулах, инженерийн ажлын аюулгүй ажиллагаа.', [
  { title: 'ХАБЭА-н үндсэн журам', desc: 'Хамгаалах хэрэгсэл, ослын үед авах арга хэмжээ.', dur: 20, questions: [['Осол гарвал хамгийн түрүүнд юу хийх вэ?', ['Ажлаа үргэлжлүүлэх', 'Аюулгүй байдлыг хангаж, удирдлагад мэдэгдэх', 'Гэртээ харих'], 1]] },
  { title: 'Галын аюулгүй байдлын дадлага', desc: 'Гал унтраагуур ашиглах, нүүлгэн шилжүүлэлт.', dur: 60, format: 'INPERSON' },
], 'BLENDED');
const firstAid = await internalCourse('Анхны тусламж', 'Ослын үед анхны тусламж үзүүлэх дадлага. Мэргэжлийн багш танхимд заана.', [
  { title: 'Анхны тусламжийн дадлага', desc: 'Зүрх-уушгины сэхээн амьдруулалт, цус тогтоох, түлэгдэл.', dur: 180, format: 'INPERSON' },
], 'INPERSON');
const productOnline = await internalCourse('Шинэ бүтээгдэхүүний танилцуулга', 'Шинээр нийлүүлж буй тоног төхөөрөмжийн онцлогийг борлуулалтын багт онлайнаар танилцуулна.', [
  { title: 'Бүтээгдэхүүний онцлог, өрсөлдөгчтэй харьцуулалт', desc: 'Онлайн уулзалт, асуулт хариулт.', dur: 90, format: 'ONLINE' },
], 'ONLINE');
await db.query(`INSERT INTO sessions (course_id,module_key,starts_at,duration_min,location,instructor,seats) VALUES ($1,'m1',($2 || ' 09:00+08')::timestamptz,180,'Proliance оффис, хурлын танхим','Улаан загалмайн нийгэмлэгийн багш',16)`, [firstAid, day(12)]);
await db.query(`INSERT INTO sessions (course_id,module_key,starts_at,duration_min,location,link,instructor,seats) VALUES ($1,'m1',($2 || ' 16:00+08')::timestamptz,90,'Онлайн','https://meet.google.com/xyz-prod-new','Бүтээгдэхүүний менежер',40)`, [productOnline, day(6)]);
await db.query(`INSERT INTO sessions (course_id,module_key,starts_at,duration_min,location,instructor,seats) VALUES ($1,'m2',($2 || ' 10:00+08')::timestamptz,60,'Proliance оффис, хурлын танхим','ХАБ-ын мэргэжилтэн',20)`, [hse, day(9)]);

// On the Job: шинэ инженер анализатор суурилуулалтыг ажлын байран дээр гүйцэтгэнэ
const ojt = await internalCourse('Анализатор суурилуулалт (On the Job)', 'Шинэ инженер туршлагатай инженерийн хяналтан дор харилцагчийн эмнэлэгт анализатор суурилуулна.', [
  { title: 'Суурилуулалтын заавартай танилцах', desc: 'Үйлдвэрлэгчийн суурилуулалтын заавар.', dur: 30, questions: [['Суурилуулалтын өмнө юуг шалгах вэ?', ['Цахилгаан, газардуулга, орчны температур', 'Зөвхөн хайрцаг', 'Юу ч шалгахгүй'], 0]] },
  { title: 'Ажлын байран дээрх суурилуулалт', desc: 'Хянагчийн дэргэд даалгавар бүрийг гүйцэтгэнэ.', dur: 480, format: 'OJT', items: [
    'Суурилуулах байрны цахилгаан, газардуулга, температурыг шалгаж бүртгэх',
    'Анализаторыг задлах, байрлуулах, тэгшлэх',
    'Урвалж, хог хаягдлын шугам холбох',
    'Анхны асаалт, өөрийгөө шалгах тест хийх',
    'Чанарын хяналтын дээж ажиллуулж үр дүнг баталгаажуулах',
    'Харилцагчид хүлээлгэн өгөх акт бөглөх',
  ] },
], 'OJT');
// VoC: инженерийн засвар үйлчилгээний ур чадварыг 2 жил тутам баталгаажуулна
const voc = await internalCourse('Гематологийн анализаторын засвар үйлчилгээ (VoC)', 'Инженерийн урьдчилан сэргийлэх засвар, гэмтэл оношлох ур чадварыг үнэлэгч баталгаажуулна.', [
  { title: 'Засвар үйлчилгээний онол', desc: 'Урьдчилан сэргийлэх засварын хуваарь, сэлбэг.', dur: 30, questions: [['Урьдчилан сэргийлэх засварыг хэр давтамжтай хийх вэ?', ['Үйлдвэрлэгчийн зааврын дагуу', 'Эвдэрсэн үед', 'Жилд нэг удаа ч хамаагүй'], 0]] },
  { title: 'Ур чадварын баталгаажуулалт', desc: 'Үнэлэгч ажлын байран дээр ажиглаж үнэлнэ.', dur: 120, format: 'VOC', items: [
    'Аюулгүй ажиллагааны (LOTO, хамгаалах хэрэгсэл) шаардлагыг мөрдөнө',
    'Урьдчилан сэргийлэх засварын шалгах хуудсыг бүрэн гүйцэтгэнэ',
    'Алдааны кодыг уншиж, шалтгааныг зөв оношилно',
    'Засварын дараа чанарын хяналт хийж, үр дүнг баталгаажуулна',
    'Засварын тайланг системд бүрэн бөглөнө',
  ] },
], 'VOC');
// Train the Trainer: дуусгасан хүн OJT, VoC болон харилцагчийн гематологийн сургалтыг заах/үнэлэх эрх авна
const ttt = await internalCourse('Сургагч багш бэлтгэх (Train the Trainer)', 'Насанд хүрэгчдэд заах арга, ажлын байран дээр үнэлэх, санал өгөх ур чадвар.', [
  { title: 'Насанд хүрэгчдэд заах зарчим', desc: 'Сургалт төлөвлөх, идэвхтэй оролцуулах арга.', dur: 40, questions: [['Насанд хүрэгчид юугаар хамгийн сайн суралцдаг вэ?', ['Зөвхөн лекц сонсох', 'Бодит ажилтай холбосон дадлага', 'Ном цээжлэх'], 1]] },
  { title: 'Ур чадвар үнэлэх, санал өгөх', desc: 'Шалгуураар үнэлэх, бүтээлч санал өгөх.', dur: 30, questions: [['VoC-д "Not yet competent" гэж юуг хэлэх вэ?', ['Ажлаас халах', 'Шалгуур бүрэн хангаагүй, дахин үнэлнэ', 'Сургалт дууссан'], 1]] },
], 'TTT');
await db.query('INSERT INTO course_trainer_targets VALUES ($1,$2),($1,$3),($1,$4)', [ttt, ojt, voc, c1]);
// Ганбаатар бол туршлагатай инженер: OJT, VoC, гематологийн сургалтын сургагч
await db.query(`INSERT INTO trainer_quals (user_id,course_id,source) VALUES ($1,$2,'MANUAL'),($1,$3,'MANUAL'),($1,$4,'MANUAL')`, [staff['ganbaatar@proliance.mn'], ojt, voc, c1]);
// Оноолт: бүх ажилтанд мэдээллийн аюулгүй байдал жил бүр; инженер, агуулахад ХАБЭА жил бүр; инженерүүдэд бүтээгдэхүүний сургалт
await db.query(`INSERT INTO assignments (course_id,target,target_value,due_days,recurrence_months,note,created_at) VALUES
  ($1,'ALL_INTERNAL',NULL,30,12,'Мэдээллийн аюулгүй байдлын журам', now() - interval '45 days'),
  ($2,'ORG',$3,45,NULL,'Харилцагчийн гэрээний дагуу', now() - interval '5 days')`, [infosec, c1, o1.id]);

// ===== Албан тушаал ба сургалтын матриц =====
const positions = [
  ['Инженер', 'Инженерийн алба'], ['Ахлах инженер', 'Инженерийн алба'],
  ['Борлуулалтын туслах', 'Борлуулалт'], ['Борлуулалтын менежер', 'Борлуулалт'], ['Агуулахын ажилтан', 'Агуулах'],
];
for (const [n, d] of positions) await db.query('INSERT INTO positions (name,department) VALUES ($1,$2) ON CONFLICT DO NOTHING', [n, d]);
// [албан тушаал, сургалт, давтамж (сар, null = нэг удаа)]
const matrix = [
  ['Инженер', ojt, null], ['Инженер', voc, 24], ['Инженер', hse, 12], ['Инженер', firstAid, 24],
  ['Ахлах инженер', voc, 24], ['Ахлах инженер', ttt, null], ['Ахлах инженер', hse, 12], ['Ахлах инженер', firstAid, 24],
  ['Борлуулалтын туслах', productOnline, null],
  ['Борлуулалтын менежер', productOnline, null],
  ['Агуулахын ажилтан', hse, 12], ['Агуулахын ажилтан', firstAid, 24],
];
for (const [pos, cid, rec] of matrix) {
  await db.query(`INSERT INTO assignments (course_id,target,target_value,due_days,recurrence_months,note,source,created_at) VALUES ($1,'POSITION',$2,30,$3,'Сургалтын матриц','MATRIX', now() - interval '450 days')`, [cid, pos, rec]);
}

// Албан тушаалын түүх: Ганбаатар инженерээс ахлах инженер, Мөнхзул туслахаас менежер болсон
const hist = [
  [staff['ganbaatar@proliance.mn'], 'Инженер', 'Инженерийн алба', 400, 100],
  [staff['ganbaatar@proliance.mn'], 'Ахлах инженер', 'Инженерийн алба', 100, null],
  [staff['munkhzul@proliance.mn'], 'Борлуулалтын туслах', 'Борлуулалт', 200, 90],
  [staff['munkhzul@proliance.mn'], 'Борлуулалтын менежер', 'Борлуулалт', 90, null],
];
for (const [uid, pos, dept, from, to] of hist) {
  await db.query(`INSERT INTO user_positions (user_id,position,department,started_at,ended_at) VALUES ($1,$2,$3,now() - ($4 || ' days')::interval, CASE WHEN $5::int IS NULL THEN NULL ELSE now() - ($5 || ' days')::interval END)`, [uid, pos, dept, String(from), to]);
}
await db.query(`UPDATE users SET position_since = now() - interval '100 days' WHERE id=$1`, [staff['ganbaatar@proliance.mn']]);
await db.query(`UPDATE users SET position_since = now() - interval '90 days' WHERE id=$1`, [staff['munkhzul@proliance.mn']]);
// Мөнхзул мэдээллийн аюулгүй байдлыг 2 сарын өмнө, Ганбаатар 13 сарын өмнө (хүчингүй болсон) дуусгасан
for (const [uid, ago] of [[staff['munkhzul@proliance.mn'], '60 days'], [staff['ganbaatar@proliance.mn'], '395 days']]) {
  for (const k of ['m1', 'm2']) await db.query(`INSERT INTO completions (user_id,course_id,module_key,mver,score,completed_at) VALUES ($1,$2,$3,1,100,now() - $4::interval)`, [uid, infosec, k, ago]);
}
// Ганбаатар инженер байхдаа OJT, анхны тусламж; Мөнхзул туслах байхдаа бүтээгдэхүүний танилцуулгад суусан
const past = [
  [staff['ganbaatar@proliance.mn'], ojt, ['m1', 'm2'], 380], [staff['ganbaatar@proliance.mn'], firstAid, ['m1'], 300],
  [staff['munkhzul@proliance.mn'], productOnline, ['m1'], 150],
];
for (const [uid, cid, keys, ago] of past) for (const k of keys) {
  await db.query(`INSERT INTO completions (user_id,course_id,module_key,mver,score,completed_at) VALUES ($1,$2,$3,1,NULL,now() - ($4 || ' days')::interval)`, [uid, cid, k, String(ago)]);
}

// Харилцагчид болон бусад ажилтны албан тушаалын эхний бичлэг
await db.query(`INSERT INTO user_positions (user_id,position,department,started_at)
  SELECT id, position, department, position_since FROM users u WHERE role <> 'ADMIN' AND NOT EXISTS (SELECT 1 FROM user_positions p WHERE p.user_id=u.id)`);

// Дууссан сургалтын гэрчилгээ (систем ажиллаж байхад автоматаар үүснэ; энд өмнөх түүхийг бөглөнө)
const done = await db.query(`
  SELECT c.user_id, c.course_id, max(c.completed_at) AS at, co.title, co.category, u.name, o.name AS org
    FROM completions c JOIN courses co ON co.id=c.course_id JOIN users u ON u.id=c.user_id LEFT JOIN orgs o ON o.id=u.org_id
   GROUP BY 1,2,4,5,6,7
  HAVING count(DISTINCT c.module_key) = (SELECT count(*) FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=c.course_id AND v.status='PUBLISHED')`);
for (const r of done.rows) {
  const pos = (await db.query('SELECT position, department FROM user_positions WHERE user_id=$1 AND started_at <= $2 ORDER BY started_at DESC LIMIT 1', [r.user_id, r.at])).rows[0] ?? {};
  const ar = (await db.query(`SELECT min(recurrence_months) AS m, count(*)::int AS n FROM assignments a JOIN users u ON u.id=$1 WHERE a.course_id=$2 AND ((a.target='POSITION' AND a.target_value=$3) OR a.target='ALL_INTERNAL')`, [r.user_id, r.course_id, pos.position])).rows[0];
  const rec = ar.m;
  const n = (await db.query(`SELECT nextval('certificate_seq') AS n`)).rows[0].n;
  const number = `PL-${new Date(r.at).getFullYear()}-${String(n).padStart(5, '0')}`;
  await db.query(`INSERT INTO certificates (number,user_id,course_id,version,course_title,category,user_name,org_name,position,department,mandatory,issued_at,valid_until)
    VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $12::int IS NULL THEN NULL ELSE $11::timestamptz + ($12::int * interval '1 month') END)`,
    [number, r.user_id, r.course_id, r.title, r.category, r.name, r.org, pos.position ?? null, pos.department ?? null, ar.n > 0, r.at, rec]);
}

console.log('Жишээ өгөгдөл орлоо. Жишээ хэрэглэгчдийн нууц үг: Test1234!');
await db.end();
