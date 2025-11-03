"use client";
import { useEffect, useMemo, useState } from 'react';

interface Props {
  leadId?: string | null;
  onCreated?: () => void;
}

interface User { id: string; name: string; }

export default function CreateAppointmentModal({ leadId, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0,10));
  const [slot, setSlot] = useState<string>('07:00');

  const slots = useMemo(() => {
    const arr: string[] = [];
    for (let h=7; h<=16; h++) {
      for (let m of [0,30]) {
        if (h === 16 && m === 30) continue;
        arr.push(`${String(h).padStart(2,'0')}:${m===0?'00':'30'}`);
      }
    }
    return arr;
  }, []);
  const format12h = (val: string) => {
    const [hh,mm] = val.split(':');
    let h = parseInt(hh,10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12; else if (h > 12) h -= 12;
    return `${h}:${mm} ${ampm}`;
  };

  useEffect(() => {
    if (!open) return;
    fetch('/api/users').then(r => r.json()).then(setUsers).catch(()=>{});
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const title = formData.get('title') as string;
    const userId = formData.get('userId') as string | null;
    const description = formData.get('description') as string | null;
    if (!title || !date || !slot) { setError('Title, date and time slot required'); return; }
    const startIso = new Date(`${date}T${slot}:00`).toISOString();
    const [hStr,mStr] = slot.split(':');
    const startDate = new Date(`${date}T${slot}:00`);
    const endDate = new Date(startDate.getTime() + 60*60*1000); // 1 hour block
    const endIso = endDate.toISOString();
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, start: startIso, end: endIso, userId: userId || null, description, leadId }) });
      if (!res.ok) throw new Error('Failed');
      setOpen(false);
      form.reset();
      onCreated?.();
    } catch (err: any) {
      setError(err.message || 'Error creating appointment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4">
      <button type="button" onClick={() => setOpen(true)} className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm">Create Appointment</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !loading && setOpen(false)} />
          <div className="relative bg-white rounded-md shadow-lg w-full max-w-md p-5 space-y-4">
            <div className="text-lg font-semibold">New Appointment</div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid gap-2">
                <label className="text-xs uppercase tracking-wide text-slate-500">Title</label>
                <input name="title" className="h-9 px-2 rounded border border-slate-300" placeholder="e.g. Site Visit" required />
              </div>
              <div className="grid gap-1 md:grid-cols-2 md:gap-3">
                <div className="grid gap-2">
                  <label className="text-xs uppercase tracking-wide text-slate-500">Date</label>
                  <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="h-9 px-2 rounded border border-slate-300" required />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs uppercase tracking-wide text-slate-500">Start Time (1h)</label>
                  <select value={slot} onChange={e=>setSlot(e.target.value)} className="h-9 px-2 rounded border border-slate-300" required>
                    {slots.map(s => <option key={s} value={s}>{format12h(s)}</option>)}
                  </select>
                </div>
              </div>
              <div className="text-xs text-slate-500 -mt-2">End time auto-set to 1 hour after start (latest start 16:00).</div>
              <div className="grid gap-2">
                <label className="text-xs uppercase tracking-wide text-slate-500">Assign To</label>
                <select name="userId" className="h-9 px-2 rounded border border-slate-300">
                  <option value="">(Unassigned)</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <label className="text-xs uppercase tracking-wide text-slate-500">Notes</label>
                <textarea name="description" rows={3} className="px-2 py-1 rounded border border-slate-300" placeholder="Optional notes" />
              </div>
              {error && <div className="text-sm text-red-600">{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={loading} onClick={() => setOpen(false)} className="px-3 py-2 rounded border text-sm">Cancel</button>
                <button type="submit" disabled={loading} className="px-3 py-2 rounded bg-emerald-600 text-white text-sm">{loading ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
