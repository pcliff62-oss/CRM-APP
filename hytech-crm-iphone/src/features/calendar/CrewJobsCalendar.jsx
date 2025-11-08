import React, { useMemo, useRef, useState } from 'react'
import { todayLocal } from '../../lib/api.js'

// Crew-focused calendar: shows multi-day jobs on their scheduled days
export default function CrewJobsCalendar({ jobs = [], onSelect, onOpenCustomer, reload }) {
  const [view, setView] = useState('month') // 'day' | 'week' | 'month'
  const mountedRef = useRef(false)
  React.useEffect(() => {
    mountedRef.current = true
    const onTap = (e) => { if (!mountedRef.current) return; const item = e.detail; onOpenCustomer?.(item) }
    const onLong = (e) => { if (!mountedRef.current) return; const item = e.detail; onSelect?.(item) }
    window.addEventListener('calendar-tap', onTap)
    window.addEventListener('calendar-long-press', onLong)
    return () => {
      mountedRef.current = false
      window.removeEventListener('calendar-tap', onTap)
      window.removeEventListener('calendar-long-press', onLong)
    }
  }, [onOpenCustomer, onSelect])

  // Helpers
  const today = useMemo(() => new Date(), [])
  function startOfWeek(d){ const x=new Date(d); const day=x.getDay(); x.setHours(0,0,0,0); x.setDate(x.getDate()-day); return x }
  function endOfWeek(d){ const x=startOfWeek(d); x.setDate(x.getDate()+6); x.setHours(23,59,59,999); return x }
  function startOfMonth(d){ const x=new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x }
  function endOfMonth(d){ const x=new Date(d.getFullYear(), d.getMonth()+1, 0); x.setHours(23,59,59,999); return x }
  const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

  // Expand each job to daily items between start and end (exclusive), skip weekends
  const expanded = useMemo(() => {
    const out = []
    for (const j of jobs || []) {
      if (!(j.job || j.type === 'install')) continue
      const start = new Date(j.when)
      const end = j.end ? new Date(j.end) : new Date(start.getFullYear(), start.getMonth(), start.getDate()+1)
      const s = toDateOnly(start)
      const e = toDateOnly(end)
      for (let d = new Date(s); d < e; d.setDate(d.getDate()+1)) {
        const dow = d.getDay()
        if (dow===0 || dow===6) continue // skip weekends
        out.push({ ...j, __day: d.toISOString().slice(0,10) })
      }
    }
    return out
  }, [jobs])

  // Filter by view range
  const daily = useMemo(() => {
    let rangeStart = new Date(0)
    let rangeEnd = new Date('2999-12-31T23:59:59Z')
    if (view==='day') {
      rangeStart = new Date(today); rangeStart.setHours(0,0,0,0)
      rangeEnd = new Date(today); rangeEnd.setHours(23,59,59,999)
    } else if (view==='week') {
      rangeStart = startOfWeek(today); rangeEnd = endOfWeek(today)
    } else if (view==='month') {
      rangeStart = startOfMonth(today); rangeEnd = endOfMonth(today)
    }
    return expanded.filter(it => {
      const d = new Date(it.__day)
      return d >= rangeStart && d <= rangeEnd
    })
  }, [expanded, view, today])

  // Group by day
  const groups = useMemo(() => {
    const source = (daily && daily.length) ? daily : expanded
    const byDay = new Map()
    for (const it of source) {
      const key = it.__day || (it.when||'').slice(0,10) || todayLocal()
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(it)
    }
    const days = Array.from(byDay.entries()).sort(([a],[b]) => new Date(a) - new Date(b))
    // Sort within day by customer name
    return days.map(([day, items]) => [day, items.slice().sort((a,b)=> (a.customerName||'').localeCompare(b.customerName||''))])
  }, [daily, expanded])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">Jobs Calendar</div>
        <button className="text-xs text-blue-600" onClick={reload}>Reload</button>
      </div>
      {/* View menu */}
      <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden text-xs">
        <button className={`px-3 py-1 ${view==='day' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700'}`} onClick={()=>setView('day')} aria-pressed={view==='day'}>Day</button>
        <button className={`px-3 py-1 ${view==='week' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700'}`} onClick={()=>setView('week')} aria-pressed={view==='week'}>Week</button>
        <button className={`px-3 py-1 ${view==='month' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700'}`} onClick={()=>setView('month')} aria-pressed={view==='month'}>Month</button>
      </div>
  {groups.length === 0 && (
        <div className="text-sm text-neutral-600">No jobs scheduled</div>
      )}
      <div className="space-y-2">
        {groups.map(([day, items]) => (
          <div key={day} className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
            <div className="px-4 py-2 border-b border-neutral-100 text-sm font-semibold text-white bg-emerald-600">
              {new Date(day).toLocaleDateString(undefined, { weekday: 'long' })}
              {` — ${new Date(day).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' })}`}
            </div>
            <ul className="divide-y">
              {items.map(a => (
                <li
                  key={`${a.id}-${day}`}
                  className="px-4 py-3 text-sm flex items-center gap-3 active:bg-neutral-50"
                  onMouseDown={(e)=>{ e.preventDefault(); startPress(a) }}
                  onMouseUp={(e)=>{ e.preventDefault(); endPress(a) }}
                  onMouseLeave={()=>cancelPress()}
                  onTouchStart={() => startPress(a)}
                  onTouchEnd={()=>endPress(a)}
                  onTouchCancel={()=>cancelPress()}
                >
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Job</span>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{(a.customerName || 'Job')} — {a.workType || 'Install'}</div>
                    <div className="text-xs text-neutral-500 truncate">{a.address || ''}</div>
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

// Long-press helpers (shared pattern)
let pressTimer = null
let longPressed = false
function startPress(item){
  cancelPress()
  longPressed = false
  pressTimer = setTimeout(()=>{ longPressed = true; if (typeof window !== 'undefined') { window.__calendarLongPressItem = item } }, 500)
}
function endPress(item){
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
  if (longPressed) {
    const ev = new CustomEvent('calendar-long-press', { detail: item })
    window.dispatchEvent(ev)
  } else {
    const ev = new CustomEvent('calendar-tap', { detail: item })
    window.dispatchEvent(ev)
  }
}
function cancelPress(){ if (pressTimer) { clearTimeout(pressTimer); pressTimer = null } }
