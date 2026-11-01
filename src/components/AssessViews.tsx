import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all, one } from '@/lib/db';
import { ACCESS_SQL } from '@/lib/assign';
import { canAssess, publishedVersion, versionModules, AUDIENCE_LABEL } from '@/lib/progress';
import { assessRecord } from '@/app/actions/practical';
import type { SessionUser } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { Chip, Flash } from './ui';
import Submit from './Submit';
import { PR_LABEL } from './PracticalLearner';

// Үнэлэгч хандах боломжтой сургалтууд: админ бол бүгд, сургагч бол эрх авсан сургалтууд
async function assessableCourses(u: SessionUser) {
  return u.role === 'ADMIN'
    ? all<any>('SELECT id, title, audience FROM courses ORDER BY audience, title')
    : all<any>('SELECT c.id, c.title, c.audience FROM trainer_quals q JOIN courses c ON c.id=q.course_id WHERE q.user_id=$1 ORDER BY c.title', [u.id]);
}

export async function AssessQueue({ user, base, sp }: { user: SessionUser; base: string; sp: { ok?: string; err?: string } }) {
  const courses = await assessableCourses(user);
  const ids = courses.map(c => c.id);
  const pending = await all<any>(`
    SELECT r.*, u.name, o.name AS org, c.title AS course, c.audience FROM practical_records r JOIN users u ON u.id=r.user_id LEFT JOIN orgs o ON o.id=u.org_id
      JOIN courses c ON c.id=r.course_id WHERE r.course_id = ANY($1) AND r.status IN ('SUBMITTED','REQUESTED') AND r.user_id <> $2 ORDER BY r.updated_at`, [ids, user.id]);
  const recent = await all<any>(`
    SELECT r.*, u.name, c.title AS course, a.name AS assessor FROM practical_records r JOIN users u ON u.id=r.user_id JOIN courses c ON c.id=r.course_id
      LEFT JOIN users a ON a.id=r.assessor_id WHERE r.course_id = ANY($1) AND r.status IN ('COMPETENT','NYC') ORDER BY r.assessed_at DESC LIMIT 15`, [ids]);
  // VoC модультай сургалтууд, тэдгээрт хамрагдах хүмүүс (үнэлэгч өөрөө эхлүүлэх)
  const vocMods: { course_id: string; course: string; key: string; title: string }[] = [];
  for (const c of courses) {
    const v = await publishedVersion(c.id);
    if (!v) continue;
    for (const m of (await versionModules(v.id)).filter(m => m.format === 'VOC')) vocMods.push({ course_id: c.id, course: c.title, key: m.module_key, title: m.title });
  }
  const people = vocMods.length ? await all<any>(`SELECT DISTINCT acc.cid, u.id, u.name FROM (${ACCESS_SQL}) acc JOIN users u ON u.id=acc.uid WHERE acc.cid = ANY($1) AND u.id <> $2 ORDER BY u.name`, [vocMods.map(m => m.course_id), user.id]) : [];
  return (
    <>
      <div className="head"><div><h1>OJT / VoC үнэлгээ</h1><p className="muted">{user.role === 'ADMIN' ? 'Бүх сургалтын' : 'Таны сургагч эрхтэй сургалтуудын'} ажлын байрны даалгавар болон ур чадварын баталгаажуулалт.</p></div></div>
      <Flash sp={sp} />
      {!courses.length && <div className="notice soft"><strong>Танд сургагч багшийн эрх алга.</strong><span className="small muted">Train the Trainer сургалт дуусгах эсвэл админаас эрх авна.</span></div>}
      <section className="panel">
        <h2>Хүлээгдэж буй ({pending.length})</h2>
        {pending.length ? <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>{pending.map(r => (
          <Link key={r.id} href={`${base}/${r.id}`} className="row req" style={{ ['--c' as any]: 'var(--warn)' }}>
            <div><strong>{r.name}</strong> <span className="muted small">· {r.org}</span>
              <div className="meta"><Chip label={r.kind} tone={r.kind === 'OJT' ? 'ojt' : 'voc'} /><span>{r.course}</span><span>{AUDIENCE_LABEL[r.audience]}</span><span>{fmtDateTime(r.updated_at)}</span></div></div>
            <div className="acts"><Chip label={PR_LABEL[r.status][0]} tone={PR_LABEL[r.status][1]} /><span className="btn sm">Үнэлэх</span></div>
          </Link>))}</div> : <p className="muted">Хүлээгдэж буй үнэлгээ алга.</p>}
      </section>
      {vocMods.length > 0 && <section className="panel">
        <h2>VoC үнэлгээ эхлүүлэх</h2>
        <p className="small muted" style={{ margin: 0 }}>Суралцагч хүсээгүй ч ажлын байран дээр ажиглаж үнэлж болно.</p>
        <form method="get" action={`${base}/new`} className="form">
          <label className="fld"><span>Модуль</span><select name="m">{vocMods.map(m => <option key={m.course_id + m.key} value={`${m.course_id}|${m.key}`}>{m.course} · {m.title}</option>)}</select></label>
          <label className="fld"><span>Суралцагч</span><select name="u">{people.map(p => <option key={p.cid + p.id} value={p.id}>{p.name}</option>)}</select></label>
          <div><button className="btn">Үнэлэх</button></div>
        </form>
      </section>}
      <section className="panel">
        <h2>Сүүлийн шийдвэрүүд</h2>
        {recent.length ? <div className="tablewrap"><table>
          <thead><tr><th>Суралцагч</th><th>Сургалт</th><th>Төрөл</th><th>Шийдвэр</th><th>Үнэлэгч</th><th>Огноо</th></tr></thead>
          <tbody>{recent.map(r => <tr key={r.id}><td>{r.name}</td><td>{r.course}</td><td>{r.kind}</td><td><Chip label={PR_LABEL[r.status][0]} tone={PR_LABEL[r.status][1]} /></td><td>{r.assessor}</td><td className="small num">{fmtDateTime(r.assessed_at)}</td></tr>)}</tbody>
        </table></div> : <p className="muted">Шийдвэр гараагүй байна.</p>}
      </section>
    </>
  );
}

