import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { all, one, run, tx } from './db';
import { uploadDir } from './files';
import { learnerCourseIds } from './progress';

/*
  Сургалтын туслах: асуултад хамгийн тохирох хэсгийг сургалтын материалаас хайж олно.
  Гадны үйлчилгээ, хэлний загвар ашиглахгүй тул төлбөргүй, өгөгдөл серверээс гарахгүй.
  Хариулт нь материалын өөрийн текст тул зохиомол мэдээлэл гарахгүй.

  Монгол хэл залгамал тул үгийг эхний 5 үсгээр нь харьцуулна:
  "ариутгал", "ариутгах", "ариутгасны" → "ариут". Энэ нь энгийн боловч хэлзүйн
  задлагч шаардахгүй, ихэнх хувирлыг барьдаг.
*/

const STOP = new Set(`юу юуг юуны юунд юугаар вэ бэ уу үү юү яаж яах яахав хэрхэн ямар ямархуу хэд хэдэн хэдий хэзээ хаана хаашаа хаанаас
яагаад гэж гэх гэдэг гэсэн гэвэл нь ба болон эсвэл буюу энэ тэр эдгээр тэдгээр үүнийг түүнийг бол байна байх байдаг байгаа байсан
би бид миний манай та таны танай өөр өөрөө вэ гэхэд дээр доор дотор тухай талаар зориулсан мэдэх мэдмээр хүсч хүсэж хүсэн
ёстой хэрэгтэй шаардлагатай чадах болох болно бий уу ч л даа юм шүү the a an of to is and or in on for how what when`.split(/\s+/));

export const STEM = 5;
export function norm(s: string) {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[^0-9a-zа-яөү]+/g, ' ').trim();
}
export function stemsOf(s: string, keepStop = false) {
  return norm(s).split(' ').filter(w => w && (keepStop || !STOP.has(w)) && (w.length > 1 || /\d/.test(w))).map(w => w.slice(0, STEM));
}

/* ---------------- Индекс үүсгэх ---------------- */

// PDF-ийн текстийг хуудсаар нь задлана. Гарчиг ("1. Хамгаалах хэрэгсэл") бүрээр хэсэг эхэлнэ.
async function pdfSections(file: string) {
  const pdfjs: any = await import(/* turbopackIgnore: true */ 'pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), isEvalSupported: false, verbosity: 0 }).promise;
  const out: { page: number; heading: string; text: string }[] = [];
  let heading = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const lines = tc.items.map((x: any) => x.str + (x.hasEOL ? '\n' : '')).join('').split('\n').map((l: string) => l.trim()).filter(Boolean);
    let buf: string[] = [];
    const flush = () => { if (buf.length) out.push({ page: p, heading, text: buf.join(' ').replace(/\s+/g, ' ').trim() }); buf = []; };
    for (const l of lines) {
      if (/^\d+(\.\d+)*\.?\s+\S/.test(l) && l.length < 80 && !/[.:;]$/.test(l)) { flush(); heading = l; continue; }
      buf.push(l);
    }
    flush();
  }
  await doc.destroy();
  return out;
}

