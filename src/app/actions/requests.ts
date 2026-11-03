'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { all, one, run, tx } from '@/lib/db';
import { requireUser, createPasswordToken, appUrl } from '@/lib/auth';
import { sendEmail } from '@/lib/notify';
import { startPositionHistory } from '@/lib/positions';
import { enroll, getOffering, offCode } from '@/lib/offerings';
import { fmtSession } from '@/lib/format';
import { REQ_KIND, REQ_STATUS, REQ_FORMAT, orgCourses, getRequest, addMessage, notifyProliance, notifyOrg } from '@/lib/requests';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const go = (path: string, msg: string, err = false): never => {
  revalidatePath(path.split('?')[0]);
  redirect(`${path}${path.includes('?') ? '&' : '?'}${err ? 'err' : 'ok'}=${encodeURIComponent(msg)}`);
};
const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/* ---------------- Байгууллагын хариуцагч ---------------- */

export async function createRequest(fd: FormData) {
  const me = await requireUser('COORDINATOR');
  const back = '/org/requests/new';
  const kind = s(fd, 'kind');
  if (!REQ_KIND[kind]) go(back, 'Хүсэлтийн төрлөө сонгоно уу.', true);
  const courses = await orgCourses(me.orgId!);
  const courseId = s(fd, 'course_id') || null;
  if (courseId && !courses.some(c => c.id === courseId)) go(back, 'Сургалт олдсонгүй.', true);
  // Бүртгэлтэй ажилтнууд (зөвхөн өөрийн байгууллагын)
  const ids = fd.getAll('user_ids').map(String).filter(Boolean);
  const staff = ids.length ? await all<any>('SELECT id, name, position, email, phone FROM users WHERE id = ANY($1) AND org_id=$2 AND active', [ids, me.orgId]) : [];
  // Шинээр орох хүмүүс
  const names = fd.getAll('new_name').map(String), pos = fd.getAll('new_position').map(String), em = fd.getAll('new_email').map(String), ph = fd.getAll('new_phone').map(String);
  const fresh = names.map((n, i) => ({ name: n.trim(), position: pos[i]?.trim() || null, email: em[i]?.trim().toLowerCase() || null, phone: ph[i]?.trim() || null })).filter(p => p.name);
  if (fresh.some(p => p.email && !/^\S+@\S+\.\S+$/.test(p.email))) go(back, 'Имэйл хаяг буруу байна.', true);
  const topic = s(fd, 'topic'), note = s(fd, 'note');
  if (kind === 'NEW_STAFF' && !fresh.length && !staff.length) go(back, 'Шинэ ажилтны нэрийг оруулна уу.', true);
  if (kind === 'RETRAIN' && !staff.length) go(back, 'Давтан сургалтад хамрагдах ажилтнуудаа сонгоно уу.', true);
  if ((kind === 'RETRAIN' || kind === 'NEW_STAFF') && !courseId) go(back, 'Сургалтаа сонгоно уу.', true);
  if (kind === 'ADDITIONAL' && !courseId && !topic) go(back, 'Сургалтаа сонгох эсвэл сэдвээ бичнэ үү.', true);
  if (kind === 'OTHER' && !note) go(back, 'Хүсэлтээ тайлбарлаж бичнэ үү.', true);
  const from = date(s(fd, 'preferred_from')), to = date(s(fd, 'preferred_to'));
  if (from && to && from > to) go(back, 'Хугацааны эхлэх огноо дуусахаас өмнө байх ёстой.', true);
  const format = REQ_FORMAT[s(fd, 'format')] ? s(fd, 'format') : 'ANY';
  const id = await tx(async c => {
    const r = await one<{ id: string }>(`INSERT INTO training_requests (org_id,requested_by,kind,course_id,topic,format,preferred_from,preferred_to,note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [me.orgId, me.id, kind, courseId, topic, format, from, to, note], c);
    for (const p of staff) await run('INSERT INTO training_request_people (request_id,user_id,name,position,email,phone) VALUES ($1,$2,$3,$4,$5,$6)', [r!.id, p.id, p.name, p.position, p.email, p.phone], c);
    for (const p of fresh) await run('INSERT INTO training_request_people (request_id,name,position,email,phone) VALUES ($1,$2,$3,$4,$5)', [r!.id, p.name, p.position, p.email, p.phone], c);
    return r!.id;
  });
  const n = staff.length + fresh.length;
  await addMessage(id, 'SYSTEM', me.id, `Хүсэлт илгээгдлээ${n ? ` (${n} хүн)` : ''}.`);
  await notifyProliance(id, 'Шинэ сургалтын хүсэлт', `${REQ_KIND[kind][0]}${n ? `, ${n} хүн` : ''}.${note ? `\n\n${note}` : ''}`);
  go(`/org/requests/${id}`, 'Хүсэлт Proliance-д илгээгдлээ. Хариу ирэхэд мэдэгдэл болон имэйлээр мэдэгдэнэ.');
}

async function ownRequest(id: string) {
  const me = await requireUser('COORDINATOR');
  const r = await getRequest(id);
  if (!r || r.org_id !== me.orgId) go('/org/requests', 'Хүсэлт олдсонгүй.', true);
  return { me, r };
}

export async function orgMessage(fd: FormData) {
  const { me, r } = await ownRequest(s(fd, 'id'));
  const body = s(fd, 'body');
  if (!body) go(`/org/requests/${r.id}`, 'Мессежээ бичнэ үү.', true);
  await addMessage(r.id, 'ORG', me.id, body);
  await notifyProliance(r.id, 'Хүсэлтэд шинэ мессеж', `${me.name}: ${body}`);
  go(`/org/requests/${r.id}`, 'Мессеж илгээгдлээ.');
}

export async function cancelRequest(fd: FormData) {
  const { me, r } = await ownRequest(s(fd, 'id'));
  if (!['NEW', 'IN_REVIEW'].includes(r.status)) go(`/org/requests/${r.id}`, 'Хуваарь гарсан хүсэлтийг цуцлах бол Proliance-д мессеж бичнэ үү.', true);
  await run(`UPDATE training_requests SET status='CANCELLED', updated_at=now() WHERE id=$1`, [r.id]);
  await addMessage(r.id, 'ORG', me.id, 'Хүсэлтийг цуцаллаа.');
  await notifyProliance(r.id, 'Хүсэлт цуцлагдлаа', `${me.name} хүсэлтээ цуцаллаа.`);
  go(`/org/requests/${r.id}`, 'Хүсэлт цуцлагдлаа.');
}

/* ---------------- Proliance ---------------- */

async function staffRequest(id: string) {
  const me = await requireUser('ADMIN', 'TRAINING_ADMIN');
  const r = await getRequest(id);
  if (!r) go('/admin/requests', 'Хүсэлт олдсонгүй.', true);
  if (!r.handled_by) await run('UPDATE training_requests SET handled_by=$1 WHERE id=$2', [me.id, r.id]);
  return { me, r };
}

// Хариу бичих, төлөв өөрчлөх
export async function adminReply(fd: FormData) {
  const { me, r } = await staffRequest(s(fd, 'id'));
  const back = `/admin/requests/${r.id}`;
  const status = s(fd, 'status'), body = s(fd, 'body');
  const changed = status && REQ_STATUS[status] && status !== r.status;
  if (!changed && !body) go(back, 'Хариу бичих эсвэл төлөвийг өөрчилнө үү.', true);
  if (status === 'REJECTED' && !body) go(back, 'Татгалзах шалтгааныг бичнэ үү.', true);
  if (changed) {
    await run('UPDATE training_requests SET status=$1, updated_at=now() WHERE id=$2', [status, r.id]);
    await addMessage(r.id, 'SYSTEM', me.id, `Төлөв: ${REQ_STATUS[status][0]}`);
  }
  if (body) await addMessage(r.id, 'PROLIANCE', me.id, body);
  await notifyOrg(r.id, changed ? `Сургалтын хүсэлт: ${REQ_STATUS[status][0]}` : 'Сургалтын хүсэлтэд хариу ирлээ', body || `Таны хүсэлтийн төлөв "${REQ_STATUS[status][0]}" боллоо.`);
  go(back, 'Хариу илгээгдлээ. Хариуцагчид мэдэгдэл, имэйл очлоо.');
}

// Шинэ ажилтнуудад системийн эрх үүсгэж урилга илгээнэ
export async function createRequestAccounts(fd: FormData) {
  const { me, r } = await staffRequest(s(fd, 'id'));
  const back = `/admin/requests/${r.id}`;
  const people = await all<any>('SELECT * FROM training_request_people WHERE request_id=$1 AND user_id IS NULL', [r.id]);
  let made = 0, linked = 0; const skipped: string[] = [];
  for (const p of people) {
    if (!p.email) { skipped.push(`${p.name} (имэйлгүй)`); continue; }
    const ex = await one<any>('SELECT id, org_id FROM users WHERE email=$1', [p.email]);
    if (ex) {
      if (ex.org_id === r.org_id) { await run('UPDATE training_request_people SET user_id=$1 WHERE id=$2', [ex.id, p.id]); linked++; }
      else skipped.push(`${p.name} (имэйл өөр байгууллагад бүртгэлтэй)`);
      continue;
    }
    const u = await one<{ id: string }>(`INSERT INTO users (email,name,phone,position,role,org_id) VALUES ($1,$2,$3,$4,'LEARNER',$5) RETURNING id`,
      [p.email, p.name, p.phone, p.position, r.org_id]);
    await startPositionHistory(u!.id);
    const token = await createPasswordToken(u!.id, 72);
    await sendEmail(p.email, 'Proliance сургалтын системд урилга',
      `Сайн байна уу, ${p.name}.\n\nТанд Proliance-ийн цахим сургалтын системд нэвтрэх эрх олгогдлоо.\nДоорх холбоосоор нууц үгээ тохируулна уу (72 цаг хүчинтэй):\n${appUrl(`/reset/${token}`)}\n\nНэвтрэх хаяг: ${appUrl('/login')}`);
    await run('UPDATE training_request_people SET user_id=$1 WHERE id=$2', [u!.id, p.id]);
    made++;
  }
  const msg = [made && `${made} хүнд системийн эрх үүсгэж урилга илгээлээ`, linked && `${linked} хүн системд бүртгэлтэй байсныг холболоо`].filter(Boolean).join(', ');
  if (made || linked) {
    await addMessage(r.id, 'SYSTEM', me.id, `${msg}.`);
    await notifyOrg(r.id, 'Шинэ ажилтнуудын эрх үүслээ', `${msg}. Ажилтнууд имэйлээр ирсэн холбоосоор нууц үгээ тохируулж нэвтэрнэ. Цахим сургалтууд нь шууд нээгдэнэ.`);
  }
  go(back, `${msg || 'Шинээр үүсгэх хүн алга'}.${skipped.length ? ` Алгассан: ${skipped.join(', ')}.` : ''}`, !made && !linked);
}

// Хүсэлтийг хуваарьт холбож, хамрагдах хүмүүсийг бүртгэнэ
export async function linkRequestOffering(fd: FormData) {
  const { me, r } = await staffRequest(s(fd, 'id'));
  const back = `/admin/requests/${r.id}`;
  const o = await getOffering(s(fd, 'offering_id'));
  if (!o || o.status !== 'SCHEDULED') go(back, 'Хуваарь сонгоно уу.', true);
  const people = await all<any>('SELECT user_id, name FROM training_request_people WHERE request_id=$1 AND user_id IS NOT NULL', [r.id]);
  const ok: string[] = [], wait: string[] = [], fail: string[] = [];
  for (const p of people) {
    const x = await enroll(o.id, p.user_id, { by: me.id, force: true });
    if (x.status === 'ENROLLED' || x.status === 'COMPLETED') ok.push(p.name);
    else if (x.status === 'WAITLISTED') wait.push(p.name);
    else fail.push(`${p.name}: ${x.error}`);
  }
  await run(`UPDATE training_requests SET offering_id=$1, status='SCHEDULED', updated_at=now() WHERE id=$2`, [o.id, r.id]);
  const when = o.first_at ? fmtSession(o.first_at) : '';
  const text = `${offCode(o.num)} хуваарь: ${when}, ${o.location}${o.link ? ` (${o.link})` : ''}.${ok.length ? `\nБүртгэгдсэн: ${ok.join(', ')}.` : ''}${wait.length ? `\nХүлээлгийн жагсаалтад: ${wait.join(', ')}.` : ''}`;
  await addMessage(r.id, 'SYSTEM', me.id, `Хуваарьт холбогдлоо. ${text}`);
  await notifyOrg(r.id, 'Сургалтын хуваарь гарлаа', `${o.course}. ${text}\nАжилтан бүрт өөрсдөд нь бүртгэлийн мэдэгдэл очсон.`);
  go(back, `${offCode(o.num)} хуваарьт ${ok.length} хүн бүртгэгдлээ.${fail.length ? ` Бүртгэгдээгүй: ${fail.join('; ')}` : ''}`, fail.length > 0 && !ok.length);
}
