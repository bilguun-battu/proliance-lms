import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'node:crypto';
import { one, run } from './db';

export type Role = 'ADMIN' | 'TRAINING_ADMIN' | 'TRAINER' | 'COORDINATOR' | 'LEARNER';
// Суралцагчийн портал руу нэвтрэх эрхүүд (сургагч, сургалтын админ мөн өөрсдөө сургалтад сууна)
export const PORTAL_ROLES: Role[] = ['LEARNER', 'COORDINATOR', 'TRAINER', 'TRAINING_ADMIN'];
// Сургалтын үйл ажиллагааг удирдах эрхүүд: хуваарь, багш оноох, шалгалт, үнэлгээний материал
export const STAFF_ROLES: Role[] = ['ADMIN', 'TRAINING_ADMIN'];
export const isStaff = (role: string) => role === 'ADMIN' || role === 'TRAINING_ADMIN';
// Сургалтын админд нээлттэй админ хэсгүүд
export const TRAINING_ADMIN_PATHS = ['/admin/sessions', '/admin/exams', '/admin/evaluations', '/admin/assignments', '/admin/compliance', '/admin/assess'];
export type SessionUser = { id: string; name: string; email: string; role: Role; orgId: string | null };

export const COOKIE = 'pl_session';
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-only-secret-change-me');

export async function createSession(u: SessionUser) {
  const token = await new SignJWT({ uid: u.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: (process.env.APP_URL || '').startsWith('https://'), path: '/', maxAge: 60 * 60 * 12 });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const u = await one<any>('SELECT id,name,email,role,org_id FROM users WHERE id=$1 AND active', [payload.uid]);
    if (!u) return null;
    return { id: u.id, name: u.name, email: u.email, role: u.role, orgId: u.org_id };
  } catch {
    return null;
  }
}

export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const u = await getSession();
  if (!u) redirect('/login');
  if (roles.length && !roles.includes(u.role)) redirect(homeFor(u.role));
  return u;
}

export function homeFor(role: Role) {
  return role === 'ADMIN' ? '/admin' : role === 'TRAINING_ADMIN' ? '/admin/sessions' : role === 'TRAINER' ? '/portal/teach' : role === 'COORDINATOR' ? '/org' : '/portal';
}

// Нууц үг тохируулах холбоос (урилга болон сэргээлтэд)
export async function createPasswordToken(userId: string, hours = 72) {
  const token = crypto.randomBytes(24).toString('base64url');
  await run('INSERT INTO password_tokens (token,user_id,expires_at) VALUES ($1,$2,now() + ($3 || \' hours\')::interval)', [token, userId, String(hours)]);
  return token;
}

export function appUrl(path: string) {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '') + path;
}
