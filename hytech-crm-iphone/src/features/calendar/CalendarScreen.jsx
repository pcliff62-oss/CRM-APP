import React, { useMemo, useRef, useState } from 'react'
import { todayLocal } from '../../lib/api.js'

export default function CalendarScreen({ appts = [], onSelect, onOpenCustomer, reload }) {
  const [filter, setFilter] = useState('all') // 'all' | 'job' | 'appt'
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

  const todayISO = todayLocal()
  const today = useMemo(() => new Date(), [])
  function startOfWeek(d){ const x=new Date(d); const day=x.getDay(); x.setHours(0,0,0,0); x.setDate(x.getDate()-day); return x }
  function endOfWeek(d){ const x=startOfWeek(d); x.setDate(x.getDate()+6); x.setHours(23,59,59,999); return x }
  function startOfMonth(d){ const x=new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x }
  function endOfMonth(d){ const x=new Date(d.getFullYear(), d.getMonth()+1, 0); x.setHours(23,59,59,999); return x }

  const filtered = useMemo(() => {
    // Determine date range based on view
    let rangeStart = new Date(0)
    let rangeEnd = new Date('2999-12-31T23:59:59Z')
    if (view==='day') {
      rangeStart = new Date(today); rangeStart.setHours(0,0,0,0)
      rangeEnd = new Date(today); rangeEnd.setHours(23,59,59,999)
    } else if (view==='week') {
      rangeStart = startOfWeek(today)
      rangeEnd = endOfWeek(today)
    } else if (view==='month') {
      rangeStart = startOfMonth(today)
      rangeEnd = endOfMonth(today)
    }
    return (appts || []).filter(a => {
      const isJob = a.job || a.type === 'install'
      if (filter === 'job') return isJob
      if (filter === 'appt') return !isJob
      // Range filter
      const t = new Date(a.when)
      return t >= rangeStart && t <= rangeEnd
    })
  }, [appts, filter, view, today])

  // Expand jobs across scheduled days (skip weekends) for month grid dots
  function expandJobsAcrossDays(items){
    const out = []
    for (const a of items) {
      const isJob = a.job || a.type === 'install'
      if (!isJob) continue
      const start = new Date(a.when)
      const end = a.end ? new Date(a.end) : new Date(start.getFullYear(), start.getMonth(), start.getDate()+1)
      const s = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const e = new Date(end.getFullYear(), end.getMonth(), end.getDate())
      for (let d = new Date(s); d < e; d.setDate(d.getDate()+1)) {
        const dow = d.getDay()
        if (dow===0 || dow===6) continue
        out.push({ ...a, __day: d.toISOString().slice(0,10) })
      }
    }
    return out
  }

  const expandedJobs = useMemo(() => expandJobsAcrossDays(filtered), [filtered])

  const groups = useMemo(() => {
    const byDay = new Map()
    const source = view==='month' ? expandedJobs : filtered
    for (const a of source) {
      const d = (a.__day || a.when || '').slice(0,10) || todayLocal()
      if (!byDay.has(d)) byDay.set(d, [])
      byDay.get(d).push(a)
    }
    // Sort days: upcoming first, then past (most recent past first, oldest last)
    const now = new Date()
    const entries = Array.from(byDay.entries())
    const future = entries.filter(([d]) => new Date(d) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))
      .sort(([a],[b]) => (new Date(a) - new Date(b)))
    const past = entries.filter(([d]) => new Date(d) < new Date(now.getFullYear(), now.getMonth(), now.getDate()))
      .sort(([a],[b]) => (new Date(b) - new Date(a)))
    const days = [...future, ...past]
    // Within each day, sort time ascending
    return days.map(([day, items]) => [day, items.slice().sort((a,b)=> new Date((a.when||a.__when||a.__day||a.when)) - new Date((b.when||b.__when||b.__day||b.when)))])
  }, [filtered, expandedJobs, view])

  // Month grid (dots for jobs) + lines for selected day
  const [selectedDay, setSelectedDay] = useState('')
  const monthGrid = useMemo(() => {
    const d = today
    const year = d.getFullYear()
    const month = d.getMonth()
    const first = new Date(year, month, 1)
    const startDay = first.getDay()
    const daysInMonth = new Date(year, month+1, 0).getDate()
    const byDay = new Map()
    for (const a of expandedJobs) {
      const iso = (a.__day || '').slice(0,10)
      if (!iso) continue
      if (!byDay.has(iso)) byDay.set(iso, 0)
      byDay.set(iso, (byDay.get(iso)||0) + 1)
    }
    const rows = []
    let cells = []
    for (let i=0;i<startDay;i++) cells.push(null)
    for (let day=1; day<=daysInMonth; day++) {
      const iso = new Date(year, month, day).toISOString().slice(0,10)
      const count = byDay.get(iso) || 0
      cells.push({ day, iso, count })
    }
    while (cells.length) rows.push(cells.splice(0,7))
    return rows
  }, [expandedJobs, today])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">Calendar</div>
        <button className="text-xs text-blue-600" onClick={reload}>Reload</button>
      </div>
      {/* Filter menu */}
      <div className="flex gap-2">
        <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden text-xs">
          <button
            className={`px-3 py-1 ${filter==='all' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700'}`}
            onClick={()=>setFilter('all')}
            aria-pressed={filter==='all'}
          >All</button>
          <button
            className={`px-3 py-1 ${filter==='job' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700'}`}
            onClick={()=>setFilter('job')}
            aria-pressed={filter==='job'}
          >Job</button>
          <button
            className={`px-3 py-1 ${filter==='appt' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700'}`}
            onClick={()=>setFilter('appt')}
            aria-pressed={filter==='appt'}
          >Appt</button>
        </div>
        {/* View menu */}
        <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden text-xs">
          <button
            className={`px-3 py-1 ${view==='day' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700'}`}
            onClick={()=>setView('day')}
            aria-pressed={view==='day'}
          >Day</button>
          <button
            className={`px-3 py-1 ${view==='week' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700'}`}
            onClick={()=>setView('week')}
            aria-pressed={view==='week'}
          >Week</button>
          <button
            className={`px-3 py-1 ${view==='month' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700'}`}
            onClick={()=>setView('month')}
            aria-pressed={view==='month'}
          >Month</button>
        </div>
      </div>
      {view==='month' ? (
        <div className="bg-white rounded-2xl border border-neutral-200">
          <div className="grid grid-cols-7 gap-1 px-3 pb-3 text-xs select-none">
            {['S','M','T','W','T','F','S'].map(l => <div key={l} className="text-neutral-400 text-center py-1">{l}</div>)}
            {monthGrid.flat().map((c, i) => (
              <button
                key={i}
                className={`h-12 text-center rounded ${c? 'bg-neutral-50 active:bg-neutral-100':'opacity-0'}`}
                disabled={!c}
                onClick={()=> c && setSelectedDay(c.iso)}
              >
                {c && (
                  <div className="h-12 flex flex-col items-center justify-center gap-0.5">
                    <div className="leading-none">{c.day}</div>
                    <div className="flex gap-1">
                      {Array.from({ length: Math.min(3, c.count) }).map((_,idx)=>(
                        <span key={idx} className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      ))}
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
          <div className="px-4 pb-4">
            {selectedDay ? (
              (() => {
                const items = (groups.find(([d])=> d===selectedDay)?.[1] || [])
                return items.length ? (
                  <ul className="text-sm text-neutral-700 divide-y">
                    {items.map(it => (
                      <li key={it.id} className="py-2 flex items-start gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full mt-1 bg-emerald-500" />
                        <div className="flex-1">
                          <div className="font-medium leading-snug">
                            {(it.job || it.type==='install') ? (it.customerName || 'Job') : (it.title || 'Appt')}
                            {(it.job || it.type==='install') && Number.isFinite(Number(it.squares)) && Number(it.squares) > 0 ? ` • ${Number(it.squares).toFixed(2)} sq` : ''}
                            {(it.job || it.type==='install') && (it.workType || it.title) ? ` — ${it.workType || it.title}` : ''}
                          </div>
                          {it.address ? (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(it.address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 underline"
                              onClick={(e)=>e.stopPropagation()}
                            >
                              {it.address}
                            </a>
                          ) : (
                            <div className="text-xs text-neutral-600">{it.address || ''}</div>
                          )}
                          <div className="text-[11px] text-neutral-500 mt-0.5">{new Date(it.when).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-sm text-neutral-600">No items on this day.</div>
              })()
            ) : (
              <div className="text-sm text-neutral-600">Tap a date to see jobs.</div>
            )}
          </div>
        </div>
      ) : groups.length === 0 ? (
        <div className="text-sm text-neutral-600">No appointments</div>
      ) : (
        <div className="space-y-2">
          {groups.map(([day, items]) => (
            <div key={day} className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
              {(() => { const onlyJobs = items.every(it => (it.job || it.type==='install')); return (
              <div className={`px-4 py-2 border-b border-neutral-100 text-sm font-semibold text-white ${onlyJobs ? 'bg-emerald-600' : 'bg-[#1773e6]'}`}>
                {new Date(day).toLocaleDateString(undefined, { weekday: 'long' })}
                {` — ${new Date(day).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' })}`}
              </div>
              )})()}
              <ul className="divide-y">
                {items.map(a => (
                  <li
                    key={a.id}
                    className="px-4 py-3 text-sm flex items-start gap-3 active:bg-neutral-50"
                    onMouseDown={(e)=>{ e.preventDefault(); startPress(a) }}
                    onMouseUp={(e)=>{ e.preventDefault(); endPress(a) }}
                    onMouseLeave={()=>cancelPress()}
                    onTouchStart={(e)=>{ /* prevent 300ms delay */ startPress(a) }}
                    onTouchEnd={()=>endPress(a)}
                    onTouchCancel={()=>cancelPress()}
                  >
                    <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 border border-neutral-200">{(a.type||'other').replace('_',' ')}</span>
                    <div className="flex-1">
                      <div className="font-medium leading-snug">
                        {a.title || 'Untitled'}
                        {(a.job || a.type==='install') && Number.isFinite(Number(a.squares)) && Number(a.squares) > 0 ? ` • ${Number(a.squares).toFixed(2)} sq` : ''}
                      </div>
                      <div className="text-xs text-neutral-500 leading-snug mt-0.5">
                        {new Date(a.when).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}
                        {a.location ? (
                          <>
                            {` • `}
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.location)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 underline"
                              onClick={(e)=>e.stopPropagation()}
                            >
                              {a.location}
                            </a>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Long-press helpers (500ms threshold)
let pressTimer = null
let longPressed = false
function startPress(item){
  cancelPress()
  longPressed = false
  pressTimer = setTimeout(()=>{ longPressed = true; if (typeof window !== 'undefined') { window.__calendarLongPressItem = item } }, 500)
}
function endPress(item){
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
  // If long-pressed: trigger edit via onSelect; else open customer
  if (longPressed) {
    // Using a dispatch pattern: the component has closure over onSelect/onOpenCustomer, but helpers are outside.
    // We fallback to a synthetic event by storing the item on window and triggering a custom event the component listens to.
    const ev = new CustomEvent('calendar-long-press', { detail: item })
    window.dispatchEvent(ev)
  } else {
    const ev = new CustomEvent('calendar-tap', { detail: item })
    window.dispatchEvent(ev)
  }
}
function cancelPress(){ if (pressTimer) { clearTimeout(pressTimer); pressTimer = null } }
