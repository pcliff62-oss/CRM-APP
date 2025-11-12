"use client";
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';

const ROLE_OPTIONS = ['ADMIN','SALES','CREW','EMPLOYEE'] as const;

type Role = typeof ROLE_OPTIONS[number];

type User = { id: string; email: string; name: string; role: Role; commissionRate?: number|null; hourlyRate?: number|null; ratePerSquare?: number|null; managerBaseType?: 'day'|'week'|'month'|'hourly'|null; managerBaseValue?: number|null };

export default function UsersManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<{ email: string; name: string; role: Role; commissionRate?: string; hourlyRate?: string; ratePerSquare?: string; managerBaseType?: string; managerBaseValue?: string }>({ email:'', name:'', role:'EMPLOYEE' });
  const [loading, setLoading] = useState(false);

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

  const createUser = async () => {
    if (!form.email.trim()) return;
    const payload: any = { email: form.email.trim(), name: form.name.trim() || form.email.trim(), role: form.role };
    // attach optional extras depending on role (persist later when API supports)
    if (form.role==='SALES' && form.commissionRate) payload.commissionRate = Number(form.commissionRate);
    if (form.role==='EMPLOYEE' && form.hourlyRate) payload.hourlyRate = Number(form.hourlyRate);
  if (form.role==='CREW' && form.ratePerSquare) payload.ratePerSquare = Number(form.ratePerSquare);
    if (form.role==='ADMIN' && form.managerBaseType && form.managerBaseValue) {
      payload.managerBaseType = form.managerBaseType;
      payload.managerBaseValue = Number(form.managerBaseValue);
    }
    const resp = await fetch('/api/users', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    let data: any = null;
    try { data = await resp.json(); } catch {}
    if (!resp.ok || data?.ok === false) {
      const msg = data?.error || `Failed to add user (${resp.status})`;
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
      case 'SALES': return (
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 w-32">Commission %</label>
          <input type="number" step="0.01" className="h-9 rounded border border-slate-300 px-2 w-40" value={form.commissionRate||''} onChange={e=>setForm(f=>({...f, commissionRate: e.target.value}))} />
        </div>
      );
      case 'EMPLOYEE': return (
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 w-32">Hourly Rate</label>
          <input type="number" step="0.01" className="h-9 rounded border border-slate-300 px-2 w-40" value={form.hourlyRate||''} onChange={e=>setForm(f=>({...f, hourlyRate: e.target.value}))} />
        </div>
      );
      case 'CREW': return (
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 w-32">Rate / sq</label>
          <input type="number" step="0.01" className="h-9 rounded border border-slate-300 px-2 w-40" value={form.ratePerSquare||''} onChange={e=>setForm(f=>({...f, ratePerSquare: e.target.value}))} />
        </div>
      );
      case 'ADMIN': return (
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 w-32">Base (mgr)</label>
          <select className="h-9 rounded border border-slate-300 px-2" value={form.managerBaseType||''} onChange={e=>setForm(f=>({...f, managerBaseType: e.target.value}))}>
            <option value="">Select</option>
            <option value="day">Per Day</option>
            <option value="week">Per Week</option>
            <option value="month">Per Month</option>
            <option value="hourly">Hourly</option>
          </select>
          <input type="number" step="0.01" className="h-9 rounded border border-slate-300 px-2 w-40" value={form.managerBaseValue||''} onChange={e=>setForm(f=>({...f, managerBaseValue: e.target.value}))} />
        </div>
      );
    }
    return null;
  }, [form]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 p-3 bg-white">
        <div className="text-sm font-semibold mb-3">Add User</div>
        <div className="flex flex-wrap items-center gap-3">
          <input placeholder="Email" className="h-9 rounded border border-slate-300 px-2 w-56" value={form.email} onChange={e=>setForm(f=>({...f, email:e.target.value}))} />
          <input placeholder="Name (optional)" className="h-9 rounded border border-slate-300 px-2 w-48" value={form.name} onChange={e=>setForm(f=>({...f, name:e.target.value}))} />
          <select className="h-9 rounded border border-slate-300 px-2" value={form.role} onChange={e=>setForm(f=>({...f, role: e.target.value as Role }))}>
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {detailFields}
          <button
            onClick={createUser}
            disabled={!form.email.trim() || loading}
            className="h-9 px-4 rounded bg-blue-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
          >Add User</button>
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="px-3 py-2 text-sm font-semibold border-b">Users</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-3 py-2">{u.name}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.role}</td>
                <td className="px-3 py-2">
                  <button className="text-red-600 hover:underline" onClick={()=>deleteUser(u.id)}>Remove</button>
                </td>
              </tr>
            ))}
            {users.length===0 && (
              <tr><td className="px-3 py-3 text-slate-500" colSpan={4}>No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
