import { ojtToggle, ojtSubmit, vocRequest } from '@/app/actions/practical';
import Submit from './Submit';
import { Chip } from './ui';
import { fmtDateTime } from '@/lib/format';

export const PR_LABEL: Record<string, [string, string]> = {
  IN_PROGRESS: ['Гүйцэтгэж байна', 'info'], SUBMITTED: ['Баталгаажуулалт хүлээж байна', 'warn'], REQUESTED: ['Үнэлгээ хүлээж байна', 'warn'],
  COMPETENT: ['Competent · баталгаажсан', 'ok'], NYC: ['Not yet competent', 'crit'],
};

type Rec = { id: string; status: string; items: any[]; comments: string; assessed_at: string | null; assessor: string | null; created_at: string; mver: number };

// Суралцагчийн OJT шалгах хуудас / VoC хүсэлт ба түүх
export default function PracticalLearner({ kind, courseId, moduleKey, items, open, history, done }: {
  kind: 'OJT' | 'VOC'; courseId: string; moduleKey: string; items: string[]; open: Rec | null; history: Rec[]; done: boolean;
}) {
  const hid = <><input type="hidden" name="course_id" value={courseId} /><input type="hidden" name="module_key" value={moduleKey} /></>;
  const list = open?.items ?? items.map(t => ({ text: t, done: false }));
  const editable = kind === 'OJT' && !done && (!open || open.status === 'IN_PROGRESS');
  const doneN = list.filter((i: any) => i.done).length;
  return (
    <>
      <section className="panel">
        <div className="head">
          <h2>{kind === 'OJT' ? 'Ажлын байран дээрх даалгаврууд' : 'Ур чадварын шалгуурууд'}</h2>
          {done ? <Chip label="Competent · баталгаажсан" tone="ok" /> : open ? <Chip label={PR_LABEL[open.status][0]} tone={PR_LABEL[open.status][1]} /> : null}
        </div>
        <p className="small muted" style={{ margin: 0 }}>{kind === 'OJT'
          ? 'Даалгавар бүрийг ажлын байран дээр гүйцэтгээд тэмдэглэнэ. Бүгдийг дуусгаад хянагчид илгээхэд сургагч эрхтэй ажилтан баталгаажуулна.'
          : 'Үнэлэгч таныг ажлын байран дээр ажиглаж, шалгуур бүрээр үнэлнэ. Бэлэн болсон үедээ үнэлгээ хүсээрэй.'}</p>
        {open?.status === 'IN_PROGRESS' && open.comments && <div className="alert err">Хянагчийн тайлбар: {open.comments}</div>}
        <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
          {list.map((it: any, i: number) => (
            <div key={i} className="row" style={{ padding: '12px 16px' }}>
              <div>
                <div className="acts" style={{ justifyContent: 'flex-start', flexWrap: 'nowrap', gap: 10 }}>
                  {kind === 'OJT' && <span aria-hidden style={{ width: 22, height: 22, borderRadius: 6, flex: 'none', display: 'grid', placeItems: 'center', fontWeight: 800, color: '#fff', background: it.done || done ? 'var(--ok)' : 'var(--field)' }}>{it.done || done ? '✓' : ''}</span>}
                  <span>{i + 1}. {it.text}</span>
                </div>
                {it.at && <div className="meta">{fmtDateTime(it.at)}{it.note ? ` · ${it.note}` : ''}</div>}
              </div>
              {editable && <form action={ojtToggle} className="acts">{hid}<input type="hidden" name="idx" value={i} />
                <Submit className={`btn sm ${it.done ? 'ghost' : ''}`}>{it.done ? 'Болих' : 'Гүйцэтгэсэн'}</Submit></form>}
            </div>))}
        </div>
        {editable && <form action={ojtSubmit} className="acts" style={{ justifyContent: 'flex-start' }}>{hid}
          <Submit className="btn" confirmText="Хянагчид баталгаажуулалтад илгээх үү?">Хянагчид илгээх ({doneN}/{list.length})</Submit></form>}
        {kind === 'VOC' && !done && !open && <form action={vocRequest}>{hid}<Submit>Үнэлгээ хүсэх</Submit></form>}
      </section>
      {history.length > 0 && <section className="panel">
        <h2>Үнэлгээний түүх</h2>
        {history.map(h => (
          <div key={h.id} className="ver">
            <div className="acts" style={{ justifyContent: 'flex-start' }}><Chip label={PR_LABEL[h.status][0]} tone={PR_LABEL[h.status][1]} /><span className="small muted">{fmtDateTime(h.assessed_at)}{h.assessor ? ` · ${h.assessor}` : ''}</span></div>
            {kind === 'VOC' && <div className="small">{h.items.map((it: any, i: number) => <div key={i}>{it.result === 'PASS' ? '✓' : '✗'} {it.text}{it.note ? ` — ${it.note}` : ''}</div>)}</div>}
            {h.comments && <div className="small muted">{h.comments}</div>}
          </div>))}
      </section>}
    </>
  );
}
