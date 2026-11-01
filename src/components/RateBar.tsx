// Биелэлтийн хувь: 90%+ ногоон, 70%+ шар, бусад улаан
export default function RateBar({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">—</span>;
  const pct = Math.round(value * 100);
  const c = value >= 0.9 ? 'var(--ok)' : value >= 0.7 ? 'var(--warn)' : 'var(--crit)';
  return (
    <div className="acts" style={{ justifyContent: 'flex-start', flexWrap: 'nowrap' }}>
      <div className="evtrack" style={{ width: 120, flex: 'none' }}><span style={{ width: `${pct}%`, background: c }} /></div>
      <strong className="num" style={{ color: c }}>{pct}%</strong>
    </div>
  );
}
