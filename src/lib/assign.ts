import 'server-only';
import { all } from './db';

export type Assignment = {
  id: string; course_id: string; target: 'ALL_INTERNAL' | 'DEPARTMENT' | 'POSITION' | 'ORG' | 'USER'; target_value: string | null;
  due_days: number; due_date: string | null; recurrence_months: number | null; note: string; created_at: string;
};

export const TARGET_LABEL: Record<string, string> = {
  ALL_INTERNAL: 'Proliance-ийн бүх ажилтан', DEPARTMENT: 'Хэлтэс', POSITION: 'Албан тушаал', ORG: 'Харилцагч байгууллага', USER: 'Тодорхой хүн',
};

// Хэрэглэгчид хамаарах оноолтыг нэг SQL-ээр тодорхойлно (u = users, o = orgs)
// Дотоод сургалт зөвхөн Proliance-ийн ажилтанд, харилцагчийн сургалт зөвхөн харилцагчид оноогдоно
export const APPLIES_SQL = `(
  EXISTS (SELECT 1 FROM courses ac WHERE ac.id=a.course_id AND (ac.audience='INTERNAL') = coalesce(o.is_internal,false)) AND (
  (a.target='ALL_INTERNAL' AND o.is_internal) OR
  (a.target='DEPARTMENT' AND o.is_internal AND u.department=a.target_value) OR
  (a.target='POSITION' AND u.position=a.target_value) OR
  (a.target='ORG' AND u.org_id::text=a.target_value) OR
  (a.target='USER' AND u.id::text=a.target_value)))`;

export async function userAssignments(userId: string) {
  return all<Assignment>(`
    SELECT a.* FROM assignments a JOIN users u ON u.id=$1 LEFT JOIN orgs o ON o.id=u.org_id
     WHERE u.active AND u.role <> 'ADMIN' AND ${APPLIES_SQL}`, [userId]);
}

export async function recurrenceFor(userId: string, courseId: string) {
  const r = (await userAssignments(userId)).filter(a => a.course_id === courseId && a.recurrence_months);
  return r.length ? Math.min(...r.map(a => a.recurrence_months!)) : null;
}

// Хэрэглэгч × сургалт хандах эрхийн бүх хос (тайлан, тоймд)
export const ACCESS_SQL = `
  SELECT DISTINCT u.id AS uid, c.id AS cid FROM users u LEFT JOIN orgs o ON o.id=u.org_id CROSS JOIN courses c
   WHERE u.active AND u.role <> 'ADMIN'
     AND EXISTS (SELECT 1 FROM course_versions v WHERE v.course_id=c.id AND v.status='PUBLISHED')
     AND ((c.audience='CUSTOMER' AND NOT coalesce(o.is_internal,false) AND EXISTS (SELECT 1 FROM course_products cp JOIN org_products op ON op.product_id=cp.product_id WHERE cp.course_id=c.id AND op.org_id=u.org_id))
       OR (c.audience='INTERNAL' AND o.is_internal)
       OR EXISTS (SELECT 1 FROM assignments a WHERE a.course_id=c.id AND ${APPLIES_SQL}))`;
