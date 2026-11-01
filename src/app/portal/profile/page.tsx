import { requireUser } from '@/lib/auth';
import ProfileView from '@/components/ProfileView';

export default async function MyProfile() {
  const u = await requireUser('LEARNER', 'COORDINATOR');
  return (
    <>
      <div className="head"><div><h1>Миний профайл</h1><p className="muted">Заавал хамрагдах болон сонгон суусан сургалт, гэрчилгээ, албан тушаалын түүх</p></div></div>
      <ProfileView userId={u.id} courseHref={id => `/portal/courses/${id}`} />
    </>
  );
}
