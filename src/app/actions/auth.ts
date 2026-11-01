'use server';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { one, run } from '@/lib/db';
import { createSession, destroySession, homeFor, createPasswordToken, appUrl } from '@/lib/auth';
import { sendEmail } from '@/lib/notify';
import { logActivity } from '@/lib/progress';

export type FormState = { error?: string; ok?: string };

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const password = String(fd.get('password') || '');
  const u = await one<any>('SELECT * FROM users WHERE email=$1 AND active', [email]);
  if (!u || !u.password_hash || !(await bcrypt.compare(password, u.password_hash))) {
    return { error: 'Имэйл эсвэл нууц үг буруу байна.' };
  }
  await createSession({ id: u.id, name: u.name, email: u.email, role: u.role, orgId: u.org_id });
  await logActivity(u.id, null, null, 'LOGIN');
  const next = String(fd.get('next') || '');
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : homeFor(u.role));
}

export async function logoutAction() {
  destroySession();
  redirect('/login');
}

export async function forgotAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const u = await one<any>('SELECT id, name FROM users WHERE email=$1 AND active', [email]);
  if (u) {
    const token = await createPasswordToken(u.id, 2);
    await sendEmail(email, 'Нууц үг сэргээх', `Сайн байна уу, ${u.name}.\n\nНууц үгээ шинэчлэх холбоос (2 цаг хүчинтэй):\n${appUrl(`/reset/${token}`)}\n\nТа хүсэлт гаргаагүй бол энэ имэйлийг үл тоомсорлоно уу.`);
  }
  return { ok: 'Бүртгэлтэй имэйл бол нууц үг сэргээх холбоос илгээгдлээ.' };
}

export async function resetAction(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get('token') || '');
  const p1 = String(fd.get('password') || '');
  const p2 = String(fd.get('password2') || '');
  if (p1.length < 8) return { error: 'Нууц үг дор хаяж 8 тэмдэгт байна.' };
  if (p1 !== p2) return { error: 'Нууц үг таарахгүй байна.' };
  const t = await one<any>('SELECT * FROM password_tokens WHERE token=$1 AND used_at IS NULL AND expires_at > now()', [token]);
  if (!t) return { error: 'Холбоосын хугацаа дууссан эсвэл ашиглагдсан байна. Дахин хүсэлт гаргана уу.' };
  await run('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(p1, 10), t.user_id]);
  await run('UPDATE password_tokens SET used_at=now() WHERE token=$1', [token]);
  redirect('/login?ok=1');
}
