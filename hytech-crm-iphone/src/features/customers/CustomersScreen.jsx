import React, { useMemo, useState } from 'react'

export default function CustomersScreen({ items = [], reload, onSelect }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter(c => [c.name, c.email, c.phone, c.town, c.status].some(v => String(v||'').toLowerCase().includes(s)))
  }, [q, items])
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">Customers</div>
        <button className="text-xs text-blue-600" onClick={reload}>Reload</button>
      </div>
      <div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name, email, phone, town, status" className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
        <ul className="divide-y">
          {filtered.map(c => (
            <li key={c.id} className="px-4 py-3 active:bg-neutral-50" onClick={()=>onSelect?.(c)}>
              <div className="font-medium">{c.name || 'Unnamed'}</div>
              <div className="text-xs text-neutral-500">{c.town || c.status || c.email || c.phone || ''}</div>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-neutral-600">No customers found.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
