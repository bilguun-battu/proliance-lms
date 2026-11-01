import 'server-only';
import { all, one, run } from './db';
import { logActivity } from './progress';
import { sendEmail } from './notify';
import { appUrl } from './auth';
import { complianceRows, COMPLIANT_SET } from './compliance';
import { fmtDate } from './format';

// Дотоод ажилтны албан тушаалыг жагсаалтад нэмнэ (матрицын мөр болно)
async function rememberPosition(userId: string, position: string | null, department: string | null) {
  if (!position) return;
  const internal = await one('SELECT 1 FROM users u JOIN orgs o ON o.id=u.org_id WHERE u.id=$1 AND o.is_internal', [userId]);
  if (internal) await run('INSERT INTO positions (name, department) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING', [position, department]);
}

// Шинэ хэрэглэгчийн албан тушаалын эхний бичлэг
export async function startPositionHistory(userId: string) {
  const u = await one<any>('SELECT position, department FROM users WHERE id=$1', [userId]);
  await run('INSERT INTO user_positions (user_id, position, department, started_at) VALUES ($1,$2,$3, now())', [userId, u.position, u.department]);
  await rememberPosition(userId, u.position, u.department);
}

// Албан тушаал/хэлтэс өөрчлөгдөхөд: түүхэнд хадгалж, шинэ албан тушаалын заавал хамрагдах сургалтыг мэдэгдэнэ.
// Оноолт нь албан тушаалын нэрээр тодорхойлогддог тул шинэ сургалтууд автоматаар оногдоно.
export async function setUserPosition(userId: string, position: string | null, department: string | null) {
  const u = await one<any>('SELECT name, email, position, department FROM users WHERE id=$1', [userId]);
  if (!u || ((u.position ?? null) === position && (u.department ?? null) === department)) return false;
  await run('UPDATE user_positions SET ended_at=now() WHERE user_id=$1 AND ended_at IS NULL', [userId]);
  await run('INSERT INTO user_positions (user_id, position, department, started_at) VALUES ($1,$2,$3, now())', [userId, position, department]);
  await run('UPDATE users SET position=$1, department=$2, position_since=now() WHERE id=$3', [position, department, userId]);
  await rememberPosition(userId, position, department);
  await logActivity(userId, null, null, 'POSITION', `${u.position ?? '—'} → ${position ?? '—'}`);
  const todo = (await complianceRows({ user: userId })).filter(r => !COMPLIANT_SET.includes(r.status));
  if (todo.length) {
    const lines = todo.map(r => `• ${r.course} — ${fmtDate(r.due)} хүртэл`).join('\n');
    await run(`INSERT INTO notifications (user_id,kind,title,body) VALUES ($1,'POSITION',$2,$3)`,
      [userId, `Шинэ албан тушаал: ${position ?? ''}`, `Заавал хамрагдах ${todo.length} сургалт оноогдлоо:\n${lines}`]);
    await sendEmail(u.email, 'Заавал хамрагдах сургалт оноогдлоо',
      `Сайн байна уу, ${u.name}.\n\nТаны албан тушаал "${position ?? ''}" болж өөрчлөгдсөн тул дараах сургалтад заавал хамрагдана:\n${lines}\n\n${appUrl('/portal')}`);
  }
  return true;
}

export type HistoryPeriod = { position: string | null; department: string | null; started_at: string; ended_at: string | null };
export async function positionHistory(userId: string) {
  return all<HistoryPeriod>('SELECT position, department, started_at, ended_at FROM user_positions WHERE user_id=$1 ORDER BY started_at DESC', [userId]);
}
