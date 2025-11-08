"use client";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/components/utils";

interface Props { initialDate: string; initialTime: string; onCreated?: () => void; }

export default function NewLeadInline({ initialDate, initialTime, onCreated }: Props) {
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", address: "", notes: "", category: "", customScope: "", userId: "", date: initialDate, time: initialTime
  });
  const addrRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setForm(f => ({ ...f, date: initialDate, time: initialTime })); }, [initialDate, initialTime]);

  useEffect(() => { (async () => {
    const r = await fetch('/api/users');
    if (!r.ok) return;
    const d = await r.json().catch(()=>({ items: [] }));
    const items = Array.isArray(d?.items) ? d.items : (Array.isArray(d) ? d : []);
    const allowed = items.filter((u: any) => ['SALES','ADMIN'].includes(String(u.role||'').toUpperCase()));
    setUsers(allowed.map((u: any) => ({ id: u.id, name: u.name || u.email })));
  })(); }, []);

  useEffect(() => {
    if (!addrRef.current) return;
    const existing = document.getElementById("google-places-lib");
    const loadScript = () => new Promise<void>((resolve) => {
      if (existing) return resolve();
      const s = document.createElement("script");
      s.id = "google-places-lib";
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '')}&libraries=places`;
      s.async = true; s.defer = true; s.onload = () => resolve();
      document.body.appendChild(s);
    });
    loadScript().then(() => {
      // @ts-ignore
      const autocomplete = new google.maps.places.Autocomplete(addrRef.current!, { types: ["address"] });
      autocomplete.addListener("place_changed", () => {
        const p = autocomplete.getPlace();
        const comps = (p.address_components || []) as Array<any>;
        const get = (type: string) => comps.find(c => c.types.includes(type))?.long_name || "";
        const city = get("locality") || get("sublocality") || get("administrative_area_level_2");
        const state = get("administrative_area_level_1");
        const postal = get("postal_code");
        setForm(f => ({ ...f, address: p.formatted_address || "" }));
        (window as any).__addrMeta = { city, state, postal };
      });
    });
  }, []);

  const times = halfHourIncrements("07:00", "17:00");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const startIso = new Date(`${form.date}T${form.time}:00`).toISOString();
    const endIso = new Date(new Date(`${form.date}T${form.time}:00`).getTime() + 60*60*1000).toISOString();
    const meta = (window as any).__addrMeta || {};
    const payload = {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address,
      city: meta.city || "",
      state: meta.state || "",
      postal: meta.postal || "",
      notes: form.notes || null,
      category: form.category || null,
      customScope: form.category === 'Other' ? (form.customScope || null) : null,
      userId: form.userId || null,
      start: startIso,
      end: endIso
    };
    const res = await fetch('/api/new-lead', { method: 'POST', body: JSON.stringify(payload) });
    if (res.ok) {
      onCreated?.();
      setForm(f => ({ ...f, name: '', email: '', phone: '', address: '', notes: '', category: '', customScope: '' }));
      alert('Lead created and appointment scheduled.');
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Full name</label>
          <Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Address</label>
          <Input ref={addrRef} value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Start typing…" required />
        </div>
        <div>
          <label className="text-xs text-slate-500">Phone</label>
          <Input value={form.phone} onChange={e=>setForm({...form,phone:formatPhone(e.target.value)})} placeholder="(555) 555-5555" maxLength={14} />
        </div>
        <div>
          <label className="text-xs text-slate-500">Email</label>
          <Input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} />
        </div>
        <div>
          <label className="text-xs text-slate-500">Category</label>
          <Select value={form.category} onChange={v=>setForm({...form,category:v})}>
            <option value="">Select…</option>
            <option>roof replacement</option>
            <option>Siding replacement</option>
            <option>Repair</option>
            <option>Other</option>
          </Select>
        </div>
        {form.category === 'Other' && (
          <div>
            <label className="text-xs text-slate-500">Specify scope</label>
            <Input value={form.customScope} onChange={e=>setForm({...form,customScope:e.target.value})} />
          </div>
        )}
        <div>
          <label className="text-xs text-slate-500">Date</label>
          <Input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required />
        </div>
        <div>
          <label className="text-xs text-slate-500">Time</label>
          <Select value={form.time} onChange={v=>setForm({...form,time:v})}>
            {times.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Assign to</label>
          <Select value={form.userId} onChange={v=>setForm({...form,userId:v})}>
            <option value="">Me</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Notes</label>
          <Input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Create Lead</Button>
      </div>
    </form>
  );
}

function halfHourIncrements(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const out: string[] = [];
  for (let h=sh; h<=eh; h++) {
    for (let m of [0,30]) {
      if (h === sh && m < sm) continue;
      if (h === eh && m > em) continue;
      out.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    }
  }
  return out;
}
