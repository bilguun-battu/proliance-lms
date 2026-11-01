import { sendDueReminders, sendSessionReminders, sendComplianceReminders } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Өдөр бүр нэг удаа дуудна: curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/reminders
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Эрхгүй.', { status: 401 });
  }
  const due = await sendDueReminders();
  const sessions = await sendSessionReminders();
  const compliance = await sendComplianceReminders();
  return Response.json({ due, sessions, compliance });
}
