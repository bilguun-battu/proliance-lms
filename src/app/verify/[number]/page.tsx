import { one } from '@/lib/db';
import { certState, type Certificate } from '@/lib/certs';
import { CATEGORY_LABEL } from '@/lib/progress';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Гэрчилгээний жинхэнэ эсэхийг нэвтрэхгүйгээр шалгана (QR код)
export default async function Verify({ params }: { params: { number: string } }) {
  const c = await one<Certificate>('SELECT * FROM certificates WHERE number=$1', [decodeURIComponent(params.number)]);
  const st = c ? certState(c) : null;
  return (
    <main className="auth">
      <div className="panel stack" style={{ width: "min(520px, 100%)" }}>
        <img src={`${base}/logo.png`} alt="Proliance" />
        <h1>Гэрчилгээ шалгах</h1>
        {!c ? <div className="alert err">“{decodeURIComponent(params.number)}” дугаартай гэрчилгээ олдсонгүй.</div> : <>
          <div className={`alert ${st![1] === 'ok' ? 'ok' : 'err'}`}><strong>{st![0]}</strong> · {c.number}</div>
          <dl className="kv">
            <dt>Эзэмшигч</dt><dd>{c.user_name}</dd>
            {c.org_name && <><dt>Байгууллага</dt><dd>{c.org_name}</dd></>}
            <dt>Сургалт</dt><dd>{c.course_title} <span className="small muted">({CATEGORY_LABEL[c.category] ?? c.category})</span></dd>
            <dt>Олгосон</dt><dd>{fmtDate(c.issued_at)}</dd>
            <dt>Хүчинтэй</dt><dd>{c.valid_until ? `${fmtDate(c.valid_until)} хүртэл` : 'Хугацаагүй'}</dd>
          </dl>
        </>}
        <p className="small muted" style={{ marginTop: 16 }}>Пролианс ХХК · Сургалтын систем</p>
      </div>
    </main>
  );
}
