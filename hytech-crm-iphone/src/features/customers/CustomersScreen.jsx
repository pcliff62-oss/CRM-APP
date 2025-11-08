import React, { useMemo, useState } from 'react'

function FlagToggle({ id, initial }) {
  const [open, setOpen] = useState(false)
  const [color, setColor] = useState(initial || null)
  async function setFlag(next){
    try {
      const payload = { color: next }
      const res = await fetch(`/api/contacts/${encodeURIComponent(id)}/flag`, { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) })
      if (res.ok) {
        const data = await res.json().catch(()=>null)
        setColor(data?.item?.flagColor || next || null)
        setOpen(false)
      }
    } catch {}
  }
  const colorClass = color==='red'?'text-red-500': color==='yellow'?'text-yellow-400': color==='green'?'text-green-500':'text-neutral-400'
  return (
    <div className="relative inline-block">
      <button onClick={()=>setOpen(o=>!o)} className={`p-1 rounded-lg active:scale-95 ${colorClass}`} aria-label="Flag">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M6 3h8l1 2h4v11h-7l-1-2H8v7H6z"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-50 bg-white border border-neutral-200 rounded-md shadow p-2 flex items-center gap-2">
          <button onClick={()=>setFlag('red')} className="h-5 w-5 rounded-full bg-red-500" aria-label="Red"/>
          <button onClick={()=>setFlag('yellow')} className="h-5 w-5 rounded-full bg-yellow-400" aria-label="Yellow"/>
          <button onClick={()=>setFlag('green')} className="h-5 w-5 rounded-full bg-green-500" aria-label="Green"/>
          <button onClick={()=>setFlag(null)} className="px-2 h-5 rounded border text-xs text-neutral-600">Clear</button>
        </div>
      )}
    </div>
  )
}

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
            <li key={c.id} className="px-4 py-3 active:bg-neutral-50">
              <div className="flex items-center justify-between">
                <div className="font-medium" onClick={()=>onSelect?.(c)}>{c.name || 'Unnamed'}</div>
                <FlagToggle id={c.id} initial={c.flagColor} />
              </div>
              <div className="text-xs text-neutral-500" onClick={()=>onSelect?.(c)}>{c.town || c.status || c.email || c.phone || ''}</div>
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
