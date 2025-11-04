import React, { useMemo } from 'react'
import { todayLocal } from '../../lib/api.js'

export default function CalendarScreen({ appts = [], onSelect, reload }) {
  const groups = useMemo(() => {
    const byDay = new Map()
    for (const a of appts) {
      const d = (a.when || '').slice(0,10) || todayLocal()
      if (!byDay.has(d)) byDay.set(d, [])
      byDay.get(d).push(a)
    }
    return Array.from(byDay.entries()).sort(([a],[b]) => a<b?-1:a>b?1:0)
  }, [appts])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">Calendar</div>
        <button className="text-xs text-blue-600" onClick={reload}>Reload</button>
      </div>
      {groups.length === 0 && (
        <div className="text-sm text-neutral-600">No appointments</div>
      )}
      <div className="space-y-2">
        {groups.map(([day, items]) => (
          <div key={day} className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
            <div className="px-4 py-2 border-b border-neutral-100 text-sm font-semibold text-white bg-[#1773e6]">
              {new Date(day).toLocaleDateString(undefined, { weekday: 'long' })}
              {` — ${new Date(day).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' })}`}
            </div>
            <ul className="divide-y">
              {items.map(a => (
                <li key={a.id} className="px-4 py-3 text-sm flex items-center gap-3 active:bg-neutral-50" onClick={()=>onSelect?.(a)}>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 border border-neutral-200">{(a.type||'other').replace('_',' ')}</span>
                  <div>
                    <div className="font-medium">{a.title || 'Untitled'}</div>
                    <div className="text-xs text-neutral-500">{new Date(a.when).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}{a.location?` • ${a.location}`:''}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
