import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/auth';
import LoginForm from './LoginForm';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default async function LoginPage(props: { searchParams: Promise<{ ok?: string; next?: string }> }) {
  const searchParams = await props.searchParams;
  const u = await getSession();
  if (u) redirect(searchParams.next?.startsWith('/') && !searchParams.next.startsWith('//') ? searchParams.next : homeFor(u.role));
  return (
    <div className="auth">
      <div className="panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${base}/logo.png`} alt="Proliance" />
        <div><h1>Сургалтын систем</h1><p className="muted small">Proliance-ээс олгосон эрхээр нэвтэрнэ үү.</p></div>
        <LoginForm ok={!!searchParams.ok} next={searchParams.next} />
      </div>
    </div>
  );
}
