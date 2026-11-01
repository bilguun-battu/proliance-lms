'use server';
import { redirect } from 'next/navigation';
import { all, run, tx } from '@/lib/db';
import { requireUser } from '@/lib/auth';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const go = (msg: string, err = false): never => redirect(`/admin/matrix?${err ? 'err' : 'ok'}=${encodeURIComponent(msg)}`);

export async function addPosition(fd: FormData) {
  await requireUser('ADMIN');
  const name = s(fd, 'name');
  if (!name) go('Албан тушаалын нэрийг оруулна уу.', true);
  await run('INSERT INTO positions (name, department) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET department=EXCLUDED.department', [name, s(fd, 'department') || null]);
  go(`"${name}" албан тушаал нэмэгдлээ.`);
}

export async function deletePosition(fd: FormData) {
  await requireUser('ADMIN');
  const p = (await all<{ name: string; n: number }>(`SELECT p.name, (SELECT count(*)::int FROM users u WHERE u.position=p.name AND u.active) AS n FROM positions p WHERE p.id=$1`, [s(fd, 'id')]))[0];
  if (!p) go('Албан тушаал олдсонгүй.', true);
  if (p.n > 0) go(`"${p.name}" албан тушаалд ${p.n} ажилтан байгаа тул устгах боломжгүй.`, true);
  await tx(async c => {
    await run(`DELETE FROM assignments WHERE source='MATRIX' AND target='POSITION' AND target_value=$1`, [p.name], c);
    await run('DELETE FROM positions WHERE id=$1', [s(fd, 'id')], c);
  });
  go(`"${p.name}" устгагдлаа.`);
}

// Матрицын нүд бүр: хоосон = шаардлагагүй, 0 = нэг удаа, N = N сар тутам давтан
export async function saveMatrix(fd: FormData) {
  await requireUser('ADMIN');
  const due = Math.max(1, Number(s(fd, 'due_days')) || 30);
  const positions = await all<{ id: string; name: string }>('SELECT id, name FROM positions');
  const courses = await all<{ id: string }>(`SELECT id FROM courses WHERE audience='INTERNAL'`);
  const byId = new Map(positions.map(p => [p.id, p.name]));
  let n = 0;
  await tx(async c => {
    for (const p of positions) for (const co of courses) {
      const key = `m|${p.id}|${co.id}`;
      if (!fd.has(key)) continue;
      const v = s(fd, key);
      await run(`DELETE FROM assignments WHERE source='MATRIX' AND target='POSITION' AND target_value=$1 AND course_id=$2`, [byId.get(p.id), co.id], c);
      if (v === '') continue;
      await run(`INSERT INTO assignments (course_id,target,target_value,due_days,recurrence_months,note,source) VALUES ($1,'POSITION',$2,$3,$4,'Сургалтын матриц','MATRIX')`,
        [co.id, byId.get(p.id), due, Number(v) > 0 ? Number(v) : null], c);
      n++;
    }
  });
  redirect(`/admin/matrix?view=grid&ok=${encodeURIComponent(`Матриц хадгалагдлаа: ${n} заавал хамрагдах сургалт. Тухайн албан тушаалын ажилтнуудад автоматаар оноогдоно.`)}`);
}

// Жагсаалтаар нэмэх: сонгосон албан тушаал бүрт сонгосон сургалт бүрийг оноох
export async function addMatrixEntries(fd: FormData) {
  await requireUser('ADMIN');
  const posIds = fd.getAll('positions').map(String), courseIds = fd.getAll('courses').map(String);
  if (!posIds.length || !courseIds.length) redirect(`/admin/matrix?view=list&err=${encodeURIComponent('Албан тушаал болон сургалтаа сонгоно уу.')}`);
  const due = Math.max(1, Number(s(fd, 'due_days')) || 30);
  const rec = Number(s(fd, 'recurrence')) > 0 ? Number(s(fd, 'recurrence')) : null;
  const positions = await all<{ name: string }>('SELECT name FROM positions WHERE id = ANY($1)', [posIds]);
  const courses = await all<{ id: string }>(`SELECT id FROM courses WHERE id = ANY($1) AND audience='INTERNAL'`, [courseIds]);
  let n = 0;
  await tx(async c => {
    for (const p of positions) for (const co of courses) {
      await run(`DELETE FROM assignments WHERE source='MATRIX' AND target='POSITION' AND target_value=$1 AND course_id=$2`, [p.name, co.id], c);
      await run(`INSERT INTO assignments (course_id,target,target_value,due_days,recurrence_months,note,source) VALUES ($1,'POSITION',$2,$3,$4,'Сургалтын матриц','MATRIX')`, [co.id, p.name, due, rec], c);
      n++;
    }
  });
  redirect(`/admin/matrix?view=list&ok=${encodeURIComponent(`${n} мөр матрицад нэмэгдлээ. Тухайн албан тушаалын ажилтнуудад автоматаар оноогдоно.`)}`);
}

export async function deleteMatrixEntry(fd: FormData) {
  await requireUser('ADMIN');
  await run(`DELETE FROM assignments WHERE id=$1 AND source='MATRIX'`, [s(fd, 'id')]);
  redirect(`/admin/matrix?view=list&ok=${encodeURIComponent('Матрицаас хасагдлаа.')}`);
}
