import Link from 'next/link';
import { all, one } from '@/lib/db';
import { Chip, Bar } from '@/components/ui';
import { complianceRows, COMP_LABEL, COMPLIANT_SET } from '@/lib/compliance';
import { userCertificates, certState } from '@/lib/certs';
import { positionHistory } from '@/lib/positions';
import { learnerCourseIds, courseProgress, CATEGORY_LABEL, CAT_TONE, COURSE_LABEL } from '@/lib/progress';
import { userAssignments, TARGET_LABEL } from '@/lib/assign';
import { fmtDate } from '@/lib/format';

// Хүний сургалтын профайл: заавал хамрагдах, бусад сургалт, гэрчилгээ, албан тушаалын түүх
export default async function ProfileView({ userId, courseHref }: { userId: string; courseHref?: (courseId: string) => string }) {
  const u = await one<any>(`SELECT u.*, o.name AS org, coalesce(o.is_internal,false) AS internal FROM users u LEFT JOIN orgs o ON o.id=u.org_id WHERE u.id=$1`, [userId]);
  if (!u) return null;
  const comp = await complianceRows({ user: userId });
  const certs = await userCertificates(userId);
  const hist = await positionHistory(userId);
  const assigns = await userAssignments(userId);
  const cats = Object.fromEntries((await all<any>('SELECT id, category FROM courses')).map(c => [c.id, c.category]));
  const mandIds = new Set(comp.map(r => r.course_id));
  const other = [];
  for (const cid of await learnerCourseIds(userId)) {
    if (mandIds.has(cid)) continue;
    const p = await courseProgress(userId, cid);
    if (p && (p.done > 0 || certs.some(c => c.course_id === cid))) other.push({ cid, p, title: (await one<any>('SELECT title FROM courses WHERE id=$1', [cid])).title });
  }
  const ok = comp.filter(r => COMPLIANT_SET.includes(r.status)).length;
  const completedCourses = new Set(certs.filter(c => !c.revoked).map(c => c.course_id)).size;
  const sourceOf = (cid: string) => {
    const a = assigns.filter(x => x.course_id === cid);
    if (a.some(x => x.target === 'POSITION')) return `Албан тушаал: ${u.position}`;
    return a.map(x => TARGET_LABEL[x.target]).join(', ');
  };
  const link = (cid: string, t: string) => courseHref ? <Link className="link" href={courseHref(cid)}>{t}</Link> : t;
  return (
    <>
      <section className="panel">
        <div className="head" style={{ alignItems: 'flex-start' }}>
          <div><h2 style={{ marginBottom: 4 }}>{u.name}</h2>
            <p className="muted">{[u.position, u.department, u.org].filter(Boolean).join(' · ')}</p>
            {u.position_since && <p className="small muted">Одоогийн албан тушаалд {fmtDate(u.position_since)}-нээс</p>}</div>
        </div>
        <div className="evtiles">
          <div className="evtile"><span className="small muted">Заавал хамрагдах сургалт</span><strong>{ok}/{comp.length}</strong><span className="small muted">хүчинтэй</span></div>
          <div className="evtile"><span className="small muted">Нийт дуусгасан сургалт</span><strong>{completedCourses}</strong><span className="small muted">заавал болон сонгон</span></div>
          <div className="evtile"><span className="small muted">Гэрчилгээ</span><strong>{certs.length}</strong><span className="small muted">{certs.filter(c => certState(c)[1] === 'ok').length} хүчинтэй</span></div>
        </div>
      </section>

      <section className="panel">
        <h2>Заавал хамрагдах сургалт ({comp.length})</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Сургалт</th><th>Төрөл</th><th>Үндэслэл</th><th>Төлөв</th><th>Хугацаа</th></tr></thead>
          <tbody>{comp.map(r => (
            <tr key={r.course_id}><td><strong>{link(r.course_id, r.course)}</strong><div className="small muted">{r.done}/{r.total} модуль{r.recurrence ? ` · ${r.recurrence} сар тутам` : ''}</div></td>
              <td><Chip label={CATEGORY_LABEL[cats[r.course_id]]} tone={CAT_TONE[cats[r.course_id]]} /></td>
              <td className="small">{sourceOf(r.course_id)}</td>
              <td><Chip label={COMP_LABEL[r.status][0]} tone={COMP_LABEL[r.status][1]} /></td>
              <td className="small num">{COMPLIANT_SET.includes(r.status) ? (r.validUntil ? `${fmtDate(r.validUntil)} хүртэл` : 'Дууссан') : fmtDate(r.due)}</td></tr>))}
            {!comp.length && <tr><td colSpan={5} className="muted">Заавал хамрагдах сургалт оноогдоогүй.</td></tr>}
          </tbody></table></div>
      </section>

      <section className="panel">
        <h2>Бусад суусан сургалт ({other.length})</h2>
        <p className="small muted">Заавал биш боловч өөрөө сонгож суусан сургалт.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Сургалт</th><th>Төрөл</th><th>Явц</th><th>Төлөв</th></tr></thead>
          <tbody>{other.map(({ cid, p, title }) => (
            <tr key={cid}><td><strong>{link(cid, title)}</strong></td><td><Chip label={CATEGORY_LABEL[cats[cid]]} tone={CAT_TONE[cats[cid]]} /></td>
              <td style={{ minWidth: 140 }}><Bar value={p.total ? p.done / p.total : 0} /><span className="small muted">{p.done}/{p.total} модуль</span></td>
              <td><Chip label={COURSE_LABEL[p.key][0]} tone={COURSE_LABEL[p.key][1]} /></td></tr>))}
            {!other.length && <tr><td colSpan={4} className="muted">Одоогоор алга.</td></tr>}
          </tbody></table></div>
      </section>

      <section className="panel">
        <h2>Гэрчилгээ ({certs.length})</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Дугаар</th><th>Сургалт</th><th>Олгосон</th><th>Хүчинтэй</th><th>Төлөв</th><th></th></tr></thead>
          <tbody>{certs.map(c => { const [l, t] = certState(c); return (
            <tr key={c.id}><td className="num small">{c.number}</td><td><strong>{c.course_title}</strong>{c.mandatory && <div className="small muted">Заавал хамрагдах</div>}</td>
              <td className="small num">{fmtDate(c.issued_at)}</td><td className="small num">{c.valid_until ? fmtDate(c.valid_until) : 'Хугацаагүй'}</td>
              <td><Chip label={l} tone={t} /></td><td><Link className="btn sm ghost" href={`/cert/${c.id}`}>Харах, хэвлэх</Link></td></tr>); })}
            {!certs.length && <tr><td colSpan={6} className="muted">Гэрчилгээ алга. Сургалтыг бүрэн дуусгахад автоматаар олгогдоно.</td></tr>}
          </tbody></table></div>
      </section>

      <section className="panel">
        <h2>Албан тушаалын түүх</h2>
        <p className="small muted">Албан тушаал бүрт байхдаа дуусгасан сургалт. Өмнөх албан тушаал дээрх сургалтын түүх хадгалагдана.</p>
        <ol className="timeline">{hist.map((h, i) => {
          const start = new Date(h.started_at).getTime(), end = h.ended_at ? new Date(h.ended_at).getTime() : Infinity;
          const during = certs.filter(c => { const t = new Date(c.issued_at).getTime(); return t >= start && t < end; });
          return (
            <li key={i} className={h.ended_at ? '' : 'cur'}>
              <div className="tl-head"><strong>{h.position ?? 'Албан тушаалгүй'}</strong>{h.department && <span className="muted"> · {h.department}</span>}
                {!h.ended_at && <Chip label="Одоогийн" tone="brand" />}</div>
              <div className="small muted num">{fmtDate(h.started_at)} — {h.ended_at ? fmtDate(h.ended_at) : 'одоо'}</div>
              {during.length ? <ul className="tl-list">{during.map(c => <li key={c.id}><Link className="link" href={`/cert/${c.id}`}>{c.course_title}</Link> <span className="small muted">· {fmtDate(c.issued_at)}{c.mandatory ? ' · заавал' : ''}</span></li>)}</ul>
                : <div className="small muted">Энэ хугацаанд дуусгасан сургалт алга.</div>}
            </li>);
        })}</ol>
      </section>
    </>
  );
}
