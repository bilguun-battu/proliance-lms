import 'server-only';
import nodemailer from 'nodemailer';
import { all, run } from './db';
import { appUrl } from './auth';
import { courseProgress, REQUIRED } from './progress';
import { fmtDate, fmtSession } from './format';
import { ACCESS_SQL } from './assign';

let transport: nodemailer.Transporter | null = null;
function mailer() {
  if (!process.env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

export async function sendEmail(to: string, subject: string, text: string): Promise<string> {
  const t = mailer();
  if (!t) {
    console.log(`[ИМЭЙЛ] ${to} | ${subject}\n${text}\n`);
    return 'logged';
  }
  try {
    await t.sendMail({ from: process.env.MAIL_FROM || 'surgalt@proliance.mn', to, subject, text });
    return 'sent';
  } catch (e) {
    console.error('Имэйл илгээж чадсангүй', e);
    return 'failed';
  }
}

export async function sendSms(to: string | null, text: string): Promise<string | null> {
  if (!to) return null;
  if (!process.env.SMS_API_URL) {
    console.log(`[SMS] ${to}: ${text}`);
    return 'logged';
  }
  try {
    const r = await fetch(process.env.SMS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS_API_KEY ?? ''}` },
      body: JSON.stringify({ to, text }),
    });
    return r.ok ? 'sent' : `failed:${r.status}`;
  } catch (e) {
    console.error('SMS илгээж чадсангүй', e);
    return 'failed';
  }
}


// Шинэ хувилбар нийтлэгдэхэд өмнө нь суусан суралцагчдад мэдэгдэх
export async function notifyNewVersion(courseId: string, versionNumber: number) {
  const course = (await all<{ title: string; due_days: number }>('SELECT title, due_days FROM courses WHERE id=$1', [courseId]))[0];
  const learners = await all<{ id: string; email: string; phone: string | null; name: string }>(
    `SELECT DISTINCT u.id, u.email, u.phone, u.name, u.org_id FROM users u
       JOIN completions c ON c.user_id=u.id AND c.course_id=$1
       JOIN (${ACCESS_SQL}) acc ON acc.uid=u.id AND acc.cid=$1
      WHERE u.active`, [courseId]) as { id: string; email: string; phone: string | null; name: string; org_id?: string }[];
  const notes = (await all<{ notes: string }>('SELECT notes FROM course_versions WHERE course_id=$1 AND number=$2', [courseId, versionNumber]))[0]?.notes ?? '';
  const due = new Date(Date.now() + course.due_days * 864e5);
  let count = 0;
  const perOrg = new Map<string, string[]>();
  for (const u of learners) {
    const p = await courseProgress(u.id, courseId);
    if (!p) continue;
    const need = p.modules.filter(m => REQUIRED.includes(m.state)).map(m => m.title);
    const title = `${course.title}: ${versionNumber}-р хувилбар гарлаа`;
    const body = `${notes}\n\n` + (need.length
      ? `Таны үзэх шаардлагатай хэсэг: ${need.join(', ')}. ${fmtDate(due)}-ны дотор үзнэ үү.`
      : 'Таны хувьд заавал үзэх шаардлагатай өөрчлөлт алга. Шинэчлэгдсэн хэсгийг сонголтоор үзэж болно.');
    const email = await sendEmail(u.email, title, `Сайн байна уу, ${u.name}.\n\n${body}\n\nСургалт руу орох: ${appUrl(`/portal/courses/${courseId}`)}`);
    const sms = need.length ? await sendSms(u.phone, `Proliance: "${course.title}" сургалт шинэчлэгдлээ. ${need.length} хэсгийг ${fmtDate(due)}-ны дотор үзнэ үү.`) : null;
    await run(
      `INSERT INTO notifications (user_id,course_id,version_number,kind,title,body,due_at,email_status,sms_status)
       VALUES ($1,$2,$3,'VERSION',$4,$5,$6,$7,$8)`,
      [u.id, courseId, versionNumber, title, body, need.length ? due : null, email, sms]);
    if (need.length && u.org_id) perOrg.set(u.org_id, [...(perOrg.get(u.org_id) ?? []), u.name]);
    count++;
  }
  // Байгууллагын хариуцагчид хураангуй
  for (const [orgId, names] of perOrg) {
    const coords = await all<{ email: string; name: string }>(`SELECT email, name FROM users WHERE org_id=$1 AND role='COORDINATOR' AND active`, [orgId]);
    for (const c of coords) {
      await sendEmail(c.email, `Хураангуй: ${course.title} шинэчлэгдлээ`,
        `Сайн байна уу, ${c.name}.\n\n"${course.title}" сургалтын ${versionNumber}-р хувилбар гарлаа. Танай байгууллагын ${names.length} ажилтан шинэчлэгдсэн хэсгийг ${fmtDate(due)}-ны дотор үзэх шаардлагатай:\n${names.map(n => '- ' + n).join('\n')}\n\nЯвцыг харах: ${appUrl('/org')}`);
    }
  }
  return count;
}

// Хугацаа 3 хоногийн дотор дуусах, үзэх шаардлагатай хэсэгтэй суралцагчдад сануулга
export async function sendDueReminders() {
  const rows = await all<{ id: string; user_id: string; course_id: string; due_at: string; email: string; phone: string | null; name: string; ctitle: string }>(
    `SELECT n.id, n.user_id, n.course_id, n.due_at, u.email, u.phone, u.name, c.title AS ctitle
       FROM notifications n JOIN users u ON u.id=n.user_id JOIN courses c ON c.id=n.course_id
      WHERE n.kind='VERSION' AND n.due_at BETWEEN now() AND now() + interval '3 days'
        AND NOT EXISTS (SELECT 1 FROM notifications r WHERE r.kind='REMINDER' AND r.user_id=n.user_id AND r.course_id=n.course_id AND r.version_number=n.version_number)`);
  let sent = 0;
  for (const r of rows) {
    const p = await courseProgress(r.user_id, r.course_id);
    if (!p || p.left === 0) continue;
    const title = `Сануулга: ${r.ctitle}`;
    const body = `${p.left} хэсгийг ${fmtDate(new Date(r.due_at))}-ны дотор үзэх шаардлагатай.`;
    const email = await sendEmail(r.email, title, `Сайн байна уу, ${r.name}.\n\n${body}\n\n${appUrl(`/portal/courses/${r.course_id}`)}`);
    const sms = await sendSms(r.phone, `Proliance: ${body}`);
    await run(
      `INSERT INTO notifications (user_id,course_id,version_number,kind,title,body,due_at,email_status,sms_status)
       SELECT $1,$2,version_number,'REMINDER',$3,$4,due_at,$5,$6 FROM notifications WHERE id=$7`,
      [r.user_id, r.course_id, title, body, email, sms, r.id]);
    sent++;
  }
  return sent;
}

// Маргааш болох хичээлд бүртгүүлсэн хүмүүст сануулга (өдөрт нэг удаа cron-оор)
export async function sendSessionReminders() {
  const rows = await all<any>(`
    SELECT a.session_id, a.user_id, u.email, u.phone, u.name, s.starts_at, s.location, s.link, s.course_id, c.title
      FROM session_attendees a JOIN sessions s ON s.id=a.session_id JOIN users u ON u.id=a.user_id JOIN courses c ON c.id=s.course_id
     WHERE a.status='REGISTERED' AND a.reminded_at IS NULL AND s.status='SCHEDULED'
       AND s.starts_at > now() AND s.starts_at < now() + interval '36 hours'`);
  for (const r of rows) {
    const when = fmtSession(r.starts_at);
    const title = `Сануулга: ${r.title}`;
    const body = `${when}-д хичээл болно. Байршил: ${r.location}${r.link ? `. Холбоос: ${r.link}` : ''}`;
    const email = await sendEmail(r.email, title, `Сайн байна уу, ${r.name}.\n\n${body}\n\n${appUrl(`/portal/courses/${r.course_id}`)}`);
    const sms = await sendSms(r.phone, `Proliance: ${when}-д "${r.title}" хичээл болно. ${r.location}`);
    await run(`INSERT INTO notifications (user_id,course_id,kind,title,body,email_status,sms_status) VALUES ($1,$2,'SESSION',$3,$4,$5,$6)`, [r.user_id, r.course_id, title, body, email, sms]);
    await run('UPDATE session_attendees SET reminded_at=now() WHERE session_id=$1 AND user_id=$2', [r.session_id, r.user_id]);
  }
  return rows.length;
}

// Заавал хамрагдах сургалтын хугацаа дөхсөн (7 хоног) эсвэл хэтэрсэн хүмүүст долоо хоногт нэг удаа сануулна
export async function sendComplianceReminders() {
  const { complianceRows } = await import('./compliance');
  const rows = (await complianceRows()).filter(r => ['OVERDUE', 'EXPIRED', 'DUE_SOON', 'EXPIRING'].includes(r.status)
    && (r.status !== 'DUE_SOON' || (r.due && r.due.getTime() - Date.now() < 7 * 864e5)));
  let sent = 0;
  for (const r of rows) {
    const recent = await all(`SELECT 1 FROM notifications WHERE user_id=$1 AND course_id=$2 AND kind='COMPLIANCE' AND created_at > now() - interval '7 days'`, [r.user_id, r.course_id]);
    if (recent.length) continue;
    const late = r.status === 'OVERDUE' || r.status === 'EXPIRED';
    const title = late ? `Заавал хамрагдах сургалтын хугацаа хэтэрсэн: ${r.course}` : `Заавал хамрагдах сургалтын хугацаа дөхлөө: ${r.course}`;
    const when = fmtDate(r.status === 'EXPIRING' || r.status === 'EXPIRED' ? r.validUntil : r.due);
    const body = r.status === 'EXPIRING' ? `Таны сургалт ${when}-нд хүчингүй болно. Дахин сууна уу.`
      : r.status === 'EXPIRED' ? `Таны сургалт ${when}-нд хүчингүй болсон. Яаралтай дахин сууна уу.`
      : late ? `Эцсийн хугацаа ${when} байсан. Яаралтай дуусгана уу.` : `${when}-ны дотор дуусгана уу.`;
    const u = (await all<{ phone: string | null }>('SELECT phone FROM users WHERE id=$1', [r.user_id]))[0];
    const email = await sendEmail(r.email, title, `Сайн байна уу, ${r.name}.\n\n${body}\n\n${appUrl(`/portal/courses/${r.course_id}`)}`);
    const sms = await sendSms(u?.phone ?? null, `Proliance: "${r.course}" заавал хамрагдах сургалт. ${body}`);
    await run(`INSERT INTO notifications (user_id,course_id,kind,title,body,due_at,email_status,sms_status) VALUES ($1,$2,'COMPLIANCE',$3,$4,$5,$6,$7)`,
      [r.user_id, r.course_id, title, body, r.due, email, sms]);
    sent++;
  }
  return sent;
}
