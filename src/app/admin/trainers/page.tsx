import Link from 'next/link';
import { all } from '@/lib/db';
import { grantTrainer, revokeTrainer } from '@/app/actions/admin';
import { Flash, Chip } from '@/components/ui';
import { AUDIENCE_LABEL } from '@/lib/progress';
import { fmtDate } from '@/lib/format';
import Submit from '@/components/Submit';

export default async function Trainers({ searchParams }: { searchParams: { ok?: string; err?: string } }) {
  const quals = await all<any>(`
    SELECT q.*, u.name, u.position, o.name AS org, c.title, c.audience FROM trainer_quals q JOIN users u ON u.id=q.user_id
      LEFT JOIN orgs o ON o.id=u.org_id JOIN courses c ON c.id=q.course_id ORDER BY u.name, c.title`);
  const ttt = await all<any>(`
    SELECT c.id, c.title, (SELECT string_agg(x.title, ', ') FROM course_trainer_targets t JOIN courses x ON x.id=t.target_course_id WHERE t.course_id=c.id) AS targets
      FROM courses c WHERE c.category='TTT' ORDER BY c.title`);
  const users = await all<any>(`SELECT u.id, u.name, o.name AS org FROM users u LEFT JOIN orgs o ON o.id=u.org_id WHERE u.active AND u.role <> 'ADMIN' ORDER BY o.is_internal DESC NULLS LAST, u.name`);
  const courses = await all<any>('SELECT id, title, audience FROM courses ORDER BY audience, title');
  const people = Array.from(new Map(quals.map(q => [q.user_id, q])).values());
  return (
    <>
      <div className="head"><div><h1>Сургагч багш</h1><p className="muted">Сургалт заах, OJT баталгаажуулах, VoC үнэлэх эрхтэй хүмүүс. Train the Trainer сургалтыг дуусгахад эрх автоматаар олгогдоно.</p></div></div>
      <Flash sp={searchParams} />
      <section className="panel">
        <h2>Train the Trainer сургалтууд</h2>
        {ttt.length ? <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>{ttt.map(t => (
          <Link key={t.id} href={`/admin/courses/${t.id}`} className="row"><div><strong>{t.title}</strong><div className="meta">Дуусгавал эрх олгох: {t.targets || 'сонгоогүй'}</div></div><div className="acts"><Chip label="TtT" tone="ttt" /></div></Link>))}</div>
          : <p className="muted">TtT сургалт алга. Сургалт үүсгэхдээ төрлийг "Train the Trainer" гэж сонгоно.</p>}
      </section>
      <section className="panel">
        <h2>Эрх ({people.length} сургагч)</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Сургагч</th><th>Сургалт</th><th>Хэрхэн</th><th>Огноо</th><th></th></tr></thead>
          <tbody>{quals.map(q => (
            <tr key={q.user_id + q.course_id}>
              <td><strong>{q.name}</strong><div className="small muted">{q.org}{q.position ? ` · ${q.position}` : ''}</div></td>
              <td>{q.title}<div className="small muted">{AUDIENCE_LABEL[q.audience]}</div></td>
              <td>{q.source === 'TTT' ? <Chip label="TtT дуусгасан" tone="ttt" /> : <Chip label="Админ олгосон" />}</td>
              <td className="small num">{fmtDate(q.granted_at)}</td>
              <td><form action={revokeTrainer}><input type="hidden" name="user_id" value={q.user_id} /><input type="hidden" name="course_id" value={q.course_id} />
                <Submit className="btn sm danger" confirmText="Эрхийг цуцлах уу?">Цуцлах</Submit></form></td>
            </tr>))}
            {!quals.length && <tr><td colSpan={5} className="muted">Сургагч алга.</td></tr>}
          </tbody></table></div>
      </section>
      <section className="panel">
        <h2>Эрх гараар олгох</h2>
        <form action={grantTrainer} className="form">
          <label className="fld"><span>Хүн</span><select name="user_id">{users.map(u => <option key={u.id} value={u.id}>{u.name} · {u.org}</option>)}</select></label>
          <label className="fld"><span>Сургалт</span><select name="course_id">{courses.map(c => <option key={c.id} value={c.id}>{c.audience === 'INTERNAL' ? '[Дотоод] ' : ''}{c.title}</option>)}</select></label>
          <div><Submit>Олгох</Submit></div>
        </form>
      </section>
    </>
  );
}
