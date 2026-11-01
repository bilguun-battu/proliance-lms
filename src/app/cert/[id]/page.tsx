import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser, homeFor } from '@/lib/auth';
import { one } from '@/lib/db';
import { certState, type Certificate } from '@/lib/certs';
import { verifyQr, verifyUrl } from '@/lib/certview';
import { CATEGORY_LABEL } from '@/lib/progress';
import { fmtDate } from '@/lib/format';
import PrintButton from '@/components/PrintButton';
import './cert.css';

export const dynamic = 'force-dynamic';
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Гэрчилгээ: эзэн, админ, тухайн байгууллагын хариуцагч харж, хэвлэнэ
export default async function CertPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await requireUser();
  const c = await one<Certificate & { org_id: string | null }>(
    'SELECT c.*, u.org_id FROM certificates c JOIN users u ON u.id=c.user_id WHERE c.id=$1', [params.id]);
  if (!c) notFound();
  const allowed = me.role === 'ADMIN' || me.id === c.user_id || (me.role === 'COORDINATOR' && me.orgId === c.org_id);
  if (!allowed) notFound();
  const [state, tone] = certState(c);
  const qr = await verifyQr(c.number);
  const back = me.role === 'ADMIN' ? `/admin/learners/${c.user_id}` : me.id === c.user_id ? '/portal/profile' : homeFor(me.role);
  return (
    <div className="certpage">
      <div className="certbar">
        <Link className="link" href={back}>← Буцах</Link>
        <span className={`chip c-${tone}`}>{state}</span>
        <PrintButton />
      </div>
      <article className="cert" aria-label={`Гэрчилгээ ${c.number}`}>
        <div className="cert-band" />
        <div className="cert-inner">
          <header className="cert-head">
            <img src={`${base}/logo.png`} alt="Proliance" className="cert-logo" />
            <div className="cert-no"><span>Гэрчилгээний дугаар</span><strong>{c.number}</strong></div>
          </header>
          <div className="cert-body">
            <p className="cert-kicker">Certificate of completion</p>
            <h1>ГЭРЧИЛГЭЭ</h1>
            <p className="cert-lead">Энэхүү гэрчилгээг</p>
            <p className="cert-name">{c.user_name}</p>
            <p className="cert-who">{[c.position, c.department, c.org_name].filter(Boolean).join(' · ')}</p>
            <p className="cert-lead">дараах сургалтыг амжилттай дуусгасныг гэрчилж олгов.</p>
            <p className="cert-course">{c.course_title}</p>
            <p className="cert-tags">
              <span>{CATEGORY_LABEL[c.category] ?? c.category}</span>
              <span>Хувилбар {c.version}</span>
              {c.mandatory && <span>Заавал хамрагдах сургалт</span>}
            </p>
          </div>
          <footer className="cert-foot">
            <div className="cert-meta">
              <div><span>Олгосон огноо</span><strong>{fmtDate(c.issued_at)}</strong></div>
              <div><span>Хүчинтэй хугацаа</span><strong>{c.valid_until ? `${fmtDate(c.valid_until)} хүртэл` : 'Хугацаагүй'}</strong></div>
            </div>
            <div className="cert-sign">
              <div className="line" />
              <span>Сургалт хариуцсан ажилтан</span>
              <span className="muted">Пролианс ХХК</span>
            </div>
            <div className="cert-qr">
              <div dangerouslySetInnerHTML={{ __html: qr }} />
              <span>Баталгаажуулах</span>
            </div>
          </footer>
        </div>
      </article>
      <p className="certnote small muted">Гэрчилгээний жинхэнэ эсэхийг QR кодоор эсвэл <span className="num">{verifyUrl(c.number)}</span> хаягаар шалгана.</p>
    </div>
  );
}
