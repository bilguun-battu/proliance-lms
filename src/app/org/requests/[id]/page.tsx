import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { Flash } from '@/components/ui';
import Submit from '@/components/Submit';
import { getRequest, requestPeople, requestMessages, markSeen } from '@/lib/requests';
import { getOffering } from '@/lib/offerings';
import { orgMessage, cancelRequest } from '@/app/actions/requests';
import { RequestFacts, RequestPeople, RequestThread } from '@/components/RequestView';

export default async function OrgRequest(props: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const u = await requireUser('COORDINATOR');
  const r = await getRequest(id);
  if (!r || r.org_id !== u.orgId) notFound();
  await markSeen(r.id, 'ORG');
  const [people, messages] = await Promise.all([requestPeople(r.id), requestMessages(r.id)]);
  const offering = r.offering_id ? await getOffering(r.offering_id) : null;
  const closed = ['DONE', 'REJECTED', 'CANCELLED'].includes(r.status);
  return (
    <div className="stack" style={{ maxWidth: 960 }}>
      <Link className="link small" href="/org/requests">← Сургалтын хүсэлт</Link>
      <Flash sp={sp} />
      <RequestFacts r={r} offering={offering} />
      <RequestPeople people={people} />
      <section className="panel">
        <h2>Харилцаа</h2>
        <RequestThread messages={messages} mySide="ORG" />
        {!closed && <form key={messages.length} action={orgMessage} className="stack">
          <input type="hidden" name="id" value={r.id} />
          <label className="fld"><span>Proliance-д мессеж бичих</span><textarea name="body" required placeholder="Ж: Нэг ажилтан нэмэгдлээ, нэрийг нь доор бичлээ." /></label>
          <div className="acts" style={{ justifyContent: 'space-between' }}><Submit>Илгээх</Submit></div>
        </form>}
        {['NEW', 'IN_REVIEW'].includes(r.status) && <form action={cancelRequest}><input type="hidden" name="id" value={r.id} />
          <Submit className="btn sm danger" confirmText="Хүсэлтийг цуцлах уу?">Хүсэлтийг цуцлах</Submit></form>}
        {closed && <p className="small muted">Энэ хүсэлт хаагдсан. Шинэ асуудал гарвал <Link className="link" href="/org/requests/new">шинэ хүсэлт</Link> илгээнэ үү.</p>}
      </section>
    </div>
  );
}
