import React from 'react'

function titleCase(s = '') {
  return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

function cleanWorkType(raw = '', customer = '') {
  let t = (raw || '').trim()
  // Remove trailing "for <name>" to keep only the type, e.g., "roof replacement for X" -> "roof replacement"
  t = t.replace(/\s+for\s+.+$/i, '')
  t = t.replace(/\s*-+\s*$/g, '')
  return titleCase(t || 'Job')
}

function extractSquares(title = '') {
  const m = String(title).match(/(\d+(?:\.\d{1,2})?)\s*sq\b/i)
  return m ? Number(m[1]).toFixed(2) : ''
}

// Compute scheduled days based on start/end; skip weekends for all-day jobs
function computeJobDays(startIso, endIso, allDay = true) {
  if (!startIso) return 0
  const start = new Date(startIso)
  const end = endIso ? new Date(endIso) : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  if (e <= s) return 1
  let days = 0
  for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay()
    if (allDay) {
      if (dow !== 0 && dow !== 6) days += 1
    } else {
      days += 1
    }
  }
  return Math.max(1, days)
}

export default function JobsList({ items = [], onSelect, onBack }) {
  const jobs = (items || []).filter(a => a.job)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">Jobs</div>
        <button
          type="button"
          onClick={()=> onBack?.()}
          className="px-3 py-1.5 text-xs rounded-full border border-neutral-300 bg-white active:bg-neutral-50 shadow-sm"
        >← Back</button>
      </div>
      {jobs.length === 0 && (
        <div className="text-sm text-neutral-600">No jobs scheduled.</div>
      )}
      <ul className="bg-white rounded-2xl border border-neutral-200 divide-y">
        {jobs.map(j => (
          <li key={j.id} className="px-4 py-3 text-sm active:bg-neutral-50" onClick={()=>onSelect?.(j)}>
            <div className="flex items-start gap-3">
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Job</span>
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {(j.customerName || 'Job')}
                  {(() => { const s = extractSquares(j.title || ''); return s ? ` • ${s} sq` : '' })()}
                  {` — ${cleanWorkType(j.workType, j.customerName)}`}
                </div>
                <div className="text-xs text-neutral-500 truncate">
                  {new Date(j.when).toLocaleDateString()}
                  {` • ${computeJobDays(j.when, j.end, j.allDay ?? true)} day job`}
                  {j.address ? ` • ${j.address}` : ''}
                </div>
                {/* Removed duplicate customer/workType line to avoid redundancy */}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
