import 'server-only';
import { one } from './db';

// Багшид оноогдсон хуваарийн нөхцөл (үндсэн багш эсвэл аль нэг хичээлийн багш)
export const TEACH_WHERE = (p: number) => `(x.instructor_id=$${p} OR EXISTS (SELECT 1 FROM sessions s WHERE s.offering_id=x.id AND s.instructor_id=$${p}))`;

// Ирц бүртгээгүй өнгөрсөн хичээлийн тоо (самбарын тэмдэглэгээнд)
export async function pendingAttendance(userId: string) {
  return (await one<{ n: number }>(`
    SELECT count(DISTINCT s.id)::int AS n FROM sessions s JOIN offerings o ON o.id=s.offering_id
     WHERE s.status='SCHEDULED' AND o.status='SCHEDULED' AND s.starts_at < now() AND s.starts_at > now() - interval '60 days'
       AND coalesce(s.instructor_id, o.instructor_id)=$1
       AND EXISTS (SELECT 1 FROM session_attendees a WHERE a.session_id=s.id AND a.status='REGISTERED')`, [userId]))!.n;
}
export async function isInstructor(userId: string) {
  return !!(await one(`SELECT 1 FROM offerings o WHERE o.instructor_id=$1 UNION SELECT 1 FROM sessions s WHERE s.instructor_id=$1 UNION SELECT 1 FROM trainer_quals q WHERE q.user_id=$1 LIMIT 1`, [userId]));
}
