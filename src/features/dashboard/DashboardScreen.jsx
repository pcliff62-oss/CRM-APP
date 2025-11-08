import React, { useMemo, useState } from 'react'
import Diagnostics from '../diagnostics/Diagnostics.jsx'

export default function DashboardScreen() {
  // UI state (local only; data wiring later)
  const [salesOpen, setSalesOpen] = useState(false)

  // Fake preview data (replace later)
  const today = useMemo(() => ({
    upcomingInstall: { addr: '6 Buckingham Rd, Dennis', time: '8:00 AM' },
    appts: [
      { id: 'a1', time: '10:30 AM', who: 'Eileen & Trevor', where: 'Barnstable' },
      { id: 'a2', time: '1:00 PM', who: 'Ray Brown', where: 'Dennis' },
    ],
    newEmails: [
      { id: 'e1', from: 'permits@town.gov', subject: 'Permit Approved' },
      { id: 'e2', from: 'marybeth@example.com', subject: 'Saturday availability' },
    ],
    weatherPill: '20% rain',
  }), [])

  const tasks = useMemo(() => ([
    { id: 't1', text: 'Order white cedar shingles', urgency: 'high' },
    { id: 't2', text: 'Confirm dumpster drop', urgency: 'med' },
    { id: 't3', text: 'Upload roofer.com PDF for Mucciarone', urgency: 'low' },
  ]), [])

  const sales = useMemo(() => ({
    sold: '$124,500',
    completed: '$88,300',
    paid: '$61,900',
    commPaid: '$12,380',
    rate: '10%',
    allowance: '$1,000/mo',
  }), [])

  const dateLabel = useMemo(() => new Date().toLocaleDateString(undefined, { month:'long', day:'numeric', year:'numeric' }), [])

  const tiles = [
    { key:'install', label:'Upcoming Install', count: today.upcomingInstall ? 0 : 0 },
    { key:'appts', label:"Today's Appointments", count: today.appts.length },
    { key:'emails', label:'New Emails', count: today.newEmails.length },
    { key:'tasks', label:'Tasks', count: tasks.length },
    { key:'repairs', label:'Repair List', count: 0 },
    { key:'quick', label:'Quick Note', count: 0 },
    { key:'sales', label:'Sales & Commissions', count: 0, onClick: () => setSalesOpen(s=>!s) },
    { key:'calc', label:'Hytech Calculator', count: 0 },
    { key:'weather', label:'Hytech Weather App', count: 0 },
  ]

  return (
    <div className="w-full mx-auto px-3 pb-24 pt-3">
      {/* date header and tiles edge-to-edge like customer cards */}
      <div className="text-center text-xl font-semibold select-none mb-3">{dateLabel}</div>
      <div className="space-y-3">
        {tiles.map(t => (
          <GlassTile key={t.key} label={t.label} count={t.count} onClick={t.onClick} />
        ))}
      </div>

      {/* Expand area for sales metrics when opened */}
      {salesOpen && (
        <div className="mt-3 rounded-2xl border border-neutral-200 bg-white shadow-sm p-4">
          <div className="text-base font-semibold mb-2">Sales & Commissions</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Sold" value={sales.sold} />
            <Metric label="Completed" value={sales.completed} />
            <Metric label="Paid" value={sales.paid} />
            <Metric label="Comm (paid)" value={sales.commPaid} />
          </div>
        </div>
      )}

      {/* Diagnostics at the very bottom; keep it small and unobtrusive */}
      <div className="mt-6 mb-16">
        <Diagnostics />
      </div>
    </div>
  )
}

function GlassTile({ label, count=0, onClick }){
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between rounded-2xl px-4 py-3 text-left
                 bg-white border border-neutral-200 hover:bg-neutral-50 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-[40px] h-8 px-3 rounded-xl flex items-center justify-center text-base font-semibold
                        bg-neutral-50 border border-neutral-200 text-neutral-900">
          {count}
        </div>
        <div className="text-[17px] font-medium text-neutral-900">{label}</div>
      </div>
      <div className="h-8 w-8 rounded-xl flex items-center justify-center bg-neutral-50 border border-neutral-200 text-neutral-600">
        <ChevronDownIcon />
      </div>
    </button>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-white/60 bg-white/60 backdrop-blur-md p-3">
      <div className="text-xs text-neutral-600">{label}</div>
      <div className="text-sm font-semibold text-neutral-900">{value}</div>
    </div>
  )
}

function UrgencyPill({ level }) {
  const map = {
    high: 'bg-red-50 text-red-700',
    med: 'bg-amber-50 text-amber-700',
    low: 'bg-emerald-50 text-emerald-700',
  }
  const label = level === 'high' ? 'Urgent' : level === 'med' ? 'Medium' : 'Low'
  return (
    <span className={`text-xs px-2 py-1 rounded-full ${map[level] || 'bg-neutral-100 text-neutral-700'}`}>
      {label}
    </span>
  )
}

function ChevronDownIcon(){
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  )
}
