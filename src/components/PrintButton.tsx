'use client';
export default function PrintButton({ label = 'Хэвлэх / PDF хадгалах' }: { label?: string }) {
  return <button type="button" className="btn" onClick={() => window.print()}>{label}</button>;
}
