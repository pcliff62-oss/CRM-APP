import React from 'react'

export default function LeadsList({ items = [], onSelect, onBack }) {
  const leadsOnly = (items || []).filter(l => (l.status || '').toUpperCase() === 'LEAD')
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">Leads</div>
        <button
          type="button"
          onClick={()=> onBack?.()}
          className="px-3 py-1.5 text-xs rounded-full border border-neutral-300 bg-white active:bg-neutral-50 shadow-sm"
        >← Back</button>
      </div>
      {leadsOnly.length === 0 && (
        <div className="text-sm text-neutral-600">No leads in the pipeline.</div>
      )}
      <ul className="bg-white rounded-2xl border border-neutral-200 divide-y">
        {leadsOnly.map(l => (
          <li key={l.id} className="px-4 py-3 text-sm active:bg-neutral-50" onClick={()=>onSelect?.(l)}>
            <div className="flex items-start gap-3">
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">Lead</span>
              <div className="min-w-0">
                <div className="font-medium truncate">{l.name}</div>
                <div className="text-xs text-neutral-500 truncate">{l.address || '—'}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
