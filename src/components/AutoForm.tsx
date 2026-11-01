'use client';
// Сонголт өөрчлөгдөхөд маягтыг шууд илгээнэ
export default function AutoForm({ action, children, className }: { action: (fd: FormData) => void; children: React.ReactNode; className?: string }) {
  return (
    <form action={action} className={className} onChange={e => (e.currentTarget as HTMLFormElement).requestSubmit()}>
      {children}
    </form>
  );
}
