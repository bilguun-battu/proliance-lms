import { getSession } from '@/lib/auth';
import { run } from '@/lib/db';
import { canAccessCourse, publishedVersion, versionModules, tryComplete, requirementStatus } from '@/lib/progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PDF үзүүлэгч дэлгэцэнд гарсан хуудсуудыг илгээнэ. Бүх хуудсыг үзэхэд материал дууссанд тооцогдоно.
export async function POST(req: Request) {
  const u = await getSession();
  if (!u) return new Response('Нэвтэрнэ үү.', { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.courseId || !b?.key) return new Response('Буруу хүсэлт.', { status: 400 });
  if (!(await canAccessCourse(u.id, b.courseId))) return new Response('Эрхгүй.', { status: 403 });
  const v = await publishedVersion(b.courseId);
  const m = v && (await versionModules(v.id)).find(x => x.module_key === b.key);
  if (!m || !m.pdf_file) return new Response('Модуль олдсонгүй.', { status: 404 });
  const total = Math.max(1, Math.min(5000, Math.floor(Number(b.total) || 0)));
  const pages = (Array.isArray(b.pages) ? b.pages : []).map(Number).filter((n: number) => Number.isInteger(n) && n >= 1 && n <= total).slice(0, 5000);
  await run(`
    INSERT INTO pdf_progress (user_id,course_id,module_key,mver,pages,total) VALUES ($1,$2,$3,$4,
      ARRAY(SELECT DISTINCT x FROM unnest($5::int[]) x ORDER BY x), $6)
    ON CONFLICT (user_id,course_id,module_key,mver) DO UPDATE SET
      pages=ARRAY(SELECT DISTINCT x FROM unnest(pdf_progress.pages || $5::int[]) x WHERE x <= GREATEST(pdf_progress.total, $6) ORDER BY x),
      total=GREATEST(pdf_progress.total, $6), updated_at=now()`,
    [u.id, b.courseId, m.module_key, m.mver, pages, total]);
  const completed = await tryComplete(u.id, b.courseId, m);
  const r = await requirementStatus(u.id, b.courseId, m);
  return Response.json({ seen: r.pdfSeen, total: r.pdfTotal, pdfOk: r.pdfOk, completed });
}
