import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all } from '@/lib/db';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { Flash } from '@/components/ui';
import Submit from '@/components/Submit';
import { fmtSession } from '@/lib/format';
import { getRequest, requestPeople, requestMessages, markSeen, REQ_STATUS } from '@/lib/requests';
import { getOffering, listOfferings, offCode, ENR_LABEL } from '@/lib/offerings';
import { adminReply, createRequestAccounts, linkRequestOffering } from '@/app/actions/requests';
import { RequestFacts, RequestPeople, RequestThread } from '@/components/RequestView';

export default async function AdminRequest(props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  await requireUser(...STAFF_ROLES);
  const r = await getRequest(id);
  if (!r) notFound();
  await markSeen(r.id, 'ADMIN');
  const [people, messages] = await Promise.all([requestPeople(r.id), requestMessages(r.id)]);
  const offering = r.offering_id ? await getOffering(r.offering_id) : null;
  // Тухайн сургалтын ирэх хуваарь
  const offerings = r.course_id ? await listOfferings(`x.course_id=$1 AND x.status='SCHEDULED' AND (x.first_at IS NULL OR x.first_at > now())`, [r.course_id]) : [];
  const enrolled: Record<string, string> = {};
  if (offering) for (const e of await all<any>('SELECT user_id, status FROM offering_enrollments WHERE offering_id=$1', [offering.id]))
    enrolled[e.user_id] = `${offCode(offering.num)} · ${ENR_LABEL[e.status as keyof typeof ENR_LABEL][0]}`;
  const unregistered = people.filter(p => !p.user_id);
  const registered = people.filter(p => p.user_id);
  const closed = ['DONE', 'REJECTED', 'CANCELLED'].includes(r.status);
  return (
    <div className="stack" style={{ maxWidth: 1000 }}>
      <Link className="link small" href="/admin/requests">← Сургалтын хүсэлт</Link>
      <Flash sp={sp} />
      <RequestFacts r={r} offering={offering} />
      <RequestPeople people={people} enrolled={offering ? enrolled : undefined} />

      {!closed && <section className="panel">
        <h2>Шийдвэрлэх</h2>
        {unregistered.length > 0 && <div className="stack">
          <p className="small" style={{ margin: 0 }}><strong>1. Системийн эрх үүсгэх.</strong> {unregistered.length} хүн системд бүртгэлгүй байна
            {unregistered.some(p => !p.email) && ' (имэйлгүй хүнд эрх үүсгэх боломжгүй, хариуцагчаас имэйлийг нь асууна уу)'}. Эрх үүсгэхэд байгууллагад нь нээлттэй цахим сургалтууд шууд нээгдэнэ.</p>
          <form action={createRequestAccounts}><input type="hidden" name="id" value={r.id} />
            <Submit className="btn sm">Эрх үүсгэж урилга илгээх ({unregistered.filter(p => p.email).length})</Submit></form>
        </div>}
        {r.course_id ? <div className="stack">
          <p className="small" style={{ margin: 0 }}><strong>{unregistered.length ? '2' : '1'}. Хуваарьт бүртгэх.</strong> Бүртгэлтэй {registered.length} хүнийг сонгосон хуваарьт бүртгэж, ажилтан бүрт болон хариуцагчид мэдэгдэл илгээнэ. Тохирох хуваарь байхгүй бол эхлээд шинээр үүсгэнэ.</p>
          {offerings.length ? <form action={linkRequestOffering} className="acts" style={{ justifyContent: 'flex-start' }}>
            <input type="hidden" name="id" value={r.id} />
            <select name="offering_id" required defaultValue={r.offering_id ?? ''} style={{ width: 'auto', maxWidth: '100%' }}>
              <option value="" disabled>Хуваарь сонгох</option>
              {offerings.map(o => <option key={o.id} value={o.id}>{offCode(o.num)} · {o.first_at ? fmtSession(o.first_at) : 'огноогүй'} · {o.location} · {o.max_capacity - o.taken} суудал</option>)}
            </select>
            <Submit className="btn sm" >Бүртгэх{registered.length ? ` (${registered.length})` : ''}</Submit>
          </form> : <p className="small muted" style={{ margin: 0 }}>Энэ сургалтад ирэх хуваарь алга.</p>}
          <div><Link className="btn sm ghost" href={`/admin/sessions/new?aud=customer&course=${r.course_id}`}>+ Шинэ хуваарь үүсгэх</Link></div>
        </div> : <p className="small muted">Хүсэлтэд сургалт сонгогдоогүй. Сэдвийг нь хариуцагчтай тодруулж, хариу бичнэ үү.</p>}
      </section>}

      <section className="panel">
        <h2>Харилцаа</h2>
        <RequestThread messages={messages} mySide="PROLIANCE" />
        <form key={`${r.status}-${messages.length}`} action={adminReply} className="stack">
          <input type="hidden" name="id" value={r.id} />
          <label className="fld"><span>Хариуцагчид хариу бичих</span><textarea name="body" placeholder="Ж: Хүсэлтийг хүлээн авлаа. 11-р сарын 20-нд танхимын хичээл зохион байгуулахаар төлөвлөж байна." /></label>
          <div className="acts" style={{ justifyContent: 'flex-start' }}>
            <label className="fld" style={{ width: 'auto' }}><span>Төлөв</span>
              <select name="status" defaultValue="">
                <option value="">Өөрчлөхгүй ({REQ_STATUS[r.status][0]})</option>
                {Object.entries(REQ_STATUS).filter(([k]) => k !== 'CANCELLED' && k !== r.status).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <Submit>Илгээх</Submit>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Хариуцагчид системийн мэдэгдэл болон имэйл очно.</p>
        </form>
      </section>
    </div>
  );
}
