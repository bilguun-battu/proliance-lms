import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/auth';

export default async function Home() {
  const u = await getSession();
  redirect(u ? homeFor(u.role) : '/login');
}
