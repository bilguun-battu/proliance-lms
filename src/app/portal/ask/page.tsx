import { requireUser, PORTAL_ROLES } from '@/lib/auth';
import { all } from '@/lib/db';
import { learnerCourseIds } from '@/lib/progress';
import AskAssistant from '@/components/AskAssistant';

export default async function AskPage(props: { searchParams: Promise<{ course?: string }> }) {
  const sp = await props.searchParams;
  const u = await requireUser(...PORTAL_ROLES);
  const ids = await learnerCourseIds(u.id);
  const courses = await all<{ id: string; title: string }>('SELECT id, title FROM courses WHERE id = ANY($1) ORDER BY title', [ids]);
  const course = sp.course && ids.includes(sp.course) ? sp.course : '';
  const scope = course ? [course] : ids;
  // Жишээ асуулт: бэлтгэсэн асуулт-хариулт болон бусдын олон асуусан, хариулт олдсон асуултууд
  const examples = (await all<{ q: string }>(`
    (SELECT question AS q FROM kb_faq WHERE course_id = ANY($1) OR course_id IS NULL ORDER BY created_at DESC LIMIT 2)
    UNION ALL
    (SELECT min(question) AS q FROM kb_questions WHERE answered AND helpful IS NOT FALSE AND course_id = ANY($1)
      GROUP BY lower(question) ORDER BY count(*) DESC LIMIT 2)`, [scope])).map(r => r.q).filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="head"><div>
        <h1>Асуулт асуух</h1>
        <p className="muted">Сургалтын материалаас таны асуултад хамгийн тохирох хариултыг хайж олно. Хариулт бүрийн доор хаанаас авсныг харуулдаг тул гарын авлагаас нь шалгаж болно.</p>
      </div></div>
      {courses.length
        ? <AskAssistant courses={courses} initialCourse={course} examples={examples} />
        : <div className="empty">Танд нээлттэй сургалт алга байна.</div>}
    </div>
  );
}
