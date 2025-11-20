"use client";
import React, { useEffect, useState } from 'react';
import { Role } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { use } from 'react';

interface LicenseItem { id: string; type: string; number: string; expires: string; }
interface CompanyInfo {
  name: string;
  phone: string;
  email: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postal: string;
  logoPath: string;
  licenses: LicenseItem[];
}

function emptyCompany(): CompanyInfo { return { name:'', phone:'', email:'', address1:'', address2:'', city:'', state:'', postal:'', logoPath:'', licenses: [] }; }

export default function CompanyInfoForm({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<CompanyInfo>(emptyCompany());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [success, setSuccess] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/company');
        const j = await res.json();
        if (j.ok && j.item && !cancelled) {
          const licenses = (j.item.licenses||[]).map((l: any, idx: number) => ({ id: String(idx), type: l.type||'', number: l.number||'', expires: l.expires? l.expires.substring(0,10): '' }));
          setData({ ...emptyCompany(), ...j.item, licenses });
        }
      } catch (e:any) { if (!cancelled) setError(e?.message||String(e)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  function update<K extends keyof CompanyInfo>(key: K, value: CompanyInfo[K]) { setData(d => ({ ...d, [key]: value })); }

  function updateLicense(id: string, patch: Partial<LicenseItem>) {
    setData(d => ({ ...d, licenses: d.licenses.map(l => l.id === id ? { ...l, ...patch } : l) }));
  }

  function addLicense() {
    setData(d => ({ ...d, licenses: [...d.licenses, { id: Math.random().toString(36).slice(2), type:'', number:'', expires:'' }] }));
  }

  function removeLicense(id: string) {
    setData(d => ({ ...d, licenses: d.licenses.filter(l => l.id !== id) }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSuccess(false);
    const payload = {
      ...data,
      licenses: data.licenses.filter(l => l.type || l.number || l.expires).map(l => ({ type: l.type, number: l.number, expires: l.expires }))
    };
    try {
      const res = await fetch('/api/company', { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const j = await res.json();
  if (!j.ok) throw new Error(j.error||'Save failed');
  setSuccess(true);
  setEditMode(false);
    } catch (e:any) { setError(e?.message||String(e)); }
    finally { setSaving(false); }
  }

  async function onLogoChange(file: File) {
    setError(null); setSuccess(false);
    const form = new FormData();
    form.append('file', file);
    form.append('folder', 'logos');
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error||'Upload failed');
      const newPath = j.item?.path || '';
      update('logoPath', newPath);
      // Auto-persist logo immediately
      const payload = {
        ...data,
        logoPath: newPath,
        licenses: data.licenses.filter(l => l.type || l.number || l.expires).map(l => ({ type: l.type, number: l.number, expires: l.expires }))
      };
      await fetch('/api/company', { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) }).catch(()=>{});
    } catch (e:any) { setError(e?.message||String(e)); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {loading && <div className="text-xs text-slate-400">Loading company info...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {success && <div className="text-sm text-green-600">Saved.</div>}
      {isAdmin && (
        <div className="flex gap-2">
          {!editMode && !loading && <Button type="button" onClick={()=> setEditMode(true)} variant="secondary">Edit</Button>}
          {editMode && <>
            <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">{saving ? 'Saving...' : 'Save'}</Button>
            <Button type="button" variant="ghost" onClick={()=> { setEditMode(false); setError(null); setSuccess(false); }}>Cancel</Button>
          </>}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Name</Label>
          {editMode && isAdmin ? (
            <Input value={data.name} onChange={e=>update('name', e.target.value)} />
          ) : (
            <div className="text-sm text-slate-700">{data.name||<span className="italic text-slate-400">(not set)</span>}</div>
          )}
        </div>
        <div>
          <Label>Phone</Label>
          {editMode && isAdmin ? (
            <Input value={data.phone} onChange={e=>update('phone', e.target.value)} />
          ) : (
            <div className="text-sm text-slate-700">{data.phone||<span className="italic text-slate-400">(not set)</span>}</div>
          )}
        </div>
        <div>
          <Label>Email</Label>
          {editMode && isAdmin ? (
            <Input value={data.email} onChange={e=>update('email', e.target.value)} />
          ) : (
            <div className="text-sm text-slate-700">{data.email||<span className="italic text-slate-400">(not set)</span>}</div>
          )}
        </div>
        <div>
          <Label>Address 1</Label>
          {editMode && isAdmin ? (
            <Input value={data.address1} onChange={e=>update('address1', e.target.value)} />
          ) : (
            <div className="text-sm text-slate-700">{data.address1||<span className="italic text-slate-400">(not set)</span>}</div>
          )}
        </div>
        <div>
          <Label>Address 2</Label>
          {editMode && isAdmin ? (
            <Input value={data.address2} onChange={e=>update('address2', e.target.value)} />
          ) : (
            <div className="text-sm text-slate-700">{data.address2||<span className="italic text-slate-400">(not set)</span>}</div>
          )}
        </div>
        <div>
          <Label>City</Label>
          {editMode && isAdmin ? (
            <Input value={data.city} onChange={e=>update('city', e.target.value)} />
          ) : (
            <div className="text-sm text-slate-700">{data.city||<span className="italic text-slate-400">(not set)</span>}</div>
          )}
        </div>
        <div>
          <Label>State</Label>
          {editMode && isAdmin ? (
            <Input value={data.state} onChange={e=>update('state', e.target.value)} />
          ) : (
            <div className="text-sm text-slate-700">{data.state||<span className="italic text-slate-400">(not set)</span>}</div>
          )}
        </div>
        <div>
          <Label>Postal</Label>
          {editMode && isAdmin ? (
            <Input value={data.postal} onChange={e=>update('postal', e.target.value)} />
          ) : (
            <div className="text-sm text-slate-700">{data.postal||<span className="italic text-slate-400">(not set)</span>}</div>
          )}
        </div>
      </div>
      <div>
        <Label>Logo</Label>
        {data.logoPath && <div className="my-2"><img src={data.logoPath} alt="Logo" className="h-16 object-contain" /></div>}
        {isAdmin && editMode && <Input type="file" accept="image/*" onChange={e=> e.target.files && e.target.files[0] && onLogoChange(e.target.files[0])} />}
      </div>
      <div>
        <Label>Licenses</Label>
        <div className="space-y-2 mt-2">
          {data.licenses.map(l => (
            <div key={l.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end border p-2 rounded">
              <div className="md:col-span-2">
                <Label className="text-xs">Type</Label>
                {editMode && isAdmin ? <Input value={l.type} onChange={e=>updateLicense(l.id,{ type: e.target.value })} /> : <div className="text-sm">{l.type||<span className="italic text-slate-400">(none)</span>}</div>}
              </div>
              <div>
                <Label className="text-xs">Number</Label>
                {editMode && isAdmin ? <Input value={l.number} onChange={e=>updateLicense(l.id,{ number: e.target.value })} /> : <div className="text-sm">{l.number||<span className="italic text-slate-400">(none)</span>}</div>}
              </div>
              <div>
                <Label className="text-xs">Expiration</Label>
                {(() => {
                  const iso = l.expires;
                  let status: 'none' | 'expired' | 'soon' | 'valid' = 'none';
                  let daysLeft: number | null = null;
                  if (iso) {
                    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
                    const diffDays = Math.floor((d.getTime() - Date.now()) / (1000*3600*24));
                    daysLeft = diffDays;
                    if (diffDays < 0) status = 'expired';
                    else if (diffDays <= 30) status = 'soon';
                    else status = 'valid';
                  }
                  const badge = status === 'none' ? null : (
                    <span className={
                      'ml-2 inline-block text-xs px-2 py-0.5 rounded ' +
                      (status==='expired' ? 'bg-red-100 text-red-700 border border-red-300' :
                       status==='soon' ? 'bg-amber-100 text-amber-700 border border-amber-300' :
                       'bg-green-100 text-green-700 border border-green-300')
                    }>
                      {status==='expired' ? 'Expired' : status==='soon' ? `Expiring (${daysLeft}d)` : 'Valid'}
                    </span>
                  );
                  return editMode && isAdmin ? (
                    <div className="flex items-center">
                      <Input type="date" value={l.expires} onChange={e=>updateLicense(l.id,{ expires: e.target.value })} />{badge}
                    </div>
                  ) : (
                    <div className={"text-sm flex items-center " + (status==='expired' ? 'text-red-700 font-medium' : '')}>
                      {l.expires||<span className="italic text-slate-400">(none)</span>}{badge}
                    </div>
                  );
                })()}
              </div>
              {isAdmin && editMode && <Button variant="destructive" type="button" onClick={()=>removeLicense(l.id)}>Remove</Button>}
            </div>
          ))}
          {isAdmin && editMode && <Button type="button" onClick={addLicense} variant="secondary">Add License</Button>}
        </div>
      </div>
  {/* Single save button kept in top toolbar */}
    </form>
  );
}
