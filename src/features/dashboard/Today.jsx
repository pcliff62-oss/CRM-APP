import { useState } from 'react'
import { useTasks } from '../tasks/useTasks.js'

export default function Today() {
  const [open, setOpen] = useState({
    install: true,
    appts: true,
    emails: true,
    sales: false,
    tasks: false,
  })
  const tasks = useTasks()
  return (
    <div className="p-3 space-y-3">
      <WeatherPill />
      <Tile
        title="Upcoming Install"
        open={open.install}
        onToggle={() => setOpen(s => ({ ...s, install: !s.install }))}
      >
        <div className="text-sm text-neutral-700">No installs scheduled.</div>
      </Tile>
      <Tile
        title="Today’s Appointments"
        open={open.appts}
        onToggle={() => setOpen(s => ({ ...s, appts: !s.appts }))}
      >
        <ul className="text-sm text-neutral-700 list-disc pl-5">
          <li>10:30a — Site visit: Carlton</li>
          <li>2:00p — Material drop check</li>
        </ul>
      </Tile>
      <Tile
        title="New Emails"
        open={open.emails}
        onToggle={() => setOpen(s => ({ ...s, emails: !s.emails }))}
      >
        <div className="text-sm text-neutral-700">No new emails.</div>
      </Tile>
      <Tile
        title="Sales & Commissions"
        open={open.sales}
        onToggle={() => setOpen(s => ({ ...s, sales: !s.sales }))}
      >
        <SalesCard />
      </Tile>
      <Tile
        title="Tasks"
        open={open.tasks}
        onToggle={() => setOpen(s => ({ ...s, tasks: !s.tasks }))}
      >
        <TasksPreview />
      </Tile>
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
      <div className="px-4 pb-4 text-xs text-neutral-500">Rate 10% • Truck allowance $1000/mo</div>
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
  const { items, toggle, remove } = useTasks()
  const pill = c =>
    c === 'red' ? 'bg-red-50 text-red-700 border-red-200' :
    c === 'orange' ? 'bg-amber-50 text-amber-700 border-amber-200' :
    'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (!items.length) return <div className="text-sm text-neutral-500 py-4">No tasks yet.</div>
  return (
    <ul className="space-y-2">
      {items.map(it => (
        <li key={it.id} className="flex items-center gap-2 text-sm">
          <button
            onClick={() => toggle(it.id)}
            className={`size-5 rounded border ${it.done ? 'bg-neutral-800' : 'bg-white'} border-neutral-300`}
            aria-label="toggle task"
          />
          <span className={`${it.done ? 'line-through text-neutral-400' : ''}`}>{it.text}</span>
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full border ${pill(it.urgency)}`}>
            {it.urgency}
          </span>
          <button onClick={() => remove(it.id)} className="text-neutral-400 text-xs px-1">✕</button>
        </li>
      ))}
    </ul>
  )
}
