"use client";
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface ContactShape { id: string; name: string; email?: string; phone?: string; }
interface PropertyShape { id: string; address1: string; }

export default function ManageContactClient({ contact, property, inline = false }: { contact: ContactShape; property?: PropertyShape | null; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: contact.name, email: contact.email || '', phone: contact.phone || '' });
  // Leave address input blank so user can intentionally enter a new one; show current separately
  const originalAddress = property?.address1 || '';
  const [address, setAddress] = useState('');
  const addrRef = useRef<HTMLInputElement|null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch('/api/contacts', { method: 'PUT', body: JSON.stringify({ id: contact.id, ...form }) });
    if (property && address.trim()) {
      const meta = (window as any).__manageAddrMeta || {};
      await fetch('/api/properties', { method: 'PUT', body: JSON.stringify({ id: property.id, address1: address.trim(), city: meta.city || '', state: meta.state || '', postal: meta.postal || '' }) });
    }
    setSaving(false);
    setOpen(false);
    // naive reload
    window.location.reload();
  }
  // Google Places autocomplete attach (address only when property exists & panel open)
  useEffect(() => {
    if (!property || !open) return; // wait until panel visible
    if (!addrRef.current) return; // will re-run when ref mounts
    if ((addrRef.current as any)._acInit) return; // avoid duplicate
    const ensureScript = () => new Promise<void>((resolve) => {
      if (window.google && (window as any).google.maps?.places) return resolve();
      let existing = document.getElementById('google-places-lib');
      if (existing) { existing.addEventListener('load', () => resolve()); return; }
      const s = document.createElement('script');
      s.id = 'google-places-lib';
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '')}&libraries=places`;
      s.async = true; s.defer = true; s.onload = () => resolve();
      document.body.appendChild(s);
    });
    ensureScript().then(() => {
      if (!addrRef.current) return;
      // @ts-ignore
      const ac = new google.maps.places.Autocomplete(addrRef.current, { types: ['address'] });
      (addrRef.current as any)._acInit = true;
      ac.addListener('place_changed', () => {
        const p = ac.getPlace();
        const comps = (p.address_components || []) as Array<any>;
        const get = (type: string) => comps.find(c => c.types.includes(type))?.long_name || '';
        const city = get('locality') || get('sublocality') || get('administrative_area_level_2');
        const state = get('administrative_area_level_1');
        const postal = get('postal_code');
        setAddress(p.formatted_address || '');
        (window as any).__manageAddrMeta = { city, state, postal };
      });
    });
  }, [property, open]);
  async function doDelete() {
    await fetch(`/api/contacts?id=${contact.id}`, { method: 'DELETE' });
    window.location.href = '/customers';
  }
  return (
    <div className={inline ? "" : "pt-4"}>
      <Button variant="secondary" size={inline ? 'sm' : 'default'} className={inline ? '' : 'w-full'} onClick={() => setOpen(o=>!o)}>manage contact</Button>
      {open && (
        <div className={(inline ? 'mt-2' : 'mt-4') + " border rounded-md p-4 space-y-4 bg-slate-50"}>
          <div className="grid gap-3 text-sm">
            <label className="grid gap-1">
              <span className="text-xs text-slate-500 uppercase">Name</span>
              <input value={form.name} onChange={e=>setForm({ ...form, name: e.target.value })} className="h-9 rounded border px-2" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-slate-500 uppercase">Email</span>
              <input value={form.email} onChange={e=>setForm({ ...form, email: e.target.value })} className="h-9 rounded border px-2" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-slate-500 uppercase">Phone</span>
              <input value={form.phone} onChange={e=>setForm({ ...form, phone: e.target.value })} className="h-9 rounded border px-2" />
            </label>
            {property && (
              <label className="grid gap-1">
                <span className="text-xs text-slate-500 uppercase">Address (enter new)</span>
        <input ref={addrRef} value={address} onChange={e=>setAddress(e.target.value)} className="h-9 rounded border px-2" placeholder="Start typing…" />
                {originalAddress && !address && (
                  <span className="text-[10px] text-slate-500">Current: {originalAddress}</span>
                )}
              </label>
            )}
          </div>
          <div className="flex justify-between items-center pt-2">
            {!confirmingDelete ? (
              <Button type="button" variant="destructive" onClick={()=>setConfirmingDelete(true)}>delete contact</Button>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-red-600 font-medium">Confirm delete?</span>
                <Button variant="destructive" size="sm" onClick={doDelete}>Yes</Button>
                <Button variant="ghost" size="sm" onClick={()=>setConfirmingDelete(false)}>Cancel</Button>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" type="button" onClick={()=>setOpen(false)}>Close</Button>
              <Button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
