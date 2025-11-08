import { useMemo, useState } from 'react'
import { todayLocal } from '../../lib/api.js'

function MiniMonth({ appts = [], onOpen, onSelectDay }) {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const first = new Date(year, month, 1)
  const startDay = first.getDay() // 0-6
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Build per-day markers: dots for appointments and jobs
  const byDay = new Map()
  for (const a of appts) {
    const iso = (a.when||'').slice(0,10)
    if (!iso) continue
    if (!byDay.has(iso)) byDay.set(iso, { hasAppt:false, hasJob:false })
    const entry = byDay.get(iso)
    if (a.job || a.type === 'install') entry.hasJob = true
    else entry.hasAppt = true
  }
  const rows = []
  let cells = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = new Date(year, month, d).toISOString().slice(0,10)
    const marks = byDay.get(iso) || { hasAppt:false, hasJob:false }
    cells.push({ d, iso, ...marks })
  }
  while (cells.length) rows.push(cells.splice(0,7))
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-neutral-200">
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-2xl">
        <div className="font-medium text-white">{today.toLocaleString([], { month: 'long', year: 'numeric' })}</div>
        <button className="text-xs text-white hover:bg-white/20 rounded px-2 py-1" onClick={onOpen}>Open Calendar</button>
      </div>
      <div className="grid grid-cols-7 gap-1 px-3 pb-3 text-xs select-none">
        {['S','M','T','W','T','F','S'].map(l => <div key={l} className="text-neutral-400 text-center py-1">{l}</div>)}
        {rows.flat().map((c, i) => (
          <button
            key={i}
            className={`h-10 text-center rounded bg-neutral-50 active:bg-neutral-100 ${c? '':'opacity-0'}`}
            disabled={!c}
            onClick={()=> c && onSelectDay?.(c.iso)}
          >
            {c && (
              <div className="h-10 flex flex-col items-center justify-center gap-0.5">
                <div className="leading-none">{c.d}</div>
                <div className="flex gap-1">
                  {c.hasAppt && <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-700" />}
                  {c.hasJob && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                </div>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function ContactsQuickSearch({ onOpen }) {
  const [q, setQ] = useState('')
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-neutral-200">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="font-medium">Contacts</div>
        <button className="text-xs text-blue-600" onClick={onOpen}>Open Contacts</button>
      </div>
      <div className="px-4 pb-4">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search contacts..." className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>
    </div>
  )
}

export default function Today({ appts = [], customers = [], onOpenCalendar, onOpenCustomers, onSelectCustomer }) {
  const [open, setOpen] = useState({ install: true, appts: true, emails: true })
  const [selectedDay, setSelectedDay] = useState('')
  const today = todayLocal()
  const todays = useMemo(() => appts.filter(a => (a.when||'').slice(0,10) === today), [appts, today])
  const upcomingInstalls = useMemo(() => {
    return appts
      .filter(a => a.type === 'install' || a.job)
      .sort((a,b)=> new Date(a.when) - new Date(b.when))
      .slice(0, 5)
  }, [appts])
  const dayItems = useMemo(() => appts.filter(a => (a.when||'').slice(0,10) === selectedDay), [appts, selectedDay])
  // Format a friendly label for installs: "Name - Lead - 31.50 sq"
  function formatInstallLabel(a){
    if (!a?.job) return a?.title || ''
    const raw = String(a?.title || '')
    // Extract squares if present
    const m = raw.match(/(\d+(?:\.\d+)?)\s*sq\b/i)
    const sq = m ? Number(m[1]) : null
    const sqStr = (sq!=null && isFinite(sq)) ? sq.toFixed(2) : null
    // Prefer provided customerName; else strip prefix and trailing squares from title
    let name = (a?.customerName || '').trim()
    if (!name) {
      name = raw.replace(/^JOB:\s*/i, '').replace(/\s*[–-]\s*(\d+(?:\.\d+)?)\s*sq\b.*$/i, '').trim()
    }
    return `${name || 'Customer'} - Lead${sqStr ? ` - ${sqStr} sq` : ''}`
  }
  return (
    <div className="space-y-3">
      {/* Move today’s appointments to the top */}
      <Tile
        title="Today’s Appointments"
        open={open.appts}
        onToggle={() => setOpen(s => ({ ...s, appts: !s.appts }))}
      >
        {todays.length ? (
          <ul className="text-sm text-neutral-700 list-disc pl-5">
            {todays.map(a => (
              <li key={a.id}>{new Date(a.when).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})} — {a.title}</li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-neutral-700">No appointments today.</div>
        )}
      </Tile>

      <MiniMonth appts={appts} onOpen={onOpenCalendar} onSelectDay={setSelectedDay} />

  <ContactsQuickSearch onOpen={onOpenCustomers} />

      <WeatherPill />

      <Tile
        title="Upcoming Install"
        open={open.install}
        onToggle={() => setOpen(s => ({ ...s, install: !s.install }))}
      >
  {upcomingInstalls.length ? (
          <ul className="text-sm text-neutral-700 space-y-1">
            {upcomingInstalls.map(a => (
              <li key={a.id} className="flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
    <span>{new Date(a.when).toLocaleString([], { dateStyle:'medium', timeStyle:'short' })} — {formatInstallLabel(a)}</span>
              </li>
            ))}
          </ul>
        ) : (<div className="text-sm text-neutral-700">No installs scheduled.</div>)}
      </Tile>

      

      <Tile
        title="New Emails"
        open={open.emails}
        onToggle={() => setOpen(s => ({ ...s, emails: !s.emails }))}
      >
        <div className="text-sm text-neutral-700">No new emails.</div>
      </Tile>

      <SalesCard />
      <TasksPreview />

      {/* Day overview drawer */}
      {selectedDay && (
        <div className="fixed inset-x-0 bottom-0 z-10">
          <div className="mx-auto max-w-sm p-3">
            <div className="rounded-2xl border border-neutral-200 bg-white shadow-lg">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="font-medium">{new Date(selectedDay).toLocaleDateString([], { dateStyle:'medium' })}</div>
                <button className="text-neutral-400" onClick={()=>setSelectedDay('')}>✕</button>
              </div>
              <div className="px-4 pb-4 text-sm">
                {dayItems.length ? (
                  <ul className="space-y-2">
                    {dayItems.map(a => (
                      <li key={a.id} className="flex items-start gap-2">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mt-1 ${a.job? 'bg-emerald-500':'bg-neutral-700'}`} />
                        <div>
                          <div className="font-medium">{a.job? 'Job':'Lead'} • {a.workType || a.title}</div>
                          <div className="text-neutral-600">{a.customerName || ''}{a.address? ` — ${a.address}`:''}</div>
                          <div className="text-neutral-500">{new Date(a.when).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-neutral-600">No items scheduled.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WeatherPill() {
  return (
    <div className="flex justify-end pr-1">
      <div className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
        20% rain
      </div>
    </div>
  )
}

function Tile({ title, open, onToggle, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-neutral-200">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="font-medium">{title}</div>
        <div className="text-neutral-400">{open ? '▾' : '▸'}</div>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

function SalesCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-neutral-200">
      <div className="px-4 py-3 font-medium">Sales & Commissions</div>
      <div className="grid grid-cols-2 gap-3 px-4 pb-4 text-sm">
        <Metric label="Sold" value="$0" />
        <Metric label="Completed" value="$0" />
        <Metric label="Paid" value="$0" />
        <Metric label="Comm (paid)" value="$0" />
      </div>
      <div className="px-4 pb-4 text-xs text-neutral-500">
        Rate 10% • Truck allowance $1000/mo
      </div>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-neutral-200 px-3 py-2">
      <div className="text-neutral-500 text-xs">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  )
}

function TasksPreview() {
  const items = [
    { id: 1, text: "Call Shapley’s about window options", urgency: 'orange' },
    { id: 2, text: 'Ray Brown — confirm shingles', urgency: 'red' },
    { id: 3, text: 'Power-wash station parts list', urgency: 'green' },
  ]
  const pill = c =>
    c === 'red' ? 'bg-red-50 text-red-700 border-red-200' :
    c === 'orange' ? 'bg-amber-50 text-amber-700 border-amber-200' :
    'bg-emerald-50 text-emerald-700 border-emerald-200'
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-neutral-200">
      <div className="px-4 py-3 font-medium">Tasks</div>
      <ul className="px-4 pb-4 space-y-2">
        {items.map(it => (
          <li key={it.id} className="flex items-center gap-2 text-sm">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${pill(it.urgency)}`}>
              {it.urgency}
            </span>
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
