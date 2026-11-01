const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Ангилал бүрийн өнгө ба тэмдэг (нүүр зураг оруулаагүй үед)
const STYLE: Record<string, { from: string; to: string; icon: string }> = {
  ELEARN: { from: '#ff8a7d', to: '#e8574a', icon: 'M8 5v14l11-7z' },
  ONLINE: { from: '#4aa3df', to: '#1f6fb3', icon: 'M3 6h12v12H3zM15 10l6-4v12l-6-4z' },
  INPERSON: { from: '#f2a35e', to: '#d4660f', icon: 'M3 21V9l9-6 9 6v12h-6v-7H9v7z' },
  BLENDED: { from: '#8a93a8', to: '#4b5568', icon: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17l10 5 10-5' },
  OJT: { from: '#9b85fb', to: '#6a4fe0', icon: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z' },
  VOC: { from: '#33b5a8', to: '#0e7c70', icon: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zM9 12l2 2 4-4' },
  TTT: { from: '#e05aa0', to: '#a8115e', icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6' },
};

export default function CourseCover({ title, category, cover, codes }: { title: string; category: string; cover?: string | null; codes?: string | null }) {
  if (cover) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="cover" src={`${base}/api/files/${cover}`} alt="" loading="lazy" />;
  }
  const st = STYLE[category] ?? STYLE.ELEARN;
  return (
    <div className="cover gen" style={{ background: `linear-gradient(135deg, ${st.from}, ${st.to})` }} aria-hidden="true">
      <svg className="cover-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={st.icon} /></svg>
      <span className="cover-t">{title}</span>
      {codes && <span className="cover-code">{codes}</span>}
    </div>
  );
}
