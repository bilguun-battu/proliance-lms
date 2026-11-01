'use client';
import { useState } from 'react';

// Үндсэн сургагч багш: Сургагч / Сургалтын админ эрхтэй, эсвэл тухайн сургалтыг заах эрхтэй хүн, эсвэл гадны багш
export default function InstructorPick({ trainers, value, extName }: { trainers: { id: string; name: string }[]; value?: string | null; extName?: string | null }) {
  const [v, setV] = useState(value ?? (extName ? 'EXT' : trainers[0]?.id ?? 'EXT'));
  return (
    <>
      <label className="fld"><span>Үндсэн сургагч багш</span>
        <select name="instructor_id" value={v} onChange={e => setV(e.target.value)}>
          {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          <option value="EXT">Гадны багш (системд бүртгэлгүй)</option>
        </select>
        {!trainers.length && <span className="small muted">Сургагч багш алга. Хэрэглэгчид "Сургагч" эрх эсвэл "Сургагч багш" цэснээс тухайн сургалтын эрх олгоно.</span>}</label>
      {v === 'EXT' && <label className="fld"><span>Гадны багшийн нэр</span><input type="text" name="instructor_name" defaultValue={extName ?? ''} placeholder="Ж: Д. Болд, Sysmex-ийн инженер" /></label>}
    </>
  );
}
