"use client";
import { useState } from 'react';

export default function FlagPicker({ contactId, initial }: { contactId: string; initial?: 'red'|'yellow'|'green'|null }) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState<'red'|'yellow'|'green'|null>(initial ?? null);
  const saving = false;
  async function setFlag(c: 'red'|'yellow'|'green'|null){
    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/flag`, { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ color: c }) });
      if (res.ok) {
        setColor(c);
        setOpen(false);
      }
    } catch {}
  }
  const colorClass = color ? (color==='red' ? 'text-red-400 hover:text-red-300' : color==='yellow' ? 'text-yellow-300 hover:text-yellow-200' : 'text-emerald-300 hover:text-emerald-200') : 'text-white/70 hover:text-white';
  return (
    <div className="relative">
      <button
        title={color ? `${color} flag` : 'Set flag'}
        className={`inline-flex items-center rounded-md px-1.5 py-1 text-xs focus:outline-none transition-colors ${colorClass}`}
        onClick={()=>setOpen(v=>!v)}
      >
        <svg className="h-4 w-4 drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h8l1 2h4v11h-7l-1-2H8v7H6z"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-50 rounded-md border border-slate-200 bg-white shadow-sm p-2 text-xs">
          <div className="flex items-center gap-2">
            <button className="h-6 w-6 rounded-full bg-red-500" onClick={()=>setFlag('red')} aria-label="Red flag" />
            <button className="h-6 w-6 rounded-full bg-yellow-400" onClick={()=>setFlag('yellow')} aria-label="Yellow flag" />
            <button className="h-6 w-6 rounded-full bg-emerald-500" onClick={()=>setFlag('green')} aria-label="Green flag" />
            <button className="ml-2 px-2 h-6 rounded border text-slate-600" onClick={()=>setFlag(null)}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
