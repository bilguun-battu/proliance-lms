'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction } from '../actions/auth';
import Submit from '@/components/Submit';

export default function LoginForm({ ok, next }: { ok: boolean; next?: string }) {
  const [state, action] = useActionState(loginAction, {});
  return (
    <form action={action} className="stack">
      {ok && <div className="alert ok">Нууц үг шинэчлэгдлээ. Нэвтэрнэ үү.</div>}
      {state.error && <div className="alert err">{state.error}</div>}
      {next?.startsWith('/exam/') && <div className="alert ok">Шалгалт өгөхийн тулд эхлээд нэвтэрнэ үү.</div>}
      {next?.startsWith('/eval/') && <div className="alert ok">Хичээлийг үнэлэхийн тулд эхлээд нэвтэрнэ үү.</div>}
      <input type="hidden" name="next" value={next ?? ''} />
      <label className="fld"><span>Имэйл</span><input type="email" name="email" required autoComplete="email" /></label>
      <label className="fld"><span>Нууц үг</span><input type="password" name="password" required autoComplete="current-password" /></label>
      <Submit>Нэвтрэх</Submit>
      <Link href="/forgot" className="small muted">Нууц үгээ мартсан уу?</Link>
    </form>
  );
}
