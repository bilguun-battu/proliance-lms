import { STATE_LABEL, COURSE_LABEL, ModState } from '@/lib/progress';

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: string }) {
  return <span className={`chip c-${tone}`}>{label}</span>;
}
export function StateChip({ state }: { state: ModState }) {
  const [l, t] = STATE_LABEL[state];
  return <Chip label={l} tone={t} />;
}
export function CourseChip({ k }: { k: string }) {
  const [l, t] = COURSE_LABEL[k];
  return <Chip label={l} tone={t} />;
}
export function Flash({ sp }: { sp: { ok?: string; err?: string } }) {
  if (sp.err) return <div className="alert err">{sp.err}</div>;
  if (sp.ok) return <div className="alert ok">{sp.ok}</div>;
  return null;
}
export function Bar({ value }: { value: number }) {
  return <div className="bar"><span style={{ width: `${Math.round(value * 100)}%` }} /></div>;
}
