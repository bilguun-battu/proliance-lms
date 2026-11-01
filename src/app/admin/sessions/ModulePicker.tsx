'use client';
import { useState } from 'react';

type Mod = { course_id: string; course: string; key: string; title: string; format: string; label: string };

export default function ModulePicker({ mods }: { mods: Mod[] }) {
  const courses = Array.from(new Map(mods.map(m => [m.course_id, m.course])).entries());
  const [course, setCourse] = useState(courses[0]?.[0] ?? '');
  const list = mods.filter(m => m.course_id === course);
  return (
    <>
      <label className="fld"><span>Сургалт</span>
        <select name="course_id" value={course} onChange={e => setCourse(e.target.value)}>{courses.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select></label>
      <label className="fld"><span>Модуль</span>
        <select name="module_key" key={course}>{list.map(m => <option key={m.key} value={m.key}>{m.title} · {m.label}</option>)}</select></label>
    </>
  );
}