// Урт хэсгийг 2-4 өгүүлбэртэй хэсгүүдэд хуваана
function split(text: string, max = 480) {
  const sents = sentences(text);
  const out: string[] = [];
  let cur = '';
  for (const s of sents) {
    if (cur && (cur + ' ' + s).length > max) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
  }
  if (cur) out.push(cur);
  return out;
}
export function sentences(text: string) {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[«"(А-ЯӨҮЁA-Z0-9])/).map(s => s.trim()).filter(Boolean);
}

export async function reindexCourse(courseId: string) {
  const c = await one<any>('SELECT id, title, description FROM courses WHERE id=$1', [courseId]);
  const v = await one<any>(`SELECT id FROM course_versions WHERE course_id=$1 AND status='PUBLISHED' ORDER BY number DESC LIMIT 1`, [courseId]);
  if (!c || !v) { await run('DELETE FROM kb_chunks WHERE course_id=$1', [courseId]); return { chunks: 0, failed: [] as string[] }; }
  const mods = await all<any>(`SELECT m.module_key, m.title, m.description, f.path, f.name FROM modules m LEFT JOIN files f ON f.id=m.pdf_file
     WHERE m.version_id=$1 ORDER BY m.position`, [v.id]);
  const rows: [string | null, string, string, string, number | null, string][] = [];
  if (c.description?.trim()) rows.push([null, 'COURSE', c.title, 'Сургалтын тухай', null, c.description.trim()]);
  const failed: string[] = [];
  for (const m of mods) {
    if (m.description?.trim()) rows.push([m.module_key, 'MODULE', m.title, 'Модулийн тайлбар', null, `${m.title}. ${m.description.trim()}`]);
    if (!m.path) continue;
    try {
      for (const s of await pdfSections(path.join(uploadDir(), m.path)))
        for (const t of split(s.text)) rows.push([m.module_key, 'PDF', m.title, s.heading, s.page, t]);
    } catch { failed.push(m.title); }
  }
  await tx(async db => {
    await run('DELETE FROM kb_chunks WHERE course_id=$1', [courseId], db);
    for (const [key, src, dt, h, pg, t] of rows)
      await run(`INSERT INTO kb_chunks (course_id,version_id,module_key,source,doc_title,heading,page,text,stems) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [courseId, v.id, key, src, dt, h, pg, t, stemsOf(`${h} ${t}`)], db);
  });
  return { chunks: rows.length, failed };
}

// Нийтлэгдсэн хувилбар нь индекслэгдээгүй сургалтуудыг шинэчилнэ (асуулт ирэхэд автоматаар)
export async function ensureIndexed(courseIds: string[]) {
  if (!courseIds.length) return;
  const stale = await all<{ course_id: string }>(`
    SELECT v.course_id FROM course_versions v
     WHERE v.course_id = ANY($1) AND v.status='PUBLISHED'
       AND v.number = (SELECT max(number) FROM course_versions x WHERE x.course_id=v.course_id AND x.status='PUBLISHED')
       AND NOT EXISTS (SELECT 1 FROM kb_chunks k WHERE k.version_id=v.id)`, [courseIds]);
  for (const s of stale) await reindexCourse(s.course_id).catch(() => {});
}

/* ---------------- Хайлт ---------------- */

type Doc = { id: string; kind: 'CHUNK' | 'FAQ'; course_id: string | null; course_title: string; module_key: string | null; source: string;
  doc_title: string; heading: string; page: number | null; text: string; question?: string; stems: string[] };

export type Hit = {
  kind: 'CHUNK' | 'FAQ'; courseId: string | null; courseTitle: string; moduleKey: string | null; source: string;
  docTitle: string; heading: string; page: number | null; answer: string; context: string; question?: string;
  score: number; confidence: number; coverage: number; terms: string[];
};

const k1 = 1.2, b = 0.75;

// Ойролцоо утгатай үгс (эхний 5 үсгээр). Асуултад нэг нь орвол бусдыг нь бага жингээр хайна.
const SYN: string[][] = [
  ['хугац', 'хоног', 'цаг', 'өдөр'], ['qc', 'чанар'], ['холбо', 'ханда', 'залга', 'утас'], ['алдаа', 'анхаа'], ['хаях', 'хая', 'зайлу'],
];

// Үгсийн таарц: 1 бүрэн; богино үг нь нөгөөгийнхөө угтвар бол 1 ("зүү" ~ "зүүг");
// үндэс нь ижил бол 0.6 ("хаях" ~ "хаяна")
export function ms(t: string, d: string) {
  if (d === t) return 1;
  const mn = Math.min(t.length, d.length);
  if (mn >= 3 && Math.abs(t.length - d.length) <= 2 && (d.startsWith(t) || t.startsWith(d))) return 1;
  let cp = 0; while (cp < mn && t[cp] === d[cp]) cp++;
  return mn >= 4 && cp >= 3 && cp >= mn - 1 ? 0.6 : 0;
}

export async function search(q: string, courseIds: string[], limit = 4): Promise<{ hits: Hit[]; terms: string[] }> {
  const base = [...new Set(stemsOf(q))];
  if (!base.length) return { hits: [], terms: [] };
  // "хэзээ" гэсэн асуултын хариулт ихэвчлэн хугацаа, давтамж агуулдаг
  const asks = new Set(norm(q).split(' '));
  const qt: { t: string; w: number; of: string }[] = base.map(t => ({ t, w: 1, of: t }));
  const addSyn = (of: string, g: string[]) => { for (const x of g) if (!qt.some(y => ms(y.t, x) === 1)) qt.push({ t: x, w: 0.5, of }); };
  for (const t of base) for (const g of SYN) if (g.some(x => ms(t, x) === 1)) addSyn(t, g);
  if (asks.has('хэзээ')) addSyn('хэзээ', [...SYN[0], 'бүр', 'дараа', 'өмнө']);
  const docs: Doc[] = [
    ...(await all<Doc>(`SELECT k.id, 'CHUNK' AS kind, k.course_id, c.title AS course_title, k.module_key, k.source, k.doc_title, k.heading, k.page, k.text, k.stems
       FROM kb_chunks k JOIN courses c ON c.id=k.course_id WHERE k.course_id = ANY($1)`, [courseIds])),
    ...(await all<Doc>(`SELECT f.id, 'FAQ' AS kind, f.course_id, coalesce(c.title,'') AS course_title, NULL AS module_key, 'FAQ' AS source,
       'Түгээмэл асуулт' AS doc_title, '' AS heading, NULL AS page, f.answer AS text, f.question, f.stems
       FROM kb_faq f LEFT JOIN courses c ON c.id=f.course_id WHERE f.course_id IS NULL OR f.course_id = ANY($1)`, [courseIds])),
  ];
  const terms = qt.map(x => x.t);
  if (!docs.length) return { hits: [], terms };
  const N = docs.length;
  const avg = docs.reduce((s, d) => s + d.stems.length, 0) / N;
  const best1 = (t: string, arr: string[]) => arr.reduce((m, x) => Math.max(m, ms(t, x)), 0);
  const idfs = new Map(qt.map(({ t }) => { const df = docs.filter(d => best1(t, d.stems) > 0).length; return [t, Math.log(1 + (N - df + 0.5) / (df + 0.5))]; }));
  const idf = (t: string) => idfs.get(t) ?? 0;
  const totalW = base.reduce((s, t) => s + idf(t), 0) || 1;
  const scored = docs.map(d => {
    let score = 0, covered = 0;
    const head = stemsOf(d.heading + ' ' + (d.question ?? ''));
    const len = 1 - b + b * d.stems.length / avg;
    for (const { t, w } of qt) {
      const tf = d.stems.reduce((a, x) => a + ms(t, x), 0);
      if (!tf) continue;
      score += w * idf(t) * (tf * (k1 + 1)) / (tf + k1 * len);
      score += w * idf(t) * 0.6 * best1(t, head);
    }
    // Хамрах хувь: асуултын үг бүр (эсвэл түүний ойролцоо үг хагас жингээр) орсон эсэх
    for (const t of base)
      covered += idf(t) * Math.max(best1(t, d.stems), ...qt.filter(x => x.of === t && x.t !== t).map(x => 0.5 * best1(x.t, d.stems)));
    // Асуултын хоёр үг дараалан орсон бол нэмэлт оноо
    for (let i = 0; i + 1 < base.length; i++) for (let j = 0; j + 1 < d.stems.length; j++)
      if (ms(base[i], d.stems[j]) && ms(base[i + 1], d.stems[j + 1])) { score += 0.25 * (idf(base[i]) + idf(base[i + 1])); break; }
    if (d.kind === 'FAQ') score *= 1.25;
    // Гарын авлагын дэлгэрэнгүй текстийг модулийн товч тайлбараас илүүд үзнэ
    if (d.source === 'MODULE' || d.source === 'COURSE') score *= 0.75;
    return { d, score, cov: Math.min(1, covered / totalW) };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

  const best = scored[0]?.score ?? 1;
  const hits = scored.slice(0, limit).map(({ d, score, cov }) => {
    const ans = d.kind === 'FAQ' ? d.text : bestPassage(d.text, qt, idf);
    // Итгэлцэл: асуултын чухал үгсийн хэдэн хувь орсон, мөн тэргүүн хариулттай харьцуулсан оноо
    const confidence = Math.round(100 * Math.min(1, cov * 0.75 + (score / best) * 0.25)) / 100;
    return { kind: d.kind, courseId: d.course_id, courseTitle: d.course_title, moduleKey: d.module_key, source: d.source, docTitle: d.doc_title,
      heading: d.heading, page: d.page, answer: ans, context: d.text, question: d.question, score: Math.round(score * 100) / 100, confidence,
      coverage: Math.round(cov * 100) / 100, terms };
  });
  return { hits, terms };
}

// Хэсгээс асуултад хамгийн их таарах 1-2 дараалсан өгүүлбэрийг сонгоно
function bestPassage(text: string, qt: { t: string; w: number; of: string }[], idf: (t: string) => number) {
  const ss = sentences(text);
  if (ss.length <= 2) return text;
  const sc = ss.map(s => { const st = stemsOf(s); return qt.reduce((a, { t, w }) => a + w * idf(t) * st.reduce((m, x) => Math.max(m, ms(t, x)), 0), 0); });
  let bi = 0, bv = -1;
  for (let i = 0; i < ss.length; i++) {
    const v = sc[i] + (i + 1 < ss.length ? sc[i + 1] * 0.6 : 0);
    if (v > bv) { bv = v; bi = i; }
  }
  const two = bi + 1 < ss.length && (sc[bi + 1] > 0 || ss[bi].length < 120);
  return two ? `${ss[bi]} ${ss[bi + 1]}` : ss[bi];
}

export const ANSWER_MIN = 0.4; // үүнээс доош бол "олдсонгүй" гэж үзнэ
// Асуултын чухал үгсийн тал хувь нь хариултад орсон байх ёстой
export const answerable = (h: { confidence: number; coverage: number }) => h.confidence >= ANSWER_MIN && h.coverage >= 0.5;
export const confLabel = (c: number) => c >= 0.75 ? 'Өндөр' : c >= 0.55 ? 'Дунд' : 'Бага';

export async function saveFaq(courseId: string | null, question: string, answer: string, by: string) {
  return one<{ id: string }>('INSERT INTO kb_faq (course_id,question,answer,stems,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [courseId, question.trim(), answer.trim(), stemsOf(`${question} ${question} ${answer}`), by]);
}

// Хэрэглэгчид нээлттэй сургалтууд. Proliance болон сургалтын админ бүх нийтлэгдсэн сургалтаас хайж туршиж болно.
export async function askScope(u: { id: string; role: string }) {
  if (u.role === 'ADMIN' || u.role === 'TRAINING_ADMIN')
    return (await all<{ id: string }>(`SELECT DISTINCT course_id AS id FROM course_versions WHERE status='PUBLISHED'`)).map(r => r.id);
  return learnerCourseIds(u.id);
}
