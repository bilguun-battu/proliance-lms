'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { all, run } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { reindexCourse, saveFaq } from '@/lib/kb';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const back = (msg: string, err = false, anchor = ''): never => {
  revalidatePath('/admin/kb');
  redirect(`/admin/kb?${err ? 'err' : 'ok'}=${encodeURIComponent(msg)}${anchor}`);
};

// Нийтлэгдсэн бүх сургалтын материалыг дахин задалж индекслэнэ
export async function reindexAll() {
  await requireUser('ADMIN', 'TRAINING_ADMIN');
  const cs = await all<{ id: string; title: string }>(`SELECT DISTINCT c.id, c.title FROM courses c JOIN course_versions v ON v.course_id=c.id AND v.status='PUBLISHED'`);
  let n = 0; const failed: string[] = [];
  for (const c of cs) { const r = await reindexCourse(c.id); n += r.chunks; failed.push(...r.failed); }
  back(`${cs.length} сургалтын материалаас ${n} хэсэг индекслэгдлээ.${failed.length ? ` Уншиж чадаагүй PDF: ${failed.join(', ')}` : ''}`, failed.length > 0);
}

export async function reindexOne(fd: FormData) {
  await requireUser('ADMIN', 'TRAINING_ADMIN');
  const r = await reindexCourse(s(fd, 'course_id'));
  back(`${r.chunks} хэсэг индекслэгдлээ.${r.failed.length ? ` Уншиж чадаагүй PDF: ${r.failed.join(', ')}. Зураг хэлбэрээр скан хийсэн PDF-ээс текст гарахгүй.` : ''}`, r.failed.length > 0);
}

// Асуулт-хариулт нэмэх. Хариулт олдоогүй асуултаас нэмбэл тэр асуултыг шийдвэрлэсэнд тооцно.
export async function addFaq(fd: FormData) {
  const me = await requireUser('ADMIN', 'TRAINING_ADMIN');
  const q = s(fd, 'question'), a = s(fd, 'answer');
  if (q.length < 3 || a.length < 3) back('Асуулт, хариултаа бичнэ үү.', true);
  const f = await saveFaq(s(fd, 'course_id') || null, q, a, me.id);
  if (s(fd, 'from')) await run('UPDATE kb_questions SET resolved=true, faq_id=$1 WHERE id=$2', [f!.id, s(fd, 'from')]);
  back('Асуулт-хариулт нэмэгдлээ. Ижил төстэй асуултад туслах үүнийг эхэлж санал болгоно.', false, '#faq');
}

export async function deleteFaq(fd: FormData) {
  await requireUser('ADMIN', 'TRAINING_ADMIN');
  await run('DELETE FROM kb_faq WHERE id=$1', [s(fd, 'id')]);
  back('Асуулт-хариулт устгагдлаа.', false, '#faq');
}

export async function resolveQuestion(fd: FormData) {
  await requireUser('ADMIN', 'TRAINING_ADMIN');
  await run('UPDATE kb_questions SET resolved=true WHERE id=$1', [s(fd, 'id')]);
  back('Асуултыг хянасанд тооцлоо.');
}
