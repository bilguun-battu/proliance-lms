import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { canAccessCourse, courseProgress, REQUIRED, CATEGORY_LABEL, CAT_TONE, FORMAT_LABEL } from '@/lib/progress';
import { StateChip } from '@/components/ui';
import { fmtDate, fmtDuration } from '@/lib/format';
import { complianceRows, COMP_LABEL, COMPLIANT_SET } from '@/lib/compliance';
import CourseCover from '@/components/CourseCover';
import LearnFrame from '@/components/LearnFrame';

export default async function CoursePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const u = await requireUser('LEARNER', 'COORDINATOR');
  if (!(await canAccessCourse(u.id, params.id))) notFound();
  const c = await one<any>(`SELECT c.*, (SELECT string_agg(p.code, ', ') FROM course_products cp JOIN products p ON p.id=cp.product_id WHERE cp.course_id=c.id) AS codes
    FROM courses c WHERE c.id=$1`, [params.id]);
  const p = (await courseProgress(u.id, params.id))!;
  const versions = await all<any>(`SELECT number, notes, published_at FROM course_versions WHERE course_id=$1 AND status='PUBLISHED' ORDER BY number DESC`, [c.id]);
  const mand = (await complianceRows({ user: u.id, course: c.id }))[0];
  const cert = await one<any>('SELECT id, number FROM certificates WHERE user_id=$1 AND course_id=$2 AND NOT revoked ORDER BY issued_at DESC LIMIT 1', [u.id, c.id]);
  const updated = p.version.number > 1 && p.modules.some(m => m.state === 'retake' || m.state === 'newmod' || m.state === 'recommended');
  const mins = p.modules.reduce((t, m) => t + (m.duration_min || 0), 0);
  const req = p.modules.filter(m => REQUIRED.includes(m.state));
  return (
    <LearnFrame course={c} modules={p.modules} current={null}>
      <div className="lhero">
        <div className="lhero-img"><CourseCover title={c.title} category={c.category} cover={c.cover_file} codes={c.codes} /></div>
        <div className="stack" style={{ alignContent: 'start' }}>
          <span className={`ccat t-${CAT_TONE[c.category]}`}>{CATEGORY_LABEL[c.category]}</span>
          <h1 className="ltitle">{c.title}</h1>
          <div className="ccard-meta"><span>📚 {p.total} модуль</span>{mins > 0 && <span>⏱ {fmtDuration(mins)}</span>}<span>v{p.version.number}</span>{c.codes && <span className="num">{c.codes}</span>}</div>
          <div className="ccard-prog"><div className="bar" style={{ maxWidth: 'none' }}><span style={{ width: `${p.total ? Math.round((p.done / p.total) * 100) : 0}%` }} /></div>
            <span className="small muted num">{p.done}/{p.total}</span></div>
          {cert && <Link className="link small" href={`/cert/${cert.id}`}>🎓 Гэрчилгээ {cert.number}</Link>}
        </div>
      </div>
      {mand && <div className={`notice ${mand.status === 'OVERDUE' || mand.status === 'EXPIRED' ? '' : 'soft'}`}>
        <strong>Заавал хамрагдах сургалт · {COMP_LABEL[mand.status][0]}</strong>
        <span className="small">{COMPLIANT_SET.includes(mand.status)
          ? (mand.validUntil ? `${fmtDate(mand.validUntil)} хүртэл хүчинтэй. ${mand.recurrence} сар тутам дахин сууна.` : 'Та энэ сургалтыг дуусгасан.')
          : mand.status === 'EXPIRED' ? `${fmtDate(mand.validUntil)}-нд хүчингүй болсон. Дахин сууна уу.` : `Эцсийн хугацаа: ${fmtDate(mand.due)}.`}</span>
      </div>}
      {updated && <div className="notice"><strong>{p.version.number}-р хувилбар гарсан ({fmtDate(p.version.published_at)})</strong>
        <span className="small">{p.version.notes}</span>
        <span className="small" style={{ opacity: .9 }}>Өмнө нь дуусгасан, өөрчлөгдөөгүй модулиуд тань хэвээр тооцогдоно.</span></div>}
      {c.description && <section className="lsec"><h2>Сургалтын тухай</h2><p style={{ whiteSpace: 'pre-wrap' }}>{c.description}</p></section>}
      <section className="lsec">
        <h2>{req.length ? `Үзэх шаардлагатай ${req.length} модуль` : 'Бүх модулийг дуусгасан байна'}</h2>
        <div className="list">{(req.length ? req : p.modules).map(m => (
          <Link key={m.module_key} className={`row ${!m.unlocked ? 'locked' : ''}`} href={m.unlocked ? `/portal/courses/${c.id}/m/${m.module_key}` : '#'}>
            <div><strong>{m.title}</strong><div className="meta"><span className="fmt">{FORMAT_LABEL[m.format]}</span>{m.duration_min > 0 && <span>{fmtDuration(m.duration_min)}</span>}<StateChip state={m.state} /></div>
              {!m.unlocked && <div className="small muted">Өмнөх модулиа дуусгасны дараа нээгдэнэ.</div>}</div>
          </Link>))}</div>
      </section>
      {versions.length > 1 && <section className="lsec">
        <h2>Хувилбарын түүх</h2>
        {versions.map(v => <div key={v.number} className={`ver ${v.number === p.version.number ? 'cur' : ''}`}>
          <div className="small"><strong className="num">v{v.number}</strong> <span className="muted">{fmtDate(v.published_at)}</span></div>
          {v.notes && <div className="small">{v.notes}</div>}</div>)}
      </section>}
    </LearnFrame>
  );
}
