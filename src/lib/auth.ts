import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'node:crypto';
import { one, run } from './db';

export type Role = 'ADMIN' | 'COORDINATOR' | 'LEARNER';
export type SessionUser = { id: string; name: string; email: string; role: Role; orgId: string | null };

export const COOKIE = 'pl_session';
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-only-secret-change-me');

export async function createSession(u: SessionUser) {
  const token = await new SignJWT({ uid: u.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret());
  cookies().set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 12 });
}

export function destroySession() {
  cookies().delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
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
  return role === 'ADMIN' ? '/admin' : role === 'COORDINATOR' ? '/org' : '/portal';
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
