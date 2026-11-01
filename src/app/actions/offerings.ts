'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { all, one, run, tx } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { canAccessCourse } from '@/lib/progress';
import { enroll, drop, promote, markAttendance, setResult, canManageOffering, cancelOffering, getOffering, offCode } from '@/lib/offerings';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const go = (target: string, msg: string, err = false): never => {
  const [path, hash] = target.split('#');
  redirect(`${path}${path.includes('?') ? '&' : '?'}${err ? 'err' : 'ok'}=${encodeURIComponent(msg)}${hash ? `#${hash}` : ''}`);
};
const ts = (date: string, time = '00:00') => (date ? `${date} ${time || '00:00'}+08` : null);
const back = (fd: FormData, id: string) => s(fd, 'back') || `/admin/sessions/${id}`;

/* ---------------- Админ: хуваарьт сургалт ---------------- */
export async function createOffering(fd: FormData) {
  await requireUser('ADMIN');
  const courseId = s(fd, 'course_id');
  const err = (m: string) => go(`/admin/sessions/new?course=${courseId}`, m, true);
  const mods = await all<any>(`SELECT m.module_key, m.title, m.format, m.duration_min FROM modules m JOIN course_versions v ON v.id=m.version_id
     WHERE v.course_id=$1 AND v.status='PUBLISHED' AND v.number=(SELECT max(number) FROM course_versions x WHERE x.course_id=$1 AND x.status='PUBLISHED')
       AND m.format IN ('INPERSON','ONLINE') ORDER BY m.position`, [courseId]);
  if (!mods.length) err('Энэ сургалтад танхимын эсвэл онлайн шууд хичээл алга.');
  const sess = mods.filter(m => s(fd, `date_${m.module_key}`)).map(m => ({
    key: m.module_key, format: m.format, at: ts(s(fd, `date_${m.module_key}`), s(fd, `time_${m.module_key}`)),
    dur: Number(s(fd, `dur_${m.module_key}`)) || m.duration_min || 60, instr: s(fd, `instr_${m.module_key}`) || null,
  }));
  if (!sess.length) err('Дор хаяж нэг хичээлийн огноо, цагийг оруулна уу.');
  if (sess.some(x => x.format === 'ONLINE') && !s(fd, 'link')) err('Онлайн шууд хичээлийн холбоосыг (Zoom, Meet) оруулна уу.');
  const max = Math.max(1, Number(s(fd, 'max_capacity')) || 12);
  const min = Math.min(max, Math.max(0, Number(s(fd, 'min_capacity')) || 0));
  const instr = s(fd, 'instructor_id');
  const id = await tx(async c => {
    const o = await one<{ id: string }>(`INSERT INTO offerings (course_id,instructor_id,instructor_name,location,link,min_capacity,max_capacity,waitlist_capacity,
        auto_waitlist,enroll_deadline,drop_deadline,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz,$12) RETURNING id`,
      [courseId, instr && instr !== 'EXT' ? instr : null, instr === 'EXT' ? s(fd, 'instructor_name') || null : null,
       s(fd, 'location') || (sess.every(x => x.format === 'ONLINE') ? 'Онлайн' : ''), s(fd, 'link') || null, min, max,
       Math.max(0, Number(s(fd, 'waitlist_capacity')) || 0), fd.get('auto_waitlist') === 'on',
       ts(s(fd, 'enroll_deadline'), '23:59'), ts(s(fd, 'drop_deadline'), '23:59'), s(fd, 'notes')], c);
    for (const x of sess) {
      await run(`INSERT INTO sessions (offering_id,course_id,module_key,starts_at,duration_min,location,link,instructor_id,seats)
        VALUES ($1,$2,$3,$4::timestamptz,$5,$6,$7,$8,$9)`,
        [o!.id, courseId, x.key, x.at, x.dur, x.format === 'ONLINE' ? 'Онлайн' : s(fd, 'location'), x.format === 'ONLINE' ? s(fd, 'link') : null, x.instr, max], c);
    }
    return o!.id;
  });
  const o = await getOffering(id);
  go(`/admin/sessions/${id}`, `${offCode(o!.num)} хуваарьт сургалт үүслээ. Суралцагчид бүртгүүлж эхэлнэ.`);
}

export async function updateOffering(fd: FormData) {
  await requireUser('ADMIN');
  const id = s(fd, 'offering_id');
  const instr = s(fd, 'instructor_id');
  const max = Math.max(1, Number(s(fd, 'max_capacity')) || 12);
  await run(`UPDATE offerings SET instructor_id=$2, instructor_name=$3, location=$4, link=$5, min_capacity=$6, max_capacity=$7, waitlist_capacity=$8,
      auto_waitlist=$9, enroll_deadline=$10::timestamptz, drop_deadline=$11::timestamptz, notes=$12 WHERE id=$1`,
    [id, instr && instr !== 'EXT' ? instr : null, instr === 'EXT' ? s(fd, 'instructor_name') || null : null, s(fd, 'location'), s(fd, 'link') || null,
     Math.min(max, Math.max(0, Number(s(fd, 'min_capacity')) || 0)), max, Math.max(0, Number(s(fd, 'waitlist_capacity')) || 0),
     fd.get('auto_waitlist') === 'on', ts(s(fd, 'enroll_deadline'), '23:59'), ts(s(fd, 'drop_deadline'), '23:59'), s(fd, 'notes')]);
  await run(`UPDATE sessions SET location=CASE WHEN link IS NULL THEN $2 ELSE location END, link=CASE WHEN link IS NOT NULL THEN coalesce($3, link) ELSE NULL END
             WHERE offering_id=$1`, [id, s(fd, 'location'), s(fd, 'link') || null]);
  // Багтаамж нэмэгдсэн бол хүлээлгээс бүртгэнэ
  const n = fd.get('auto_waitlist') === 'on' ? await promote(id) : 0;
  go(`/admin/sessions/${id}`, `Хуваарь хадгалагдлаа.${n ? ` Хүлээлгийн жагсаалтаас ${n} хүн бүртгэгдлээ.` : ''}`);
}

export async function updateSessionTime(fd: FormData) {
  const u = await requireUser('ADMIN');
  const id = s(fd, 'session_id');
  const sess = await one<any>('SELECT * FROM sessions WHERE id=$1', [id]);
  if (!sess || !(await canManageOffering(u, sess.offering_id))) go('/admin/sessions', 'Эрхгүй.', true);
  await run(`UPDATE sessions SET starts_at=$2::timestamptz, duration_min=$3, instructor_id=$4 WHERE id=$1`,
    [id, ts(s(fd, 'date'), s(fd, 'time')), Number(s(fd, 'duration_min')) || sess.duration_min, s(fd, 'instructor_id') || null]);
  go(`/admin/sessions/${sess.offering_id}`, 'Хичээлийн цаг шинэчлэгдлээ.');
}

export async function cancelOfferingAction(fd: FormData) {
  await requireUser('ADMIN');
  const n = await cancelOffering(s(fd, 'offering_id'));
  go(`/admin/sessions/${s(fd, 'offering_id')}`, `Хуваарь цуцлагдаж, ${n} хүнд мэдэгдэл очлоо.`);
}

/* ---------------- Админ ба сургагч багш: оролцогчид ---------------- */
async function manager(fd: FormData) {
  const u = await requireUser('ADMIN', 'LEARNER', 'COORDINATOR');
  const id = s(fd, 'offering_id');
  if (!(await canManageOffering(u, id))) go('/portal', 'Энэ хуваарийг удирдах эрхгүй.', true);
  return { u, id };
}

export async function enrollUser(fd: FormData) {
  const { u, id } = await manager(fd);
  const o = await getOffering(id);
  const uid = s(fd, 'user_id');
  if (!uid) go(back(fd, id), 'Суралцагчийг сонгоно уу.', true);
  if (!(await canAccessCourse(uid, o!.course_id))) go(back(fd, id), 'Энэ хүнд тухайн сургалт нээгдээгүй байна.', true);
  const r = await enroll(id, uid, { by: u.id, force: fd.get('force') === 'on' });
  go(back(fd, id), r.error ?? r.msg ?? 'Бүртгэгдлээ.', !!r.error);
}

export async function dropUser(fd: FormData) {
  const { id } = await manager(fd);
  const r = await drop(id, s(fd, 'user_id'), { force: true });
  go(back(fd, id), r.error ?? 'Бүртгэлээс хасагдлаа.', !!r.error);
}

export async function promoteUser(fd: FormData) {
  const { id } = await manager(fd);
  const n = await promote(id, s(fd, 'user_id'));
  go(back(fd, id), n ? 'Хүлээлгийн жагсаалтаас бүртгэгдлээ.' : 'Бүртгэх боломжгүй.', !n);
}

export async function attendanceAction(fd: FormData) {
  const { id } = await manager(fd);
  const status = (['ATTENDED', 'PARTIAL', 'ABSENT'].includes(s(fd, 'status')) ? s(fd, 'status') : 'ATTENDED') as 'ATTENDED' | 'PARTIAL' | 'ABSENT';
  const users = fd.getAll('user_id').map(String);
  const sess = await one<any>('SELECT id FROM sessions WHERE id=$1 AND offering_id=$2', [s(fd, 'session_id'), id]);
  if (!sess || !users.length) go(back(fd, id), 'Хүмүүсээ сонгоно уу.', true);
  await markAttendance(sess.id, users, status);
  go(`${back(fd, id)}#s-${sess.id}`, `${users.length} хүний ирц хадгалагдлаа.`);
}

export async function resultAction(fd: FormData) {
  const { id } = await manager(fd);
  const grade = s(fd, 'grade') === 'FAIL' ? 'FAIL' : 'PASS';
  await setResult(id, s(fd, 'user_id'), grade, s(fd, 'score') ? Number(s(fd, 'score')) : null, s(fd, 'note') || null);
  go(`${back(fd, id)}#roster`, grade === 'PASS' ? 'Дүүргэсэн гэж бүртгэгдлээ.' : 'Амжилтгүй гэж бүртгэгдлээ.');
}

/* ---------------- Суралцагч ---------------- */
export async function enrollSelf(offeringId: string): Promise<{ error?: string; ok?: string }> {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const o = await getOffering(offeringId);
  if (!o || !(await canAccessCourse(u.id, o.course_id))) return { error: 'Энэ сургалтад бүртгүүлэх эрхгүй байна.' };
  const r = await enroll(offeringId, u.id);
  revalidatePath(`/portal/courses/${o.course_id}`);
  return r.error ? { error: r.error } : { ok: r.msg };
}

export async function dropSelf(offeringId: string): Promise<{ error?: string; ok?: string }> {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  const o = await getOffering(offeringId);
  const r = await drop(offeringId, u.id);
  if (o) revalidatePath(`/portal/courses/${o.course_id}`);
  return r.error ? { error: r.error } : { ok: r.msg };
}