export async function AssessForm({ user, base, id, newParams, sp }: { user: SessionUser; base: string; id?: string; newParams?: { m?: string; u?: string }; sp: { ok?: string; err?: string } }) {
  let r: any;
  if (id) {
    r = await one<any>(`SELECT r.*, u.name, o.name AS org, c.title AS course FROM practical_records r JOIN users u ON u.id=r.user_id LEFT JOIN orgs o ON o.id=u.org_id JOIN courses c ON c.id=r.course_id WHERE r.id=$1`, [id]);
    if (!r) notFound();
  } else {
    const [courseId, key] = (newParams?.m ?? '').split('|');
    const v = courseId ? await publishedVersion(courseId) : null;
    const m = v && (await versionModules(v.id)).find(x => x.module_key === key);
    const learner = await one<any>('SELECT u.name, o.name AS org FROM users u LEFT JOIN orgs o ON o.id=u.org_id WHERE u.id=$1', [newParams?.u]);
    if (!m || !learner) notFound();
    const items = await all<{ text: string }>('SELECT text FROM module_items WHERE module_id=$1 ORDER BY position', [m.id]);
    r = { id: '', kind: 'VOC', status: 'REQUESTED', user_id: newParams!.u, course_id: courseId, module_key: key, name: learner.name, org: learner.org,
      course: (await one<any>('SELECT title FROM courses WHERE id=$1', [courseId])).title, items: items.map(i => ({ text: i.text })) };
  }
  if (!(await canAssess(user.id, user.role, r.course_id))) return <div className="panel"><p>Танд энэ сургалтыг үнэлэх эрх алга.</p></div>;
  const mod = await one<any>(`SELECT m.title FROM modules m JOIN course_versions v ON v.id=m.version_id WHERE v.course_id=$1 AND m.module_key=$2 ORDER BY v.number DESC LIMIT 1`, [r.course_id, r.module_key]);
  const decided = ['COMPETENT', 'NYC'].includes(r.status);
  const back = `${base}/${id ?? ''}`.replace(/\/$/, '');
  return (
    <>
      <div><Link className="link small" href={base}>← Үнэлгээний жагсаалт</Link></div>
      <div className="head">
        <div><p className="fmt" style={{ margin: 0 }}>{r.kind === 'OJT' ? 'On the Job баталгаажуулалт' : 'Verification of Competency'}</p><h1>{r.name}</h1>
          <p className="muted">{r.org} · {r.course} · {mod?.title}</p></div>
        <Chip label={PR_LABEL[r.status][0]} tone={PR_LABEL[r.status][1]} />
      </div>
      <Flash sp={sp} />
      <form action={assessRecord} className="panel">
        <input type="hidden" name="record_id" value={r.id} />
        <input type="hidden" name="user_id" value={r.user_id} />
        <input type="hidden" name="course_id" value={r.course_id} />
        <input type="hidden" name="module_key" value={r.module_key} />
        <input type="hidden" name="back" value={base} />
        <h2>{r.kind === 'OJT' ? 'Суралцагчийн гүйцэтгэсэн даалгаврууд' : 'Шалгуур бүрийг үнэлнэ үү'}</h2>
        <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
          {(r.items as any[]).map((it, i) => (
            <div key={i} className="row" style={{ alignItems: 'start' }}>
              <div><strong>{i + 1}. {it.text}</strong>
                {r.kind === 'OJT' && <div className="meta">{it.done ? `✓ Гүйцэтгэсэн ${fmtDateTime(it.at)}` : 'Гүйцэтгээгүй'}{it.note ? ` · ${it.note}` : ''}</div>}
                {r.kind === 'VOC' && <input type="text" name={`n${i}`} defaultValue={it.note ?? ''} placeholder="Тэмдэглэл (заавал биш)" disabled={decided} style={{ marginTop: 6 }} />}
              </div>
              {r.kind === 'VOC' && <div className="checks">
                <label><input type="radio" name={`r${i}`} value="PASS" defaultChecked={it.result === 'PASS'} disabled={decided} /> Хангасан</label>
                <label><input type="radio" name={`r${i}`} value="FAIL" defaultChecked={it.result === 'FAIL'} disabled={decided} /> Хангаагүй</label>
              </div>}
            </div>))}
        </div>
        <label className="fld"><span>Үнэлэгчийн тайлбар</span><textarea name="comments" defaultValue={r.comments ?? ''} disabled={decided} placeholder={r.kind === 'OJT' ? 'Буцаах бол юуг засахыг бичнэ үү' : 'Ажиглалт, зөвлөмж'} /></label>
        {!decided ? <div className="acts" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" name="decision" value="COMPETENT">Competent · баталгаажуулах</button>
          {r.kind === 'OJT'
            ? <button className="btn ghost" name="decision" value="RETURN">Засвар хийлгэхээр буцаах</button>
            : <button className="btn danger" name="decision" value="NYC">Not yet competent</button>}
        </div> : <p className="small muted">Шийдвэрлэсэн: {fmtDateTime(r.assessed_at)}</p>}
        <p className="small muted" style={{ margin: 0 }}>Competent гэж шийдвэрлэхэд модуль дууссанд тооцогдож, давтан суух хугацаа (жишээ нь 24 сар) эхэлнэ. Суралцагчид мэдэгдэл очно.</p>
      </form>
    </>
  );
}
