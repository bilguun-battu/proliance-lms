'use client';
import { useFormState } from 'react-dom';
import { resetAction } from '../../actions/auth';
import Submit from '@/components/Submit';

export default function ResetPage({ params }: { params: { token: string } }) {
  const [state, action] = useFormState(resetAction, {});
  return (
    <div className="auth">
      <div className="panel">
        <div><h1>Нууц үг тохируулах</h1><p className="muted small">Дор хаяж 8 тэмдэгттэй нууц үг сонгоно уу.</p></div>
        <form action={action} className="stack">
          {state.error && <div className="alert err">{state.error}</div>}
          <input type="hidden" name="token" value={params.token} />
          <label className="fld"><span>Шинэ нууц үг</span><input type="password" name="password" required minLength={8} autoComplete="new-password" /></label>
          <label className="fld"><span>Дахин оруулах</span><input type="password" name="password2" required minLength={8} autoComplete="new-password" /></label>
          <Submit>Хадгалах</Submit>
        </form>
      </div>
    </div>
  );
}
