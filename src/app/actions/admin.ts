'use server';
import { saveFormFile, IMAGE_TYPES } from '@/lib/files';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import ExcelJS from 'exceljs';
import { all, one, run, tx } from '@/lib/db';
import { requireUser, createPasswordToken, appUrl } from '@/lib/auth';
import { sendEmail, sendSms, notifyNewVersion } from '@/lib/notify';
import { completeByAttendance, logActivity, CATEGORIES, CATEGORY_FORMATS, CATEGORY_LABEL, FORMAT_LABEL } from '@/lib/progress';
import { fmtSession } from '@/lib/format';
import { setUserPosition, startPositionHistory } from '@/lib/positions';
import { parseVideoUrl } from '@/lib/video';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const fmt = (v: string) => (['INPERSON', 'ONLINE', 'OJT', 'VOC'].includes(v) ? v : 'ELEARN');
const aud = (v: string) => (v === 'INTERNAL' ? 'INTERNAL' : 'CUSTOMER');
// Харилцагчийн болон дотоод сургалтад ижил төрлүүд (OJT, VoC, TtT орно) хэрэглэнэ
const cat = (v: string) => (CATEGORIES.includes(v) ? v : 'ELEARN');
const go = (path: string, msg: string, err = false): never =>
  redirect(`${path}${path.includes('?') ? '&' : '?'}${err ? 'err' : 'ok'}=${encodeURIComponent(msg)}`);

/* ---------------- Бүтээгдэхүүн ---------------- */
export async function saveProduct(fd: FormData) {
  await requireUser('ADMIN');
  const id = s(fd, 'id'), code = s(fd, 'code'), name = s(fd, 'name'), category = s(fd, 'category');
  if (!code || !name) go('/admin/products', 'Код болон нэрийг оруулна уу.', true);
  try {
    if (id) await run('UPDATE products SET code=$1,name=$2,category=$3 WHERE id=$4', [code, name, category, id]);
    else await run('INSERT INTO products (code,name,category) VALUES ($1,$2,$3)', [code, name, category]);
  } catch {
    go('/admin/products', `"${code}" код аль хэдийн бүртгэлтэй байна.`, true);
  }
  go('/admin/products', id ? 'Бүтээгдэхүүн шинэчлэгдлээ.' : 'Бүтээгдэхүүн нэмэгдлээ.');
}

