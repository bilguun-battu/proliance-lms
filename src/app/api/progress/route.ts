import { getSession } from '@/lib/auth';
import { one, run } from '@/lib/db';
import { canAccessCourse, publishedVersion, versionModules, tryComplete, requirementStatus, hasVideo } from '@/lib/progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Видео тоглуулагч 10 секунд тутам дуудна. delta = сүүлийн дуудлагаас хойш бодитоор тоглуулсан секунд.
// "Хаана хүртэл үзсэн" (max_s) нь зөвхөн бодитоор тоглуулсан хугацаагаар урагшилна: гүйлгэж алгасвал тооцогдохгүй.
export async function POST(req: Request) {
  const u = await getSession();
  if (!u) return new Response('Нэвтэрнэ үү.', { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.courseId || !b?.key) return new Response('Буруу хүсэлт.', { status: 400 });
  if (!(await canAccessCourse(u.id, b.courseId))) return new Response('Эрхгүй.', { status: 403 });
  const v = await publishedVersion(b.courseId);
  const m = v && (await versionModules(v.id)).find(x => x.module_key === b.key);
  if (!m || !hasVideo(m)) return new Response('Модуль олдсонгүй.', { status: 404 });

  const delta = Math.max(0, Math.min(Number(b.delta) || 0, 25));
  const duration = Math.max(0, Number(b.duration) || 0);
  const position = Math.max(0, Number(b.position) || 0);
  const prev = await one('SELECT 1 FROM video_progress WHERE user_id=$1 AND course_id=$2 AND module_key=$3 AND mver=$4', [u.id, b.courseId, m.module_key, m.mver]);
  // Тоглуулсан хугацаа нь өнгөрсөн бодит хугацааны 2 дахин (2x хурд) + 3 секундээс хэтрэхгүй
  await run(`
    INSERT INTO video_progress (user_id,course_id,module_key,mver,position_s,watched_s,duration_s,max_s)
      VALUES ($1,$2,$3,$4,$5,$6,$7, LEAST($5::real, $6::real + 3))
    ON CONFLICT (user_id,course_id,module_key,mver) DO UPDATE SET
      position_s=EXCLUDED.position_s,
      watched_s=LEAST(GREATEST(EXCLUDED.duration_s, video_progress.duration_s),
                      video_progress.watched_s + LEAST($6::real, extract(epoch FROM now() - video_progress.updated_at)::real * 2 + 3)),
      max_s=GREATEST(video_progress.max_s, LEAST($5::real,
                      video_progress.max_s + LEAST($6::real, extract(epoch FROM now() - video_progress.updated_at)::real * 2 + 3) + 3)),
      duration_s=GREATEST(EXCLUDED.duration_s, video_progress.duration_s), updated_at=now()`,
    [u.id, b.courseId, m.module_key, m.mver, position, delta, duration]);
  if (!prev) await run('INSERT INTO activity_log (user_id,course_id,module_key,action,detail) VALUES ($1,$2,$3,$4,$5)', [u.id, b.courseId, m.module_key, 'WATCH', m.title]);
  const completed = await tryComplete(u.id, b.courseId, m);
  const r = await requirementStatus(u.id, b.courseId, m);
  return Response.json({ pct: r.videoPct, videoOk: r.videoOk, maxS: r.maxS, completed });
}
