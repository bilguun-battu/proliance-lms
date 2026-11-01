'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { forgotAction } from '../actions/auth';
import Submit from '@/components/Submit';

export default function ForgotPage() {
  const [state, action] = useActionState(forgotAction, {});
  return (
    <div className="auth">
      <div className="panel">
        <div><h1>Нууц үг сэргээх</h1><p className="muted small">Бүртгэлтэй имэйлээ оруулна уу. Сэргээх холбоос илгээнэ.</p></div>
        <form action={action} className="stack">
          {state.ok && <div className="alert ok">{state.ok}</div>}
          <label className="fld"><span>Имэйл</span><input type="email" name="email" required /></label>
          <Submit>Холбоос илгээх</Submit>
          <Link href="/login" className="small muted">← Нэвтрэх хуудас</Link>
        </form>
      </div>
    </div>
  );
}
