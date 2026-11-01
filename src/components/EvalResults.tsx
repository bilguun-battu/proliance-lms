import { RATING_LABELS, QuestionStat } from '@/lib/evals';

// Асуулт бүрийн дундаж оноо, тархалт, сонголт, сэтгэгдэл
export default function EvalResults({ data }: { data: { responses: number; stats: QuestionStat[]; sectionAvg: { section: string; avg: number }[]; overall: number | null } }) {
  if (!data.responses) return <p className="muted">Одоогоор хариулт ирээгүй байна.</p>;
  const sections = Array.from(new Set(data.stats.map(s => s.section)));
  const tone = (v: number) => (v >= 4 ? 'var(--ok)' : v >= 3 ? 'var(--warn)' : 'var(--crit)');
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="evtiles">
        <div className="evtile"><span className="small muted">Нийт үнэлгээ</span><strong style={{ color: data.overall ? tone(data.overall) : undefined }}>{data.overall ? data.overall.toFixed(2) : '—'}<small>/5</small></strong></div>
        <div className="evtile"><span className="small muted">Хариулсан</span><strong>{data.responses}</strong></div>
        {data.sectionAvg.map(s => <div key={s.section} className="evtile"><span className="small muted">{s.section}</span><strong style={{ color: tone(s.avg) }}>{s.avg.toFixed(2)}</strong></div>)}
      </div>
      {sections.map(sec => (
        <div key={sec} className="stack">
          <h3 className="fmt" style={{ fontSize: '.8rem' }}>{sec}</h3>
          {data.stats.filter(s => s.section === sec).map(s => (
            <div key={s.qid + s.text} className="evq">
              <div className="acts" style={{ justifyContent: 'space-between' }}>
                <span>{s.text}</span>
                {s.kind === 'RATING' && s.avg !== null && <strong className="num" style={{ color: tone(s.avg) }}>{s.avg.toFixed(2)}</strong>}
              </div>
              {s.kind === 'RATING' && <div className="evbars">{s.dist.map((c, i) => (
                <div key={i} className="evbar" title={`${RATING_LABELS[i]}: ${c}`}>
                  <span className="small muted num">{i + 1}</span>
                  <div className="evtrack"><span style={{ width: `${s.n ? (c / s.n) * 100 : 0}%` }} /></div>
                  <span className="small num">{c}</span>
                </div>))}</div>}
              {s.kind === 'CHOICE' && <div className="evbars">{Object.entries(s.choices).sort((a, b) => b[1] - a[1]).map(([k, c]) => (
                <div key={k} className="evbar wide"><span className="small">{k}</span><div className="evtrack"><span style={{ width: `${(c / s.n) * 100}%` }} /></div><span className="small num">{c}</span></div>))}</div>}
              {s.kind === 'TEXT' && (s.comments.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{s.comments.map((c, i) => <li key={i}>{c.text}{c.who && <span className="muted"> — {c.who}</span>}</li>)}</ul> : <span className="small muted">Сэтгэгдэл алга.</span>)}
            </div>))}
        </div>))}
    </div>
  );
}
