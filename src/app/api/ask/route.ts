import { getSession } from '@/lib/auth';
import { one, run } from '@/lib/db';
import { search, ensureIndexed, askScope, answerable } from '@/lib/kb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Сургалтын туслах: асуултад материалаас хамгийн тохирох хэсгийг олно
export async function POST(req: Request) {
  const u = await getSession();
  if (!u) return new Response('Нэвтэрнэ үү.', { status: 401 });
  const b = await req.json().catch(() => null);
  const q = String(b?.q ?? '').trim().slice(0, 500);
  if (q.length < 3) return new Response('Асуултаа бичнэ үү.', { status: 400 });
  let scope = await askScope(u);
  const course = b?.course ? String(b.course) : null;
  if (course) {
    if (!scope.includes(course)) return new Response('Эрхгүй.', { status: 403 });
    scope = [course];
  }
  await ensureIndexed(scope);
  const { hits } = await search(q, scope, 4);
  const top = hits[0];
  const answered = !!top && answerable(top);
  const log = await one<{ id: string }>(`INSERT INTO kb_questions (user_id,course_id,question,answered,confidence,top_source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [u.id, course, q, answered, top?.confidence ?? 0, answered ? `${top.docTitle}${top.page ? ` · ${top.page}-р хуудас` : ''}` : null]);
  return Response.json({ id: log!.id, answered, hits: answered ? [top, ...hits.slice(1).filter(answerable)].slice(0, 3) : [] });
}

// Хариулт тус болсон эсэх
export async function PATCH(req: Request) {
  const u = await getSession();
  if (!u) return new Response('Нэвтэрнэ үү.', { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.id || typeof b.helpful !== 'boolean') return new Response('Буруу хүсэлт.', { status: 400 });
  await run('UPDATE kb_questions SET helpful=$1 WHERE id=$2 AND user_id=$3', [b.helpful, b.id, u.id]);
  return Response.json({ ok: true });
}