// Бүтээгдэхүүний хуудаснаас холбогдох сургалтуудыг нэмэх; хүсвэл бүтээгдэхүүнтэй байгууллагуудад заавал хамрагдах болгож оноох
export async function linkProductCourses(fd: FormData) {
  await requireUser('ADMIN');
  const pid = s(fd, 'product_id');
  const back = `/admin/products/${pid}`;
  const ids = fd.getAll('courses').map(String).filter(Boolean);
  if (!ids.length) go(back, 'Сургалт сонгоно уу.', true);
  const mandatory = fd.get('mandatory') === 'on';
  let assigned = 0;
  await tx(async c => {
    for (const id of ids) await run('INSERT INTO course_products VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, pid], c);
    if (!mandatory) return;
    const orgs = await all<{ org_id: string }>(`SELECT op.org_id FROM org_products op JOIN orgs o ON o.id=op.org_id WHERE op.product_id=$1 AND NOT coalesce(o.is_internal,false)`, [pid], c);
    const custIds = (await all<{ id: string }>(`SELECT id FROM courses WHERE id = ANY($1) AND audience='CUSTOMER'`, [ids], c)).map(r => r.id);
    for (const cid of custIds) for (const o of orgs) {
      if (await one(`SELECT 1 FROM assignments WHERE course_id=$1 AND target='ORG' AND target_value=$2`, [cid, o.org_id], c)) continue;
      await run(`INSERT INTO assignments (course_id,target,target_value,due_days,recurrence_months,note) VALUES ($1,'ORG',$2,$3,$4,$5)`,
        [cid, o.org_id, Number(s(fd, 'due_days')) || 30, Number(s(fd, 'recurrence_months')) || null, `Бүтээгдэхүүн: ${s(fd, 'code')}`], c);
      assigned++;
    }
  });
  go(back, `${ids.length} сургалт холбогдлоо.` + (mandatory ? ` ${assigned} байгууллагад заавал хамрагдах сургалтаар оноогдлоо.` : ''));
}

export async function unlinkProductCourse(fd: FormData) {
  await requireUser('ADMIN');
  await run('DELETE FROM course_products WHERE product_id=$1 AND course_id=$2', [s(fd, 'product_id'), s(fd, 'course_id')]);
  go(`/admin/products/${s(fd, 'product_id')}`, 'Сургалт бүтээгдэхүүнээс хасагдлаа.');
}

export async function deleteProduct(fd: FormData) {
  await requireUser('ADMIN');
  await run('DELETE FROM products WHERE id=$1', [s(fd, 'id')]);
  go('/admin/products', 'Бүтээгдэхүүн устгагдлаа.');
}

/* ---------------- Байгууллага ---------------- */
export async function saveOrg(fd: FormData) {
  await requireUser('ADMIN');
  const id = s(fd, 'id'), name = s(fd, 'name');
  if (!name) go('/admin/orgs', 'Байгууллагын нэрийг оруулна уу.', true);
  const products = fd.getAll('products').map(String);
  await tx(async c => {
    let orgId = id;
    const internal = fd.get('is_internal') === 'on';
    if (id) await run('UPDATE orgs SET name=$1,contact_name=$2,phone=$3,is_internal=$4 WHERE id=$5', [name, s(fd, 'contact_name'), s(fd, 'phone'), internal, id], c);
    else orgId = (await one<{ id: string }>('INSERT INTO orgs (name,contact_name,phone,is_internal) VALUES ($1,$2,$3,$4) RETURNING id', [name, s(fd, 'contact_name'), s(fd, 'phone'), internal], c))!.id;
    await run('DELETE FROM org_products WHERE org_id=$1', [orgId], c);
    for (const p of products) await run('INSERT INTO org_products VALUES ($1,$2)', [orgId, p], c);
  });
  go('/admin/orgs', id ? 'Байгууллага шинэчлэгдлээ.' : 'Байгууллага нэмэгдлээ.');
}

export async function deleteOrg(fd: FormData) {
  await requireUser('ADMIN');
  const id = s(fd, 'id');
  const n = await one<{ n: number }>('SELECT count(*)::int AS n FROM users WHERE org_id=$1', [id]);
  if (n!.n > 0) go('/admin/orgs', 'Ажилтантай байгууллагыг устгах боломжгүй. Эхлээд ажилтнуудыг шилжүүлнэ үү.', true);
  await run('DELETE FROM orgs WHERE id=$1', [id]);
  go('/admin/orgs', 'Байгууллага устгагдлаа.');
}

/* ---------------- Суралцагч ---------------- */
async function invite(userId: string, email: string, name: string) {
  const token = await createPasswordToken(userId, 72);
  await sendEmail(email, 'Proliance сургалтын системд урилга',
    `Сайн байна уу, ${name}.\n\nТанд Proliance-ийн цахим сургалтын системд нэвтрэх эрх олгогдлоо.\nДоорх холбоосоор нууц үгээ тохируулна уу (72 цаг хүчинтэй):\n${appUrl(`/reset/${token}`)}\n\nНэвтрэх хаяг: ${appUrl('/login')}`);
}

// Сургагч, Сургалтын админ эрх зөвхөн Proliance-ийн (дотоод) ажилтанд олгогдоно
async function checkRole(role: string, orgId: string | null, back: string) {
  if (!['ADMIN', 'TRAINING_ADMIN', 'TRAINER', 'COORDINATOR', 'LEARNER'].includes(role)) go(back, 'Эрх буруу байна.', true);
  if (role === 'TRAINER' || role === 'TRAINING_ADMIN') {
    const o = orgId ? await one<{ is_internal: boolean }>('SELECT is_internal FROM orgs WHERE id=$1', [orgId]) : null;
    if (!o?.is_internal) go(back, 'Сургагч болон Сургалтын админ эрхийг зөвхөн Proliance-ийн ажилтанд олгоно.', true);
  }
}

async function addUser(fd: FormData, forcedOrg?: string, back = '/admin/learners') {
  const email = s(fd, 'email').toLowerCase(), name = s(fd, 'name');
  const role = forcedOrg ? 'LEARNER' : (s(fd, 'role') || 'LEARNER');
  const orgId = forcedOrg ?? (s(fd, 'org_id') || null);
  if (!email || !name) go(back, 'Нэр болон имэйлийг оруулна уу.', true);
  if (role !== 'ADMIN' && !orgId) go(back, 'Байгууллагаа сонгоно уу.', true);
  await checkRole(role, orgId, back);
  const exists = await one('SELECT id FROM users WHERE email=$1', [email]);
  if (exists) go(back, `${email} имэйл аль хэдийн бүртгэлтэй байна.`, true);
  const u = await one<{ id: string }>(
    'INSERT INTO users (email,name,phone,position,role,org_id,department) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [email, name, s(fd, 'phone') || null, s(fd, 'position') || null, role, role === 'ADMIN' ? null : orgId, s(fd, 'department') || null]);
  await startPositionHistory(u!.id);
  await invite(u!.id, email, name);
  go(back, `${name} нэмэгдэж, урилга илгээгдлээ.`);
}

export async function createUser(fd: FormData) {
  await requireUser('ADMIN');
  await addUser(fd);
}

// Байгууллагын хариуцагч өөрийн ажилтныг нэмнэ
export async function coordinatorAddLearner(fd: FormData) {
  const me = await requireUser('COORDINATOR');
  await addUser(fd, me.orgId!, '/org');
}

export async function updateUser(fd: FormData) {
  await requireUser('ADMIN');
  const id = s(fd, 'id');
  await checkRole(s(fd, 'role'), s(fd, 'org_id') || null, s(fd, 'back') || '/admin/learners');
  await run('UPDATE users SET name=$1,phone=$2,role=$3,org_id=$4 WHERE id=$5',
    [s(fd, 'name'), s(fd, 'phone') || null, s(fd, 'role'), s(fd, 'org_id') || null, id]);
  const moved = await setUserPosition(id, s(fd, 'position') || null, s(fd, 'department') || null);
  go(s(fd, 'back') || '/admin/learners', moved ? 'Хэрэглэгч шинэчлэгдлээ. Албан тушаал өөрчлөгдсөн тул шинэ заавал хамрагдах сургалтууд автоматаар оноогдож, мэдэгдэл очлоо.' : 'Хэрэглэгч шинэчлэгдлээ.');
}

export async function toggleUser(fd: FormData) {
  const me = await requireUser('ADMIN');
  const id = s(fd, 'id');
  if (id === me.id) go('/admin/learners', 'Өөрийн эрхийг идэвхгүй болгох боломжгүй.', true);
  await run('UPDATE users SET active = NOT active WHERE id=$1', [id]);
  go('/admin/learners', 'Төлөв өөрчлөгдлөө.');
}

export async function resendInvite(fd: FormData) {
  const me = await requireUser('ADMIN', 'COORDINATOR');
  const u = await one<any>('SELECT id,email,name,org_id FROM users WHERE id=$1', [s(fd, 'id')]);
  if (u && (me.role === 'ADMIN' || u.org_id === me.orgId)) await invite(u.id, u.email, u.name);
  go(s(fd, 'back') || '/admin/learners', 'Урилга дахин илгээгдлээ.');
}

// Excel-ээс олноор оруулах. Багана: Нэр | Албан тушаал | Имэйл | Утас | Байгууллага
export async function importLearners(fd: FormData) {
  await requireUser('ADMIN');
  const file = fd.get('file') as File | null;
  if (!file || !file.size) go('/admin/learners', 'Excel файл сонгоно уу.', true);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await file!.arrayBuffer()) as any);
  const ws = wb.worksheets[0];
  const orgs = await all<{ id: string; name: string }>('SELECT id, name FROM orgs');
  const orgByName = new Map(orgs.map(o => [o.name.trim().toLowerCase(), o.id]));
  let added = 0; const skipped: string[] = [];
  const rows: string[][] = [];
  ws.eachRow((r, i) => { if (i > 1) rows.push([1, 2, 3, 4, 5, 6].map(c => String(r.getCell(c).text ?? '').trim())); });
  for (const [name, position, emailRaw, phone, orgName, department] of rows) {
    const email = emailRaw.toLowerCase();
    if (!name || !email) continue;
    const orgId = orgByName.get(orgName.toLowerCase());
    if (!orgId) { skipped.push(`${email} (байгууллага олдсонгүй)`); continue; }
    if (await one('SELECT 1 FROM users WHERE email=$1', [email])) { skipped.push(`${email} (бүртгэлтэй)`); continue; }
    const u = await one<{ id: string }>('INSERT INTO users (email,name,phone,position,role,org_id,department) VALUES ($1,$2,$3,$4,\'LEARNER\',$5,$6) RETURNING id',
      [email, name, phone || null, position || null, orgId, department || null]);
    await startPositionHistory(u!.id);
    await invite(u!.id, email, name);
    added++;
  }
  go('/admin/learners', `${added} суралцагч нэмэгдлээ.` + (skipped.length ? ` Алгассан: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}` : ''), added === 0 && skipped.length > 0);
}

