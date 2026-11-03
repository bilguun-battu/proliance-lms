import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { Flash } from '@/components/ui';
import { orgCourses } from '@/lib/requests';
import { complianceRows, COMP_LABEL } from '@/lib/compliance';
import { createRequest } from '@/app/actions/requests';
import RequestForm from '@/components/RequestForm';

export default async function NewRequest(props: { searchParams: Promise<{ ok?: string; err?: string; kind?: string; course?: string; user?: string }> }) {
  const sp = await props.searchParams;
  const u = await requireUser('COORDINATOR');
  const courses = await orgCourses(u.orgId!);
  const staff = await all<any>(`SELECT id, name, position FROM users WHERE org_id=$1 AND active ORDER BY name`, [u.orgId]);
  // Давтан сургалт сонгоход ажилтан бүрийн заавал сургалтын төлөвийг харуулна
  const status: Record<string, string> = {};
  for (const r of await complianceRows({ org: u.orgId! })) status[`${r.user_id}|${r.course_id}`] = COMP_LABEL[r.status][0];
  return (
    <div className="stack" style={{ maxWidth: 960 }}>
      <Link className="link small" href="/org/requests">← Сургалтын хүсэлт</Link>
      <div className="head"><div><h1>Шинэ хүсэлт</h1><p className="muted">Proliance-д сургалтын хүсэлт илгээнэ. Хүсэлт бүр дээр Proliance-тай мессежээр харилцаж, шийдвэрлэсэн эсэхийг хянана.</p></div></div>
      <Flash sp={sp} />
      <RequestForm action={createRequest} courses={courses} staff={staff} status={status}
        init={{ kind: sp.kind, course: sp.course, users: sp.user ? sp.user.split(',') : [] }} />
    </div>
  );
}
