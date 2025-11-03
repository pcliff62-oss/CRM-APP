"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatTime12h, formatPhone } from "@/components/utils";
import dynamic from 'next/dynamic';

const PropertyMap = dynamic(() => import("@/components/PropertyMapGoogle"), { ssr: false });

type Appt = {
  id?: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description?: string | null;
  leadId?: string | null;
  userId?: string | null;
  lead?: { id: string; title: string; stage: string; category?: string | null; contractPrice?: number | null; property?: { id: string; address1: string; city: string; state: string; postal: string; lat?: number | null; lng?: number | null; }; contact?: { id: string; name: string; email?: string | null; phone?: string | null; }; assignee?: { id: string; name: string | null; email: string; }; } | null;
};

export default function CalendarEditor({ selected, onClose, onSaved }: { selected: Partial<Appt> | null; onClose: () => void; onSaved: () => void; }) {
  const [form, setForm] = useState<Partial<Appt>>({});
  useEffect(() => { setForm(selected ?? {}); }, [selected]);

  async function save() {
    if (!form.title || !form.start || !form.end) return;
    const method = form.id ? "PUT" : "POST";
    // Only send editable fields now (title, start, end, allDay, description)
    const payload: any = {
      id: form.id,
      title: form.title,
      start: form.start,
      end: form.end,
      allDay: form.allDay,
      description: form.description,
    };
    const res = await fetch("/api/appointments", { method, body: JSON.stringify(payload) });
    if (res.ok) onSaved();
  }

  async function del() {
    if (!form.id) return;
    const res = await fetch(`/api/appointments?id=${form.id}`, { method: "DELETE" });
    if (res.ok) onSaved();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 p-4 border rounded-md">
        {selected?.lead && selected.lead.contact ? (
          <div className="space-y-2 text-sm">
            <div className="font-semibold">{selected.lead.contact.name}</div>
            <div>Email: {selected.lead.contact.email ? (
              <a href={`mailto:${selected.lead.contact.email}`} className="text-blue-600 hover:underline">{selected.lead.contact.email}</a>
            ) : '—'}</div>
            <div>Phone: {selected.lead.contact.phone ? (
              <a href={`tel:${normalizeTel(selected.lead.contact.phone)}`} className="text-blue-600 hover:underline">{formatPhone(selected.lead.contact.phone)}</a>
            ) : '—'}</div>
            {typeof selected.lead.contractPrice === 'number' && (
              <div>Contract: ${selected.lead.contractPrice.toLocaleString()}</div>
            )}
            {selected.lead.property && (
              <>
                <div className="text-xs text-slate-600 pt-1">
                  {selected.lead.property.address1}, {selected.lead.property.city}, {selected.lead.property.state} {selected.lead.property.postal}
                </div>
                <div className="pt-2">
                  <PropertyMap
                    key={`${selected.lead.property.id}-${selected.lead.property.address1}-${selected.lead.property.city}`}
                    address={`${selected.lead.property.address1}, ${selected.lead.property.city}, ${selected.lead.property.state} ${selected.lead.property.postal}, USA`}
                    lat={(selected.lead.property as any).lat ?? null}
                    lng={(selected.lead.property as any).lng ?? null}
                    propertyId={selected.lead.property.id}
                  />
                  <div className="mt-2">
                    <Button type="button" className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={() => {
                      const addr = `${selected.lead!.property!.address1}, ${selected.lead!.property!.city}, ${selected.lead!.property!.state} ${selected.lead!.property!.postal}`;
                      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
                      window.open(url, '_blank');
                    }}>Navigate</Button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-500">No linked lead/contact for this appointment.</div>
        )}
      </div>
      <div className="space-y-3">
        {(selected?.lead?.category || form.title) && (
          <div className="space-y-1">
            <div className="text-xs text-slate-500">Category / Title</div>
            <div className="text-sm font-semibold">{selected?.lead?.category || form.title}</div>
          </div>
        )}
  <TimeRangeDisplay form={form} />
        {selected?.lead && (
          <div className="text-xs text-slate-500">
            Assigned to:{' '}
            <span className="font-medium text-slate-600">{selected.lead.assignee?.name || selected.lead.assignee?.email || 'Unassigned'}</span>
          </div>
        )}
        <div className="text-sm border rounded-md p-3 bg-slate-50">
          <div className="text-xs font-semibold text-slate-600 mb-1">Notes</div>
          <div className="whitespace-pre-wrap text-slate-800 min-h-[40px]">
            {form.description?.trim() ? form.description : '—'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input id="allday" type="checkbox" checked={!!form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} />
          <label htmlFor="allday" className="text-sm">All day</label>
        </div>
  <ManageButtonCluster form={form} setForm={setForm} onDelete={del} />
      </div>
    </div>
  );
}

function toLocal(v?: string) {
  if (!v) return "";
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocal(v: string) {
  return new Date(v).toISOString();
}

function normalizeTel(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return digits;
}

function TimeRangeDisplay({ form }: { form: Partial<Appt>; }) {
  const start = form.start ? new Date(form.start) : null;
  const end = form.end ? new Date(form.end) : null;
  const display = start && end ? `${formatTime12h(start)} - ${formatTime12h(end)}` : '—';
  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-500">Appointment Time</div>
      <div className="text-sm font-medium">{display}</div>
    </div>
  );
}

function ManageOverlay({ form, setForm, onClose, onDelete }: { form: Partial<Appt>; setForm: (f: Partial<Appt>) => void; onClose: () => void; onDelete: () => void; }) {
  // derive current date & slot from form.start
  const startDate = form.start ? new Date(form.start) : new Date();
  const initialDate = startDate.toISOString().slice(0,10);
  const pad = (n:number)=> String(n).padStart(2,'0');
  const hh = startDate.getHours();
  const mm = startDate.getMinutes();
  const initialSlot = `${pad(hh)}:${mm < 30 ? '00':'30'}`;
  const [date, setDate] = useState(initialDate);
  const [slot, setSlot] = useState(initialSlot);
  const slots: string[] = [];
  for (let h=7; h<=16; h++) {
    for (let m of [0,30]) {
      if (h === 16 && m === 30) continue; // last start 16:00
      slots.push(`${pad(h)}:${m===0?'00':'30'}`);
    }
  }
  const format12h = (val: string) => {
    const [hStr,mStr] = val.split(':');
    let h = parseInt(hStr,10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12; else if (h > 12) h -= 12;
    return `${h}:${mStr} ${ampm}`;
  };
  async function apply() {
    const start = new Date(`${date}T${slot}:00`);
    const end = new Date(start.getTime() + 60*60*1000); // 1 hour block
    const updated = { ...form, start: start.toISOString(), end: end.toISOString(), allDay: false };
    setForm(updated);
    if (updated.id) {
      await fetch('/api/appointments', { method: 'PUT', body: JSON.stringify({ id: updated.id, title: updated.title, start: updated.start, end: updated.end, allDay: updated.allDay, description: updated.description }) });
    }
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-md shadow-lg w-full max-w-md p-5 space-y-4 text-sm">
        <div className="font-semibold">Manage Appointment</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1">
            <label className="text-xs uppercase tracking-wide text-slate-500">Date</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="h-9 px-2 rounded border border-slate-300" />
          </div>
          <div className="grid gap-1">
            <label className="text-xs uppercase tracking-wide text-slate-500">Start (1h)</label>
            <select value={slot} onChange={e=>setSlot(e.target.value)} className="h-9 px-2 rounded border border-slate-300">
              {slots.map(s => <option key={s} value={s}>{format12h(s)}</option>)}
            </select>
          </div>
        </div>
        <div className="text-xs text-slate-500 -mt-2">End time auto-set to 1 hour after start (latest start 4:00 PM).</div>
        <div className="flex justify-between items-center pt-2">
          <Button variant="ghost" type="button" onClick={() => { if (form.id) { onDelete(); }}} disabled={!form.id}>Delete Appointment</Button>
          <div className="flex gap-2">
            <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={apply}>Apply</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManageButtonCluster({ form, setForm, onDelete }: { form: Partial<Appt>; setForm: (f: Partial<Appt>) => void; onDelete: () => void; }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-4">
      <Button type="button" className="w-full" onClick={() => setOpen(true)}>Manage Appointment</Button>
      {open && (
        <ManageOverlay form={form} setForm={setForm} onClose={() => setOpen(false)} onDelete={() => { onDelete(); setOpen(false); }} />
      )}
    </div>
  );
}
