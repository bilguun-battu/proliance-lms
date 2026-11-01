'use client';
import { useFormStatus } from 'react-dom';

export default function Submit({ children, className = 'btn', confirmText }: { children: React.ReactNode; className?: string; confirmText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      disabled={pending}
      onClick={e => { if (confirmText && !window.confirm(confirmText)) e.preventDefault(); }}
    >
      {pending ? 'Түр хүлээнэ үү…' : children}
    </button>
  );
}
