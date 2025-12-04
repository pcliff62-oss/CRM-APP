'use client'
import React, { useEffect, useState } from 'react'

type Task = { id: string; title: string; dueDate?: string; status?: string };

export default function TasksClient({ tasks }: { tasks: Task[] }){
  const [ephemeral, setEphemeral] = useState<string | null>(null);

  useEffect(() => {
    try {
      const last = localStorage.getItem('weatherShiftLastMsg');
      if (last) setEphemeral(last);
    } catch {}
    const onUpdate = () => {
      try {
        const msg = localStorage.getItem('weatherShiftLastMsg');
        setEphemeral(msg);
      } catch {}
    };
    window.addEventListener('weatherShiftUpdated', onUpdate);
    return () => window.removeEventListener('weatherShiftUpdated', onUpdate);
  }, []);

  const items: Task[] = [
    ...(ephemeral ? [{ id: 'sys-weather', title: ephemeral }] : []),
    ...tasks,
  ];

  if (items.length === 0) return <div className="text-slate-500 text-sm">No tasks yet.</div>;

  return (
    <ul className="divide-y">
      {items.slice(0,6).map(t => (
        <li key={t.id} className="py-2 flex items-start gap-3">
          <div className="mt-1 h-2 w-2 rounded-full bg-amber-500" />
          <div className="min-w-0">
            <div className="text-sm text-slate-800 truncate">{t.title || 'Untitled task'}</div>
            {t.dueDate ? <div className="text-xs text-slate-500">Due {new Date(t.dueDate).toLocaleDateString()}</div> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