/* ---------------- Сургалт ---------------- */
export async function createCourse(fd: FormData) {
  await requireUser('ADMIN');
  const title = s(fd, 'title');
  if (!title) go('/admin/courses/new', 'Сургалтын нэрийг оруулна уу.', true);
  const cover = await saveFormFile(fd.get('cover') as File | null, IMAGE_TYPES, 5);
  if (cover && typeof cover === 'object') go('/admin/courses/new', cover.error, true);
  const id = await tx(async c => {
    const a = aud(s(fd, 'audience'));
    const course = await one<{ id: string }>('INSERT INTO courses (title,description,due_days,sequential,audience,category) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [title, s(fd, 'description'), Number(s(fd, 'due_days')) || 30, fd.get('sequential') === 'on', a, cat(s(fd, 'category'))], c);
    for (const p of fd.getAll('products')) await run('INSERT INTO course_products VALUES ($1,$2)', [course!.id, String(p)], c);
    for (const t of fd.getAll('targets')) await run('INSERT INTO course_trainer_targets VALUES ($1,$2) ON CONFLICT DO NOTHING', [course!.id, String(t)], c);
    if (typeof cover === 'string') await run('UPDATE courses SET cover_file=$1 WHERE id=$2', [cover, course!.id], c);
    await run(`INSERT INTO course_versions (course_id,number,status) VALUES ($1,1,'DRAFT')`, [course!.id], c);
    return course!.id;
  });
  redirect(`/admin/courses/${id}/draft?ok=${encodeURIComponent('Сургалт үүслээ. Модулиудаа нэмнэ үү.')}`);
}

export async function updateCourse(fd: FormData) {
  await requireUser('ADMIN');
  const id = s(fd, 'id');
  const cover = await saveFormFile(fd.get('cover') as File | null, IMAGE_TYPES, 5);
  if (cover && typeof cover === 'object') go(`/admin/courses/${id}`, cover.error, true);
  await tx(async c => {
    const a = aud(s(fd, 'audience'));
    if (typeof cover === 'string') await run('UPDATE courses SET cover_file=$1 WHERE id=$2', [cover, id], c);
    else if (fd.get('remove_cover') === 'on') await run('UPDATE courses SET cover_file=NULL WHERE id=$1', [id], c);
    await run('UPDATE courses SET title=$1,description=$2,due_days=$3,sequential=$4,audience=$5,category=$6 WHERE id=$7',
      [s(fd, 'title'), s(fd, 'description'), Number(s(fd, 'due_days')) || 30, fd.get('sequential') === 'on', a, cat(s(fd, 'category')), id], c);
    await run('DELETE FROM course_products WHERE course_id=$1', [id], c);
    for (const p of fd.getAll('products')) await run('INSERT INTO course_products VALUES ($1,$2)', [id, String(p)], c);
    await run('DELETE FROM course_trainer_targets WHERE course_id=$1', [id], c);
    for (const t of fd.getAll('targets')) if (String(t) !== id) await run('INSERT INTO course_trainer_targets VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, String(t)], c);
  });
  go(`/admin/courses/${id}`, 'Сургалтын тохиргоо хадгалагдлаа.');
}

// Нийтлэгдсэн хувилбараас шинэ ноорог үүсгэнэ
export async function startDraft(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id');
  await tx(async c => {
    const existing = await one(`SELECT id FROM course_versions WHERE course_id=$1 AND status='DRAFT'`, [courseId], c);
    if (existing) return;
    const pub = await one<any>(`SELECT * FROM course_versions WHERE course_id=$1 AND status='PUBLISHED' ORDER BY number DESC LIMIT 1`, [courseId], c);
    const draft = await one<{ id: string }>(`INSERT INTO course_versions (course_id,number,status) VALUES ($1,$2,'DRAFT') RETURNING id`, [courseId, (pub?.number ?? 0) + 1], c);
    if (!pub) return;
    const mods = await all<any>('SELECT * FROM modules WHERE version_id=$1 ORDER BY position', [pub.id], c);
    for (const m of mods) {
      const nm = await one<{ id: string }>(
        `INSERT INTO modules (version_id,module_key,position,title,description,duration_min,video_file,pdf_file,pass_score,mver,added_in,change,mandatory,format,video_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'SAME',$12,$13,$14) RETURNING id`,
        [draft!.id, m.module_key, m.position, m.title, m.description, m.duration_min, m.video_file, m.pdf_file, m.pass_score, m.mver, m.added_in, m.mandatory, m.format, m.video_url], c);
      await run('INSERT INTO questions (module_id,position,text,options,correct_index) SELECT $1,position,text,options,correct_index FROM questions WHERE module_id=$2', [nm!.id, m.id], c);
      await run('INSERT INTO module_items (module_id,position,text) SELECT $1,position,text FROM module_items WHERE module_id=$2', [nm!.id, m.id], c);
    }
  });
  redirect(`/admin/courses/${courseId}/draft`);
}

export async function discardDraft(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id');
  const pub = await one(`SELECT 1 FROM course_versions WHERE course_id=$1 AND status='PUBLISHED'`, [courseId]);
  if (!pub) go(`/admin/courses/${courseId}/draft`, 'Анхны хувилбарыг устгах боломжгүй. Сургалтыг бүхэлд нь устгана уу.', true);
  await run(`DELETE FROM course_versions WHERE course_id=$1 AND status='DRAFT'`, [courseId]);
  go(`/admin/courses/${courseId}`, 'Ноорог устгагдлаа.');
}

export async function deleteCourse(fd: FormData) {
  await requireUser('ADMIN');
  await run('DELETE FROM courses WHERE id=$1', [s(fd, 'course_id')]);
  go('/admin/courses', 'Сургалт устгагдлаа.');
}

async function draftOf(courseId: string) {
  const d = await one<{ id: string; number: number }>(`SELECT id, number FROM course_versions WHERE course_id=$1 AND status='DRAFT'`, [courseId]);
  if (!d) go(`/admin/courses/${courseId}`, 'Ноорог хувилбар олдсонгүй.', true);
  return d!;
}

export async function saveDraftNotes(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id');
  const d = await draftOf(courseId);
  await run('UPDATE course_versions SET notes=$1 WHERE id=$2', [s(fd, 'notes'), d.id]);
  go(`/admin/courses/${courseId}/draft`, 'Тайлбар хадгалагдлаа.');
}

export async function addModule(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id');
  const d = await draftOf(courseId);
  const title = s(fd, 'title');
  if (!title) go(`/admin/courses/${courseId}/draft`, 'Модулийн нэрийг оруулна уу.', true);
  const course = await one<{ category: string }>('SELECT category FROM courses WHERE id=$1', [courseId]);
  if (!CATEGORY_FORMATS[course!.category]?.includes(fmt(s(fd, 'format'))))
    go(`/admin/courses/${courseId}/draft`, `${CATEGORY_LABEL[course!.category]}-д ${FORMAT_LABEL[fmt(s(fd, 'format'))]} модуль нэмэх боломжгүй.`, true);
  const pos = await one<{ p: number }>('SELECT coalesce(max(position),0)+1 AS p FROM modules WHERE version_id=$1', [d.id]);
  const key = 'k' + Date.now().toString(36);
  const m = await one<{ id: string }>(
    `INSERT INTO modules (version_id,module_key,position,title,description,duration_min,added_in,change,format) VALUES ($1,$2,$3,$4,$5,$6,$7,'NEW',$8) RETURNING id`,
    [d.id, key, pos!.p, title, s(fd, 'description'), Number(s(fd, 'duration_min')) || 10, d.number, fmt(s(fd, 'format'))]);
  redirect(`/admin/courses/${courseId}/draft/${m!.id}?ok=${encodeURIComponent('Модуль нэмэгдлээ. Видео, гарын авлага, тестээ оруулна уу.')}`);
}

export async function updateModuleMeta(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id'), id = s(fd, 'module_id');
  await draftOf(courseId);
  const cur = await one<any>('SELECT change FROM modules WHERE id=$1', [id]);
  let change = cur.change;
  const wanted = s(fd, 'change');
  if (cur.change !== 'NEW' && (wanted === 'SAME' || wanted === 'CHANGED')) change = wanted;
  await run('UPDATE modules SET title=$1,description=$2,duration_min=$3,pass_score=$4,change=$5,mandatory=$6 WHERE id=$7',
    [s(fd, 'title'), s(fd, 'description'), Number(s(fd, 'duration_min')) || 10, Math.min(100, Math.max(0, Number(s(fd, 'pass_score')) || 70)), change, fd.get('mandatory') === 'on', id]);
  // Хэлбэрийг зөвхөн шинэ модульд солино
  if (cur.change === 'NEW' && fd.get('format')) {
    const cc = await one<{ category: string }>('SELECT category FROM courses WHERE id=$1', [courseId]);
    if (CATEGORY_FORMATS[cc!.category]?.includes(fmt(s(fd, 'format')))) await run('UPDATE modules SET format=$1 WHERE id=$2', [fmt(s(fd, 'format')), id]);
  }
  go(s(fd, 'back') || `/admin/courses/${courseId}/draft`, 'Модуль хадгалагдлаа.');
}

// Жагсаалтаас өөрчлөлтийн төрөл, заавал эсэхийг шуурхай тохируулах
export async function setModuleChange(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id'), id = s(fd, 'module_id');
  await draftOf(courseId);
  const wanted = s(fd, 'change');
  await run(`UPDATE modules SET change = CASE WHEN change='NEW' THEN 'NEW' ELSE $1 END, mandatory=$2 WHERE id=$3`,
    [wanted === 'CHANGED' ? 'CHANGED' : 'SAME', fd.get('mandatory') === 'on', id]);
  revalidatePath(`/admin/courses/${courseId}/draft`);
}

export async function moveModule(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id'), id = s(fd, 'module_id'), dir = s(fd, 'dir');
  const d = await draftOf(courseId);
  await tx(async c => {
    const mods = await all<{ id: string; position: number }>('SELECT id, position FROM modules WHERE version_id=$1 ORDER BY position', [d.id], c);
    const i = mods.findIndex(m => m.id === id), j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= mods.length) return;
    [mods[i], mods[j]] = [mods[j], mods[i]];
    for (let k = 0; k < mods.length; k++) await run('UPDATE modules SET position=$1 WHERE id=$2', [k + 1, mods[k].id], c);
  });
  revalidatePath(`/admin/courses/${courseId}/draft`);
}

export async function removeModule(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id');
  await draftOf(courseId);
  await run('DELETE FROM modules WHERE id=$1', [s(fd, 'module_id')]);
  go(`/admin/courses/${courseId}/draft`, 'Модуль энэ хувилбараас хасагдлаа.');
}

export async function removeModuleFile(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id'), id = s(fd, 'module_id'), kind = s(fd, 'kind');
  await draftOf(courseId);
  const col = kind === 'pdf' ? 'pdf_file' : kind === 'url' ? 'video_url' : 'video_file';
  await run(`UPDATE modules SET ${col}=NULL, change = CASE WHEN change='SAME' THEN 'CHANGED' ELSE change END WHERE id=$1`, [id]);
  go(`/admin/courses/${courseId}/draft/${id}`, kind === 'url' ? 'Видео холбоос хасагдлаа.' : 'Файл хасагдлаа.');
}

// YouTube эсвэл өөр сервер дээрх видеог холбоосоор тавих (байршуулсан видео файлыг орлоно)
export async function setModuleVideoUrl(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id'), id = s(fd, 'module_id');
  await draftOf(courseId);
  const back = `/admin/courses/${courseId}/draft/${id}`;
  const url = s(fd, 'video_url');
  if (!parseVideoUrl(url)) go(back, 'Видео холбоос буруу байна. YouTube хаяг эсвэл https://… .mp4 / .webm файлын шууд холбоос оруулна уу.', true);
  await run(`UPDATE modules SET video_url=$1, video_file=NULL, change = CASE WHEN change='SAME' THEN 'CHANGED' ELSE change END WHERE id=$2`, [url, id]);
  go(back, 'Видео холбоос хадгалагдлаа.');
}

export async function addQuestion(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id'), id = s(fd, 'module_id');
  await draftOf(courseId);
  const text = s(fd, 'text');
  const options = [1, 2, 3, 4, 5].map(i => s(fd, `opt${i}`)).filter(Boolean);
  const correct = Number(s(fd, 'correct')) - 1;
  const back = `/admin/courses/${courseId}/draft/${id}`;
  if (!text || options.length < 2) go(back, 'Асуулт болон дор хаяж 2 хариулт оруулна уу.', true);
  if (correct < 0 || correct >= options.length || !s(fd, `opt${correct + 1}`)) go(back, 'Зөв хариултыг сонгоно уу.', true);
  const pos = await one<{ p: number }>('SELECT coalesce(max(position),0)+1 AS p FROM questions WHERE module_id=$1', [id]);
  await run('INSERT INTO questions (module_id,position,text,options,correct_index) VALUES ($1,$2,$3,$4,$5)', [id, pos!.p, text, JSON.stringify(options), correct]);
  await run(`UPDATE modules SET change = CASE WHEN change='SAME' THEN 'CHANGED' ELSE change END WHERE id=$1`, [id]);
  go(back, 'Асуулт нэмэгдлээ.');
}

export async function deleteQuestion(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id'), id = s(fd, 'module_id');
  await draftOf(courseId);
  await run('DELETE FROM questions WHERE id=$1 AND module_id=$2', [s(fd, 'question_id'), id]);
  await run(`UPDATE modules SET change = CASE WHEN change='SAME' THEN 'CHANGED' ELSE change END WHERE id=$1`, [id]);
  go(`/admin/courses/${courseId}/draft/${id}`, 'Асуулт устгагдлаа.');
}

export async function publishDraft(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id');
  const back = `/admin/courses/${courseId}/draft`;
  const d = await draftOf(courseId);
  const mods = await all<any>('SELECT * FROM modules WHERE version_id=$1 ORDER BY position', [d.id]);
  if (!mods.length) go(back, 'Хувилбарт дор хаяж нэг модуль байх ёстой.', true);
  const empty = mods.filter(m => m.format === 'ELEARN' && !m.video_file && !m.video_url && !m.pdf_file);
  if (empty.length) go(back, `Видео эсвэл гарын авлагагүй цахим модуль байна: ${empty.map(m => m.title).join(', ')}`, true);
  const noItems = [];
  for (const m of mods.filter(x => x.format === 'OJT' || x.format === 'VOC')) {
    if (!(await one('SELECT 1 FROM module_items WHERE module_id=$1', [m.id]))) noItems.push(m.title);
  }
  if (noItems.length) go(back, `Даалгавар/шалгуургүй OJT, VoC модуль байна: ${noItems.join(', ')}`, true);
  const cc = await one<{ category: string }>('SELECT category FROM courses WHERE id=$1', [courseId]);
  const wrong = mods.filter(m => !CATEGORY_FORMATS[cc!.category]?.includes(m.format));
  if (wrong.length) go(back, `${CATEGORY_LABEL[cc!.category]}-д тохирохгүй модуль байна: ${wrong.map(m => `${m.title} (${FORMAT_LABEL[m.format]})`).join(', ')}. Модулийг устгах эсвэл сургалтын төрлийг "Хосолсон" болгоно уу.`, true);
  const notes = (await one<{ notes: string }>('SELECT notes FROM course_versions WHERE id=$1', [d.id]))!.notes;
  if (d.number > 1 && !notes.trim()) go(back, 'Өөрчлөлтийн тайлбар бичнэ үү. Энэ нь суралцагчдад очих мэдэгдэлд орно.', true);

  await tx(async c => {
    const prev = await one<any>(`SELECT * FROM course_versions WHERE course_id=$1 AND status='PUBLISHED' ORDER BY number DESC LIMIT 1`, [courseId], c);
    const prevMods = prev ? await all<any>('SELECT * FROM modules WHERE version_id=$1', [prev.id], c) : [];
    const prevByKey = new Map(prevMods.map((m: any) => [m.module_key, m]));
    for (const m of mods) {
      const p = prevByKey.get(m.module_key);
      if (!p) await run(`UPDATE modules SET mver=1, added_in=$1, change='NEW', mandatory=true WHERE id=$2`, [d.number, m.id], c);
      else if (m.change === 'CHANGED') await run('UPDATE modules SET mver=$1, added_in=$2 WHERE id=$3', [p.mver + 1, p.added_in, m.id], c);
      else await run(`UPDATE modules SET mver=$1, added_in=$2, change='SAME', mandatory=$3 WHERE id=$4`, [p.mver, p.added_in, p.mandatory, m.id], c);
    }
    const removed = prevMods.filter((p: any) => !mods.some(m => m.module_key === p.module_key)).map((p: any) => p.title);
    await run(`UPDATE course_versions SET status='PUBLISHED', published_at=now(), removed=$1 WHERE id=$2`, [JSON.stringify(removed), d.id], c);
  });
  const sent = d.number > 1 ? await notifyNewVersion(courseId, d.number) : 0;
  go(`/admin/courses/${courseId}`, d.number > 1 ? `${d.number}-р хувилбар нийтлэгдэж, ${sent} суралцагчид мэдэгдэл илгээгдлээ.` : 'Сургалт нийтлэгдлээ.');
}

/* Хуваарь, бүртгэл, ирц: src/app/actions/offerings.ts */

/* ---------------- Заавал хамрагдах сургалтын оноолт ---------------- */
export async function createAssignment(fd: FormData) {
  const me = await requireUser('ADMIN', 'TRAINING_ADMIN');
  const target = s(fd, 'target');
  const value = target === 'DEPARTMENT' ? s(fd, 'department') : target === 'POSITION' ? s(fd, 'position') : target === 'ORG' ? s(fd, 'org_id') : target === 'USER' ? s(fd, 'user_id') : null;
  if (!s(fd, 'course_id') || !['ALL_INTERNAL', 'DEPARTMENT', 'POSITION', 'ORG', 'USER'].includes(target)) go('/admin/assignments', 'Сургалт болон хамрах хүрээг сонгоно уу.', true);
  if (target !== 'ALL_INTERNAL' && !value) go('/admin/assignments', 'Хэнд оноохыг сонгоно уу.', true);
  const course = await one<{ audience: string }>('SELECT audience FROM courses WHERE id=$1', [s(fd, 'course_id')]);
  const back = `/admin/assignments?aud=${course?.audience === 'INTERNAL' ? 'internal' : 'customer'}`;
  // Сургалтын админ хамтрагч байгууллагын (харилцагчийн) заавал сургалтыг л ононо
  if (me.role === 'TRAINING_ADMIN' && course?.audience !== 'CUSTOMER') go('/admin/assignments?aud=customer', 'Сургалтын админ зөвхөн хамтрагч байгууллагын сургалтыг ононо.', true);
  if (course?.audience === 'INTERNAL' && target === 'ORG') go(back, 'Дотоод сургалтыг харилцагч байгууллагад оноох боломжгүй.', true);
  if (course?.audience === 'CUSTOMER' && (target === 'ALL_INTERNAL' || target === 'DEPARTMENT')) go(back, 'Харилцагчийн сургалтыг Proliance-ийн ажилтанд оноох боломжгүй.', true);
  const rec = Number(s(fd, 'recurrence_months')) || null;
  await run(`INSERT INTO assignments (course_id,target,target_value,due_days,due_date,recurrence_months,note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [s(fd, 'course_id'), target, value, Number(s(fd, 'due_days')) || 30, s(fd, 'due_date') || null, rec, s(fd, 'note')]);
  go(back, 'Заавал хамрагдах сургалт оноогдлоо.');
}

export async function deleteAssignment(fd: FormData) {
  const me = await requireUser('ADMIN', 'TRAINING_ADMIN');
  if (me.role === 'TRAINING_ADMIN') await run(`DELETE FROM assignments a USING courses c WHERE a.id=$1 AND c.id=a.course_id AND c.audience='CUSTOMER'`, [s(fd, 'id')]);
  else await run('DELETE FROM assignments WHERE id=$1', [s(fd, 'id')]);
  go(`/admin/assignments?aud=${s(fd, 'aud') || 'internal'}`, 'Оноолт устгагдлаа.');
}

/* ---------------- OJT даалгавар / VoC шалгуур ---------------- */
export async function addModuleItem(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id'), id = s(fd, 'module_id');
  await draftOf(courseId);
  const lines = s(fd, 'text').split('\n').map(x => x.trim()).filter(Boolean);
  const back = `/admin/courses/${courseId}/draft/${id}`;
  if (!lines.length) go(back, 'Даалгавар эсвэл шалгуурыг оруулна уу.', true);
  let pos = (await one<{ p: number }>('SELECT coalesce(max(position),0)+1 AS p FROM module_items WHERE module_id=$1', [id]))!.p;
  for (const t of lines) await run('INSERT INTO module_items (module_id,position,text) VALUES ($1,$2,$3)', [id, pos++, t]);
  await run(`UPDATE modules SET change = CASE WHEN change='SAME' THEN 'CHANGED' ELSE change END WHERE id=$1`, [id]);
  go(back, `${lines.length} мөр нэмэгдлээ.`);
}

export async function deleteModuleItem(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id'), id = s(fd, 'module_id');
  await draftOf(courseId);
  await run('DELETE FROM module_items WHERE id=$1 AND module_id=$2', [s(fd, 'item_id'), id]);
  await run(`UPDATE modules SET change = CASE WHEN change='SAME' THEN 'CHANGED' ELSE change END WHERE id=$1`, [id]);
  go(`/admin/courses/${courseId}/draft/${id}`, 'Устгагдлаа.');
}

/* ---------------- Сургагч багшийн эрх ---------------- */
export async function grantTrainer(fd: FormData) {
  const me = await requireUser('ADMIN');
  const userId = s(fd, 'user_id'), courseId = s(fd, 'course_id');
  if (!userId || !courseId) go('/admin/trainers', 'Хүн болон сургалтыг сонгоно уу.', true);
  await run(`INSERT INTO trainer_quals (user_id,course_id,source,granted_by) VALUES ($1,$2,'MANUAL',$3) ON CONFLICT DO NOTHING`, [userId, courseId, me.id]);
  go('/admin/trainers', 'Сургагч багшийн эрх олгогдлоо.');
}

export async function revokeTrainer(fd: FormData) {
  await requireUser('ADMIN');
  await run('DELETE FROM trainer_quals WHERE user_id=$1 AND course_id=$2', [s(fd, 'user_id'), s(fd, 'course_id')]);
  go('/admin/trainers', 'Эрх цуцлагдлаа.');
}

// Ажилтны албан тушаалыг өөрчлөх: түүхэнд хадгалж, матрицын заавал хамрагдах сургалтыг автоматаар оноож мэдэгдэнэ
export async function changePosition(fd: FormData) {
  await requireUser('ADMIN');
  const id = s(fd, 'id');
  const back = `/admin/learners/${id}`;
  const moved = await setUserPosition(id, s(fd, 'position') || null, s(fd, 'department') || null);
  go(back, moved ? 'Албан тушаал өөрчлөгдлөө. Шинэ албан тушаалын заавал хамрагдах сургалтууд оноогдож, ажилтанд мэдэгдэл очлоо.' : 'Өөрчлөлт алга.');
}
