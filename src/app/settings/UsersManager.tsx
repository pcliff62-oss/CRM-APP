"use client";
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';

const ROLE_OPTIONS = ['ADMIN','SALES','CREW','EMPLOYEE','MANAGER'] as const;

type Role = typeof ROLE_OPTIONS[number];

type User = { id: string; email: string; name: string; role: Role; calendarColor?: string|null; managerBaseType?: 'day'|'week'|'month'|'hourly'|null; managerBaseValue?: number|null; payStructure?: 'Rate / Sq' | 'Commission' | 'Salary' | null; salaryMode?: 'Hourly' | 'Daily' | 'Weekly' | 'Monthly' | null; rateOfPay?: number | null; docs?: { type: string; path: string; name?: string; expires?: string|null }[] };
// extend docs to optionally include expires

export default function UsersManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<{ email: string; name: string; role: Role; calendarColor?: string; managerBaseType?: string; managerBaseValue?: string; payStructures?: Array<'Rate / Sq' | 'Commission' | 'Salary'>; salaryMode?: 'Hourly' | 'Daily' | 'Weekly' | 'Monthly' | ''; ratePerSquare?: string; commissionPercent?: string; salaryRate?: string }>({ email:'', name:'', role:'EMPLOYEE', payStructures: [], calendarColor:'' });
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [roleFilter, setRoleFilter] = useState<Role | 'ALL'>('ALL');
  const [docsUserId, setDocsUserId] = useState<string|null>(null);
  const [uploading, setUploading] = useState(false);
  const [docError, setDocError] = useState<string|null>(null);
  const [viewDocsUserId, setViewDocsUserId] = useState<string|null>(null);
  const [docSuccess, setDocSuccess] = useState<string|null>(null);
  const [savingExpire, setSavingExpire] = useState<string|null>(null);
  const [expireError, setExpireError] = useState<string|null>(null);
  const [expireSuccess, setExpireSuccess] = useState<string|null>(null);
  const [editUserId, setEditUserId] = useState<string|null>(null);
  const [editForm, setEditForm] = useState<{ email?: string; name?: string; role?: Role; calendarColor?: string; payStructures?: Array<'Rate / Sq' | 'Commission' | 'Salary'>; ratePerSquare?: string; commissionPercent?: string; salaryMode?: 'Hourly'|'Daily'|'Weekly'|'Monthly'|''; salaryRate?: string }>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string|null>(null);
  const [editSuccess, setEditSuccess] = useState<string|null>(null);

  async function uploadDoc(userId: string, type: string, file: File) {
  setUploading(true); setDocError(null); setDocSuccess(null);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', type);
      const resp = await fetch(`/api/users/${encodeURIComponent(userId)}/docs`, { method:'POST', body: fd });
      const j = await resp.json().catch(()=>({}));
  if (!resp.ok || j?.ok===false) { setDocError(j?.error || 'Upload failed'); return; }
  if (j?.persistedCount === 0) {
    setDocError('Upload returned success but nothing persisted (server empty).');
  } else {
    setDocSuccess(`${type.replace('_',' ')} uploaded`);
  }
      // Optimistically update docs without full reload if items returned
      setUsers(prev => prev.map(u => {
        if (u.id !== userId) return u;
        let nextDocs: { type: string; path: string; name?: string }[] = Array.isArray(u.docs) ? [...u.docs] : [];
        const newDoc = j?.item;
        if (newDoc && newDoc.type) {
          // Replace same category, keep others
          nextDocs = nextDocs.filter(d => d.type !== newDoc.type);
          nextDocs.push(newDoc);
          // Normalize order to fixed category sequence
          const order = ['workers_comp','liability','w9','other'];
          nextDocs.sort((a,b)=> order.indexOf(a.type) - order.indexOf(b.type));
        } else if (Array.isArray(j.items)) {
          nextDocs = j.items;
        }
        return { ...u, docs: nextDocs };
      }));
      // Confirm persisted docs by fetching server copy
      try {
        const r2 = await fetch(`/api/users/${encodeURIComponent(userId)}/docs?t=${Date.now()}`);
        const j2 = await r2.json().catch(()=>({}));
        if (r2.ok && j2?.ok !== false && Array.isArray(j2.items)) {
          setUsers(prev => prev.map(u => u.id===userId ? { ...u, docs: j2.items } : u));
        } else {
          console.warn('Post-upload docs fetch failed', j2?.error);
        }
        // If persisted docs come back empty unexpectedly, surface warning
        if (r2.ok && Array.isArray(j2.items) && j2.items.length === 0) {
          setDocError('Warning: server returned no documents after upload');
        }
      } catch (e) {
        console.warn('Post-upload fetch error', e);
      }
    } finally { setUploading(false); }
  }

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/users?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) {
        const txt = await r.text().catch(()=>'' as any);
        console.error('Load users failed', r.status, txt);
        alert(`Load users failed (${r.status})`);
        setUsers([]);
        return;
      }
      const d = await r.json();
      const items = Array.isArray(d) ? d : (Array.isArray(d.items) ? d.items : []);
      setUsers(items as User[]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  // Sync persisted docs when opening view modal
  useEffect(() => {
    const id = viewDocsUserId;
    if (!id) return;
    (async () => {
      try {
        const r = await fetch(`/api/users/${encodeURIComponent(id)}/docs?t=${Date.now()}`);
        const j = await r.json().catch(()=>({}));
        if (r.ok && j?.ok !== false && Array.isArray(j.items)) {
          setUsers(prev => prev.map(u => u.id===id ? { ...u, docs: j.items } : u));
        } else {
          console.warn('Failed to sync docs', j?.error);
        }
      } catch (e) {
        console.warn('Docs sync error', e);
      }
    })();
  }, [viewDocsUserId]);

  const createUser = async () => {
    if (!form.email.trim()) return;
    // Validate pay values based on structures
    if (form.role !== 'ADMIN' && form.payStructures && form.payStructures.length) {
      for (const s of form.payStructures) {
        if (s === 'Rate / Sq') {
          const v = (form.ratePerSquare || '').trim();
          if (!/^\d{2,3}$/.test(v)) {
            alert('Please enter a 2–3 digit Rate / Sq (e.g., 25 or 150).');
            return;
          }
        } else if (s === 'Commission') {
          const v = (form.commissionPercent || '').trim();
          if (!/^\d{2}$/.test(v)) {
            alert('Please enter a 2-digit commission percentage (10–99).');
            return;
          }
        } else if (s === 'Salary') {
          const raw = (form.salaryRate || '').trim();
          if (!raw) {
            alert('Please enter a salary rate.');
            return;
          }
          const v = raw.replace(/,/g, '');
          // Allow 2–5 digit integer, optional . and 1–2 decimals
          if (!/^\d{2,5}(?:\.\d{1,2})?$/.test(v)) {
            alert('Enter 2–5 digits, optional . and 1–2 decimals (e.g., 25, 25.5, 25.50, 150, 12,345.67).');
            return;
          }
          if (!form.salaryMode) {
            alert('Please select a Salary Mode.');
            return;
          }
        }
      }
    }
  const nameVal = form.name.trim();
  if (!nameVal) { alert('Name is required'); return; }
  if (users.some(u=>u.name.toLowerCase()===nameVal.toLowerCase())) { alert('Name already exists'); return; }
  const payload: any = { email: form.email.trim(), name: nameVal, role: form.role };
  if (form.calendarColor) payload.calendarColor = form.calendarColor.trim();
    // attach optional extras depending on role (persist later when API supports)
  // role-specific pay fields removed (use Pay Structure only)
    if (form.role==='ADMIN' && form.managerBaseType && form.managerBaseValue) {
      payload.managerBaseType = form.managerBaseType;
      payload.managerBaseValue = Number(form.managerBaseValue);
    }
  // attach pay structure fields if present
  if (form.payStructures && form.payStructures.length) payload.payStructures = form.payStructures.slice();
  if (form.payStructures?.includes('Rate / Sq') && form.ratePerSquare) payload.ratePerSquare = Number.parseInt(form.ratePerSquare, 10);
  if (form.payStructures?.includes('Commission') && form.commissionPercent) payload.commissionPercent = Number.parseInt(form.commissionPercent, 10);
  if (form.payStructures?.includes('Salary') && form.salaryRate) payload.salaryRate = Number((form.salaryRate || '').replace(/,/g, ''));
  if (form.payStructures?.includes('Salary') && form.salaryMode) payload.salaryMode = form.salaryMode;
    const resp = await fetch('/api/users', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    let data: any = null;
    try { data = await resp.json(); } catch {}
    if (!resp.ok || data?.ok === false) {
      const code = data?.code;
      let msg = data?.error || `Failed to add user (${resp.status})`;
      if (code === 'EMAIL_EXISTS') msg = 'Email already in use.';
      else if (code === 'NAME_EXISTS') msg = 'Name already exists.';
      else if (code === 'VALIDATION') msg = data?.error || 'Invalid input.';
      else if (code === 'UNAUTHORIZED') msg = 'Unauthorized.';
      alert(msg);
      return;
    }
    const created = data?.item;
    if (created) {
      setUsers(prev => [created as User, ...prev.filter(u => u.id !== created.id)]);
    }
  setForm({ email:'', name:'', role: form.role });
    await load();
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Remove this user?')) return;
    const r = await fetch(`/api/users/${encodeURIComponent(id)}`, { method:'DELETE' });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || j?.ok===false) {
      alert(j?.error || `Failed to remove (HTTP ${r.status})`);
      return;
    }
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  const detailFields = useMemo(() => {
    switch(form.role){
  // SALES/EMPLOYEE/CREW: no extra input fields here; use Pay Structure widgets below
  case 'SALES': return null;
  case 'EMPLOYEE': return null;
  case 'CREW': return null;
  case 'ADMIN': return null;
    }
    return null;
  }, [form]);

  return (
    <div className="space-y-4">
      {/* Toggle button */}
      <div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500"
          >
            <span className="text-lg leading-none">+</span>
            <span>Add New Users</span>
          </button>
        )}
        {showForm && (
          <div className="rounded-lg border border-slate-200 p-3 bg-white mt-3">
            <div className="flex items-start justify-between mb-3">
              <div className="text-sm font-semibold">Add User</div>
              {/* Calendar Color (for SALES, MANAGER, ADMIN only) */}
              {['SALES','MANAGER','ADMIN'].includes(form.role) && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-600">Color</label>
                  <ColorSelect value={form.calendarColor||''} onChange={val=> setForm(f=>({...f, calendarColor: val}))} />
                </div>
              )}
              <button
                onClick={() => setShowForm(false)}
                className="h-7 px-2 rounded bg-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-300"
              >Close</button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input placeholder="Email" className="h-9 rounded border border-slate-300 px-2 w-56" value={form.email} onChange={e=>setForm(f=>({...f, email:e.target.value}))} />
              <input
                placeholder="Name (required)"
                className="h-9 rounded border border-slate-300 px-2 w-48"
                value={form.name}
                onChange={e=>setForm(f=>({ ...f, name: e.target.value.replace(/\s+/g,'') }))}
              />
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Roll</label>
                <select className="h-9 rounded border border-slate-300 px-2" value={form.role} onChange={e=>setForm(f=>({...f, role: e.target.value as Role }))}>
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {detailFields}
              {/* Pay Structures (multiple) + inputs (hidden for ADMIN) */}
              {form.role !== 'ADMIN' && (
                <>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-slate-600">Pay Structures</label>
                    {(['Rate / Sq','Commission','Salary'] as const).map(opt => (
                      <label key={opt} className="inline-flex items-center gap-1 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={form.payStructures?.includes(opt) || false}
                          onChange={e=>setForm(f=>{
                            const arr = new Set(f.payStructures || []);
                            if (e.target.checked) arr.add(opt); else arr.delete(opt);
                            const next: any = { ...f, payStructures: Array.from(arr) };
                            if (!arr.has('Salary')) { next.salaryMode = ''; next.salaryRate = ''; }
                            if (!arr.has('Commission')) { next.commissionPercent = ''; }
                            if (!arr.has('Rate / Sq')) { next.ratePerSquare = ''; }
                            return next;
                          })}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>

                  {/* Always show rows; disable when structure not selected */}
                  {form.payStructures?.includes('Rate / Sq') && (
                    <div className="flex flex-wrap items-center gap-2 w-full">
                      <label className="text-sm text-slate-600 w-24">Rate Per Sq.</label>
                      <input
                        placeholder="Rate Per Sq."
                        type="text"
                        inputMode="numeric"
                        className="h-9 rounded border border-slate-300 px-2 w-44"
                        value={form.ratePerSquare || ''}
                        onChange={e=>{
                          let val = e.target.value.replace(/\D/g,'').slice(0,3);
                          setForm(f=>({ ...f, ratePerSquare: val }));
                        }}
                      />
                    </div>
                  )}
                  {form.payStructures?.includes('Commission') && (
                    <div className="flex flex-wrap items-center gap-2 w-full">
                      <label className="text-sm text-slate-600 w-24">Commission %</label>
                      <div className="relative">
                        <input
                          placeholder="Commision %"
                          type="text"
                          inputMode="numeric"
                          className="h-9 rounded border border-slate-300 px-2 w-44 pr-8 text-right"
                          value={form.commissionPercent || ''}
                          onChange={e=>{
                            let val = e.target.value.replace(/\D/g,'').slice(0,2);
                            setForm(f=>({ ...f, commissionPercent: val }));
                          }}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                      </div>
                    </div>
                  )}
                  {form.payStructures?.includes('Salary') && (
                    <div className="flex flex-wrap items-center gap-4 w-full">
                      <label className="text-sm text-slate-600 w-24">Salary</label>
                      <select
                        className="h-9 rounded border border-slate-300 px-2"
                        value={form.salaryMode || ''}
                        onChange={e=>setForm(f=>({ ...f, salaryMode: (e.target.value || '') as any }))}
                      >
                        <option value="">Mode...</option>
                        <option value="Hourly">Hourly</option>
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Monthly">Monthly</option>
                      </select>
                      <input
                        placeholder="Enter Rate"
                        type="text"
                        inputMode="decimal"
                        className="h-9 rounded border border-slate-300 px-2 w-44"
                        value={form.salaryRate || ''}
                        onChange={e=>{
                          let val = e.target.value.replace(/[^0-9.]/g, '');
                          val = val.replace(/(\..*)\./g, '$1');
                          const m = val.match(/^(\d{0,5})(?:\.(\d{0,2}))?$/);
                          if (m) {
                            const intPart = m[1] || '';
                            const decPart = m[2] !== undefined ? m[2] : undefined;
                            const intWithCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                            val = intWithCommas + (decPart !== undefined ? '.' + decPart : '');
                          } else {
                            val = val.replace(/\D/g,'').slice(0,5);
                          }
                          setForm(f=>({ ...f, salaryRate: val }));
                        }}
                      />
                    </div>
                  )}
                </>
              )}
              <button
                onClick={createUser}
                disabled={!form.email.trim() || !form.name.trim() || users.some(u=>u.name.toLowerCase()===form.name.trim().toLowerCase()) || loading}
                className="h-9 px-4 rounded bg-blue-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
                title={users.some(u=>u.name.toLowerCase()===form.name.trim().toLowerCase()) ? 'Name already exists' : ''}
              >Add User</button>
            </div>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="px-3 py-2 text-sm font-semibold border-b">Users {roleFilter!=='ALL' && <span className="text-slate-500 ml-2">({roleFilter})</span>}</div>
        <div className="px-3 py-2 border-b bg-slate-50 flex flex-wrap gap-2">
          {(['ALL', ...ROLE_OPTIONS] as const).map(r => (
            <button
              key={r}
              onClick={()=> setRoleFilter(r as any)}
              className={`px-3 py-1 rounded text-sm font-medium border ${roleFilter===r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
            >{r}</button>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Documents</th>
              <th className="px-3 py-2 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.filter(u => roleFilter==='ALL' || u.role===roleFilter).map(u => (
               <tr key={u.id} className="border-b last:border-0">
                 <td className="px-3 py-2">{u.name}</td>
                 <td className="px-3 py-2">{u.email}</td>
                 <td className="px-3 py-2">{u.role}</td>
                 <td className="px-3 py-2">
                   <div className="flex flex-wrap gap-2 items-center">
                     <button className="h-6 px-2 rounded bg-slate-200 text-xs hover:bg-slate-300" title="Add document" onClick={()=> setDocsUserId(u.id)}>Add</button>
                     <button
                       className="h-6 px-2 rounded bg-slate-100 border text-xs hover:bg-slate-200 disabled:opacity-50"
                       disabled={!(u.docs && u.docs.length)}
                       onClick={()=> setViewDocsUserId(u.id)}
                     >View</button>
                   </div>
                 </td>
                 <td className="px-3 py-2">
                     <button className="ml-2 text-blue-600 hover:underline" onClick={()=>{
                       setEditUserId(u.id);
                       setEditError(null); setEditSuccess(null);
             setEditForm({
                         email: u.email,
                         name: u.name,
                         role: u.role,
               calendarColor: (u as any).calendarColor || '',
                         payStructures: (u as any).payStructures || [],
                         ratePerSquare: (u as any).ratePerSquare != null ? String((u as any).ratePerSquare) : '',
                         commissionPercent: (u as any).commissionPercent != null ? String((u as any).commissionPercent) : '',
                         salaryMode: (u as any).salaryMode || '',
                         salaryRate: (u as any).salaryRate != null ? String((u as any).salaryRate) : '',
                       });
                     }}>Edit</button>
                 </td>
               </tr>
            ))}
            {users.filter(u => roleFilter==='ALL' || u.role===roleFilter).length===0 && (
              <tr><td className="px-3 py-3 text-slate-500" colSpan={4}>No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {docsUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-md rounded-lg shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Upload Documents</h2>
              <button className="text-xs px-2 py-1 rounded bg-slate-200 hover:bg-slate-300" onClick={()=>{ setDocsUserId(null); setDocError(null); }}>Close</button>
            </div>
            <p className="text-xs text-slate-600 mb-2">Select a file for each document type you want to upload.</p>
            <div className="space-y-3">
              {['workers_comp','liability','w9','other'].map(t => (
                <div key={t} className="flex items-center gap-2">
                  <label className="w-28 text-xs font-medium capitalize">{t.replace('_',' ')}</label>
                  <input
                    type="file"
                    className="text-xs"
                    onChange={e=>{ const f = e.target.files?.[0]; if (f) uploadDoc(docsUserId, t, f); e.target.value=''; }}
                    disabled={uploading}
                  />
                </div>
              ))}
            </div>
            {uploading && <div className="mt-3 text-xs text-blue-600">Uploading...</div>}
            {docError && <div className="mt-3 text-xs text-red-600">{docError}</div>}
            {docSuccess && !uploading && !docError && (
              <div className="mt-3 text-xs text-green-600">{docSuccess} successfully.</div>
            )}
          </div>
        </div>
      )}
      {viewDocsUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-md rounded-lg shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Documents</h2>
              <button className="text-xs px-2 py-1 rounded bg-slate-200 hover:bg-slate-300" onClick={()=> setViewDocsUserId(null)}>Close</button>
            </div>
            <div className="space-y-2">
              {['workers_comp','liability','w9','other'].map(cat => {
                const user = users.find(u=>u.id===viewDocsUserId);
                const doc: any = user?.docs?.find((d:any)=>d.type===cat);
                const expiresVal = doc?.expires || '';
                const saveExpire = async () => {
                  if (!viewDocsUserId) return;
                  setSavingExpire(cat); setExpireError(null); setExpireSuccess(null);
                  const inputEl = document.getElementById(`exp-${cat}`) as HTMLInputElement | null;
                  const val = inputEl?.value || '';
                  if (val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) { setExpireError('Invalid date'); setSavingExpire(null); return; }
                  if (!doc) { setExpireError('No document uploaded for this category'); setSavingExpire(null); return; }
                  try {
                    const resp = await fetch(`/api/users/${encodeURIComponent(viewDocsUserId)}/docs`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: cat, expires: val }) });
                    const j = await resp.json().catch(()=>({}));
                    if (!resp.ok || j?.ok===false) {
                      const extra = j?.foundTypes ? ` (found: ${j.foundTypes.join(', ')||'none'})` : '';
                      setExpireError((j?.error || 'Save failed') + extra);
                    }
                    else {
                      setUsers(prev => prev.map(u => u.id===viewDocsUserId ? { ...u, docs: j.items } : u));
                      setExpireSuccess('Expiration saved');
                    }
                  } finally { setSavingExpire(null); }
                };
                // Format date mm/dd/yyyy
                const fmtDate = (iso: string) => {
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
                  const [y,m,d] = iso.split('-');
                  return `${m}/${d}/${y}`;
                };
                let statusEl: JSX.Element | null = null;
                if (doc?.expires) {
                  const now = new Date();
                  const exp = new Date(doc.expires + 'T00:00:00');
                  const diffDays = Math.ceil((exp.getTime() - now.getTime())/86400000);
                  const dateStr = fmtDate(doc.expires);
                  if (diffDays < 0) {
                    statusEl = <span className="text-[10px] font-semibold text-red-600">{dateStr} (Expired)</span>;
                  } else if (diffDays <= 14) {
                    statusEl = <span className="text-[10px] font-semibold text-amber-600">{dateStr} (Expiring in {diffDays}d)</span>;
                  } else {
                    statusEl = <span className="text-[10px] font-semibold text-green-600">{dateStr}</span>;
                  }
                }
                return (
                  <div key={cat} className="flex flex-col gap-1 border rounded px-2 py-1 bg-slate-50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-medium capitalize">{cat.replace('_',' ')}</div>
                          {statusEl}
                        </div>
                      </div>
                      {doc ? (
                        <a href={doc.path} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline" title={doc.name||doc.path}>Open</a>
                      ) : (
                        <span className="text-xs text-slate-400">None</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-600">Expiration:</span>
                      <input id={`exp-${cat}`} type="date" defaultValue={expiresVal} className="h-7 text-xs border rounded px-2" disabled={!doc} />
                      <button onClick={saveExpire} disabled={savingExpire===cat || !doc} title={!doc ? 'Upload document first' : ''} className="h-7 px-2 rounded bg-blue-600 text-white text-xs disabled:opacity-50">Save</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {expireError && <div className="mt-2 text-xs text-red-600">{expireError}</div>}
            {expireSuccess && <div className="mt-2 text-xs text-green-600">{expireSuccess}</div>}
          </div>
        </div>
      )}
      {editUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-md rounded-lg shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Edit User</h2>
              <button className="text-xs px-2 py-1 rounded bg-slate-200 hover:bg-slate-300" onClick={()=>{ setEditUserId(null); }}>Close</button>
            </div>
            <div className="space-y-3">
              <input className="h-9 rounded border border-slate-300 px-2 w-full" placeholder="Email" value={editForm.email||''} onChange={e=> setEditForm(f=>({...f, email:e.target.value}))} />
              <input className="h-9 rounded border border-slate-300 px-2 w-full" placeholder="Name" value={editForm.name||''} onChange={e=> setEditForm(f=>({...f, name:e.target.value}))} />
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-600">Role</label>
                <select className="h-9 rounded border border-slate-300 px-2" value={editForm.role||''} onChange={e=> setEditForm(f=>({...f, role: e.target.value as Role}))}>
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {editForm.role && ['SALES','MANAGER','ADMIN'].includes(editForm.role) && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-600">Color</label>
                  <ColorSelect small value={editForm.calendarColor||''} onChange={val=> setEditForm(f=>({...f, calendarColor: val}))} />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium">Pay Structures</label>
                {(['Rate / Sq','Commission','Salary'] as const).map(opt => (
                  <label key={opt} className="inline-flex items-center gap-1 text-xs text-slate-700">
                    <input type="checkbox" className="h-4 w-4" checked={editForm.payStructures?.includes(opt)||false} onChange={e=> setEditForm(f=>{
                      const set = new Set(f.payStructures||[]);
                      if (e.target.checked) set.add(opt); else set.delete(opt);
                      const next:any = { ...f, payStructures: Array.from(set) };
                      if (!set.has('Rate / Sq')) next.ratePerSquare='';
                      if (!set.has('Commission')) next.commissionPercent='';
                      if (!set.has('Salary')) { next.salaryMode=''; next.salaryRate=''; }
                      return next; })} />
                    {opt}
                  </label>
                ))}
              </div>
              {editForm.payStructures?.includes('Rate / Sq') && (
                <input className="h-9 rounded border border-slate-300 px-2 w-full" placeholder="Rate Per Sq" value={editForm.ratePerSquare||''} onChange={e=> setEditForm(f=>({...f, ratePerSquare: e.target.value.replace(/\D/g,'').slice(0,3)}))} />
              )}
              {editForm.payStructures?.includes('Commission') && (
                <input className="h-9 rounded border border-slate-300 px-2 w-full" placeholder="Commission %" value={editForm.commissionPercent||''} onChange={e=> setEditForm(f=>({...f, commissionPercent: e.target.value.replace(/\D/g,'').slice(0,2)}))} />
              )}
              {editForm.payStructures?.includes('Salary') && (
                <div className="flex items-center gap-2">
                  <select className="h-9 rounded border border-slate-300 px-2" value={editForm.salaryMode||''} onChange={e=> setEditForm(f=>({...f, salaryMode: e.target.value as any}))}>
                    <option value="">Mode...</option>
                    <option value="Hourly">Hourly</option>
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                  <input className="h-9 rounded border border-slate-300 px-2" placeholder="Salary Rate" value={editForm.salaryRate||''} onChange={e=> setEditForm(f=>({ ...f, salaryRate: e.target.value.replace(/[^0-9.]/g,'').replace(/(\..*)\./g,'$1').slice(0,10) }))} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <button disabled={savingEdit} onClick={async ()=>{
                  if (!editUserId) return;
                  setSavingEdit(true); setEditError(null); setEditSuccess(null);
                  // Basic validation similar to create
                  if (!editForm.email?.trim()) { setEditError('Email required'); setSavingEdit(false); return; }
                  if (!editForm.name?.trim()) { setEditError('Name required'); setSavingEdit(false); return; }
                  if (editForm.payStructures?.includes('Rate / Sq')) {
                    if (!/^\d{2,3}$/.test(editForm.ratePerSquare||'')) { setEditError('Invalid Rate / Sq'); setSavingEdit(false); return; }
                  }
                  if (editForm.payStructures?.includes('Commission')) {
                    if (!/^\d{2}$/.test(editForm.commissionPercent||'')) { setEditError('Invalid Commission %'); setSavingEdit(false); return; }
                  }
                  if (editForm.payStructures?.includes('Salary')) {
                    const sr = (editForm.salaryRate||'').trim();
                    if (!/^\d{2,5}(?:\.\d{1,2})?$/.test(sr)) { setEditError('Invalid Salary Rate'); setSavingEdit(false); return; }
                    if (!editForm.salaryMode) { setEditError('Select Salary Mode'); setSavingEdit(false); return; }
                  }
                  const payload:any = {};
                  if (editForm.email) payload.email = editForm.email.trim().toLowerCase();
                  if (editForm.name) payload.name = editForm.name.trim();
                  if (editForm.role) payload.role = editForm.role;
                  if (editForm.calendarColor) payload.calendarColor = editForm.calendarColor.trim();
                  if (editForm.payStructures) payload.payStructures = editForm.payStructures;
                  if (editForm.payStructures?.includes('Rate / Sq') && editForm.ratePerSquare) payload.ratePerSquare = Number(editForm.ratePerSquare);
                  if (editForm.payStructures?.includes('Commission') && editForm.commissionPercent) payload.commissionPercent = Number(editForm.commissionPercent);
                  if (editForm.payStructures?.includes('Salary') && editForm.salaryRate) payload.salaryRate = Number(editForm.salaryRate.replace(/,/g,''));
                  if (editForm.payStructures?.includes('Salary') && editForm.salaryMode) payload.salaryMode = editForm.salaryMode;
                  try {
                    const resp = await fetch(`/api/users/${encodeURIComponent(editUserId)}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                    const j = await resp.json().catch(()=>({}));
                    if (!resp.ok || j?.ok===false) { setEditError(j?.error||'Save failed'); }
                    else {
                      setEditSuccess('Saved');
                      await load();
                      setEditUserId(null);
                    }
                  } catch (e:any) {
                    setEditError(e?.message||'Error');
                  } finally { setSavingEdit(false); }
                }} className="h-8 px-3 rounded bg-blue-600 text-white text-xs disabled:opacity-50">Save</button>
                <button disabled={savingEdit} onClick={()=> setEditUserId(null)} className="h-8 px-3 rounded bg-slate-300 text-slate-700 text-xs">Cancel</button>
               <button disabled={savingEdit} onClick={async ()=>{
                 if (!editUserId) return;
                 if (!confirm('Delete this user? This cannot be undone.')) return;
                 setSavingEdit(true); setEditError(null); setEditSuccess(null);
                 try {
                   const r = await fetch(`/api/users/${encodeURIComponent(editUserId)}`, { method:'DELETE' });
                   const j = await r.json().catch(()=>({}));
                   if (!r.ok || j?.ok===false) { setEditError(j?.error||'Delete failed'); }
                   else {
                     setEditSuccess('Deleted');
                     setUsers(prev=> prev.filter(u=>u.id!==editUserId));
                     setEditUserId(null);
                   }
                 } catch (e:any) {
                   setEditError(e?.message||'Error');
                 } finally { setSavingEdit(false); }
               }} className="h-8 px-3 rounded bg-red-600 text-white text-xs disabled:opacity-50">Delete User</button>
              </div>
              {editError && <div className="text-xs text-red-600">{editError}</div>}
              {editSuccess && <div className="text-xs text-green-600">{editSuccess}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Dark color palette component
function ColorSelect({ value, onChange, small }: { value: string; onChange: (v:string)=>void; small?: boolean }) {
  const COLORS = [
    '#0f172a','#1e293b','#334155','#3b82f6','#1d4ed8','#0d9488','#065f46','#14532d','#4338ca','#3730a3','#701a75','#4c1d95','#78350f','#be123c','#9d174d','#7f1d1d','#5d0c0c'
  ];
  return (
    <div className={`flex flex-wrap gap-1 ${small? 'max-w-[180px]' : 'max-w-[220px]'}`}>
      {COLORS.map(c => {
        const active = value === c;
        return (
          <button key={c} type="button" onClick={()=> onChange(c)} title={c}
            className={`h-${small? '6':'7'} w-${small? '6':'7'} rounded-md border flex items-center justify-center text-[10px] font-medium ${active? 'ring-2 ring-white border-white shadow' : 'border-slate-700/40'} `}
            style={{ backgroundColor: c, color:'#fff' }}>
            {active? '✓' : ''}
          </button>
        );
      })}
      <button type="button" onClick={()=> onChange('')} className={`h-${small? '6':'7'} px-2 rounded-md border text-[10px] ${!value? 'bg-slate-200 text-slate-700' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{value? 'Clear' : 'None'}</button>
    </div>
  );
}
