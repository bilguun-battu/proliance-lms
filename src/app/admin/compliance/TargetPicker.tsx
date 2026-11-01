'use client';
import { useState } from 'react';

type Opt = { id: string; name: string };

export default function TargetPicker({ aud, depts, positions, orgs, users }: { aud: 'customer' | 'internal'; depts: string[]; positions: string[]; orgs: Opt[]; users: Opt[] }) {
  const [t, setT] = useState(aud === 'internal' ? 'ALL_INTERNAL' : 'ORG');
  return (
    <>
      <label className="fld"><span>Хэнд</span>
        <select name="target" value={t} onChange={e => setT(e.target.value)}>
          {aud === 'internal' ? <>
            <option value="ALL_INTERNAL">Proliance-ийн бүх ажилтан</option>
            <option value="DEPARTMENT">Хэлтэс</option>
          </> : <option value="ORG">Харилцагч байгууллага</option>}
          <option value="POSITION">Албан тушаал</option>
          <option value="USER">Тодорхой хүн</option>
        </select></label>
      {t === 'DEPARTMENT' && <label className="fld"><span>Хэлтэс</span><select name="department">{depts.map(d => <option key={d}>{d}</option>)}</select></label>}
      {t === 'POSITION' && <label className="fld"><span>Албан тушаал</span><select name="position">{positions.map(d => <option key={d}>{d}</option>)}</select></label>}
      {t === 'ORG' && <label className="fld"><span>Байгууллага</span><select name="org_id">{orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
      {t === 'USER' && <label className="fld"><span>Хүн</span><select name="user_id">{users.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
    </>
  );
}
