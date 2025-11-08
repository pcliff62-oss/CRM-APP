import React, { useEffect, useState } from 'react'
import Chips from '../../ui/Chips.jsx'
import { STATUSES } from './statuses.js'

export default function CustomersToolbar({ q, onQ, status, onStatus, onNew }){
  const [localQ, setLocalQ] = useState(q || '')
  useEffect(() => { setLocalQ(q || '') }, [q])
  useEffect(() => {
    const t = setTimeout(() => onQ?.(localQ), 250)
    return () => clearTimeout(t)
  }, [localQ])
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={localQ}
          onChange={e=>setLocalQ(e.target.value)}
          placeholder="Search name, town, status…"
          className="flex-1 rounded-2xl border border-neutral-300 px-3 py-2 text-sm"
        />
        <button onClick={onNew} className="rounded-xl bg-neutral-900 text-white text-sm px-3 py-2">New</button>
      </div>
      <Chips options={['', ...STATUSES]} value={status || ''} onChange={onStatus} />
    </div>
  )
}

