"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatPhone } from "@/components/utils";

type FormState = {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  category: "roof replacement" | "Siding replacement" | "Repair" | "Other" | "";
  customScope?: string;
  date: string; // yyyy-mm-dd
  time: string; // HH:MM
  userId?: string;
};

export default function NewLeadButton() {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState<FormState>({ name: "", email: "", phone: "", address: "", notes: "", category: "", date: today(), time: nextHalfHour() });
  const addrRef = useRef<HTMLInputElement | null>(null);

  // Load users and Google Places
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/users");
      if (res.ok) setUsers((await res.json()).map((u: any) => ({ id: u.id, name: u.name || u.email })));
    })();
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!addrRef.current) return;
    const existing = document.getElementById("google-places-lib");
    const loadScript = () => new Promise<void>((resolve) => {
      if (existing) return resolve();
      const s = document.createElement("script");
      s.id = "google-places-lib";
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent("AIzaSyAKv36N28YIQThsNPgEruQ9Smna8JDavo4")}&libraries=places`;
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
        const formatted = p.formatted_address || "";
        setForm((f) => ({ ...f, address: formatted }));
        (window as any).__addrMeta = { city, state, postal };
      });
    });
  }, [open]);

  const times = useMemo(() => halfHourIncrements("07:00", "17:00"), []);

  async function submit() {
    const startIso = new Date(`${form.date}T${form.time}:00`).toISOString();
    const endIso = new Date(new Date(`${form.date}T${form.time}:00`).getTime() + 60 * 60 * 1000).toISOString();
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
      customScope: form.category === "Other" ? form.customScope || null : null,
      userId: form.userId || null,
      start: startIso,
      end: endIso
    };
    const res = await fetch("/api/new-lead", { method: "POST", body: JSON.stringify(payload) });
    if (res.ok) {
      setOpen(false);
      alert("Lead created and appointment scheduled.");
      // Best-effort refresh
      window.location.reload();
    }
  }

  return (
    <>
      <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)}>New Lead</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 space-y-4">
            <div className="text-xl font-semibold">New Lead</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-slate-500">Full name</label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-500">Address</label>
                <Input ref={addrRef} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Start typing…" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Phone</label>
                <Input value={form.phone} onChange={e => {
                  const formatted = formatPhone(e.target.value);
                  setForm({ ...form, phone: formatted });
                }} placeholder="(555) 555-5555" maxLength={14} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Email</label>
                <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Category</label>
                <Select value={form.category} onChange={v => setForm({ ...form, category: v as any })}>
                  <option value="">Select…</option>
                  <option>roof replacement</option>
                  <option>Siding replacement</option>
                  <option>Repair</option>
                  <option>Other</option>
                </Select>
              </div>
              {form.category === "Other" && (
                <div>
                  <label className="text-xs text-slate-500">Specify scope</label>
                  <Input value={form.customScope || ""} onChange={e => setForm({ ...form, customScope: e.target.value })} />
                </div>
              )}
              <div>
                <label className="text-xs text-slate-500">Date</label>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Time</label>
                <Select value={form.time} onChange={v => setForm({ ...form, time: v })}>
                  {times.map(t => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-500">Assign to</label>
                <Select value={form.userId ?? ""} onChange={(v) => setForm({ ...form, userId: v || undefined })}>
                  <option value="">Me</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-500">Notes</label>
                <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} className="bg-emerald-600 hover:bg-emerald-700">Create Lead</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function today() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function nextHalfHour() {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function halfHourIncrements(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const out: string[] = [];
  for (let h = sh; h <= eh; h++) {
    for (let m of [0,30]) {
      if (h === sh && m < sm) continue;
      if (h === eh && m > em) continue;
      out.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    }
  }
  return out;
}
