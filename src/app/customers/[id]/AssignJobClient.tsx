"use client";
import React, { useEffect, useState } from 'react'

type Crew = { id: string; name: string; ratePerSquare?: number }

interface AssignProps {
  contactId: string;
  leadId: string;
  customerName: string;
  address: string;
  workType: string;
  jobId?: string; // existing job id if updating
  initialSquares?: number | null; // preserve squares
  onAssigned?: (item: any) => void; // callback with updated job
}
export default function AssignJobClient({ contactId, leadId, customerName, address, workType, jobId, initialSquares, onAssigned }: AssignProps) {
  const [open, setOpen] = useState(false)
  const [crews, setCrews] = useState<Crew[]>([])
  const [crewId, setCrewId] = useState('')
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [squares, setSquares] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/crews').then(r=>r.json()).then(d=> setCrews(Array.isArray(d?.items)? d.items : [])).catch(()=>setCrews([]))
  }, [open])

  async function assign() {
    try {
      setSaving(true)
      const numSquares = squares ? Number(squares) : null;
      const sqText = numSquares && isFinite(numSquares) && numSquares > 0 ? ` - ${numSquares.toFixed(2)} sq` : '';
      // If jobId provided: updating existing job (just set crewId and optional squares)
      if (jobId) {
        const update: any = { id: jobId, crewId }
        if (numSquares && isFinite(numSquares) && numSquares > 0) update.squares = numSquares
        const r = await fetch('/api/appointments', { method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(update) })
        if (!r.ok) throw new Error('Failed to assign crew')
        const j = await r.json().catch(()=>null)
        if (j?.item) onAssigned?.(j.item)
        setOpen(false)
        return
      }
      // Creating new job (no existing id) – build title including squares if provided
      const title = `JOB: ${customerName}${sqText}`
      const when = `${date}T00:00:00.000Z`
      const payload: any = { title, when, customerId: leadId, contactId, customerName, address, workType, job: true, crewId }
      if (numSquares && isFinite(numSquares) && numSquares > 0) payload.squares = numSquares
      const r = await fetch('/api/appointments', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok) throw new Error('Failed to create job')
      const j = await r.json().catch(()=>null)
      if (j?.item) onAssigned?.(j.item)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
  <button className="h-9 px-3 rounded-md bg-emerald-600 text-white" onClick={()=>setOpen(true)}>{jobId ? 'Assign Crew' : 'Assign Job'}</button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4" onClick={()=>setOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-xl shadow-xl p-4" onClick={(e)=>e.stopPropagation()}>
            <div className="font-semibold mb-3">Assign Job to Crew</div>
            <div className="space-y-3">
              <label className="block text-sm">Crew
                <select value={crewId} onChange={e=>setCrewId(e.target.value)} className="mt-1 w-full h-9 border rounded-md px-2">
                  <option value="">Select crew…</option>
                  {crews.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              {/* Removed Start Date field for assigning crew to an existing scheduled job; still available when creating a brand new job */}
              {!jobId && (
                <label className="block text-sm">Start Date
                  <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full h-9 border rounded-md px-2" />
                </label>
              )}
              <label className="block text-sm">Squares (optional){initialSquares!=null? ` (current: ${Number(initialSquares).toFixed(2)})`:''}
                <input type="number" step="0.01" value={squares} onChange={e=>setSquares(e.target.value)} placeholder={initialSquares!=null? String(initialSquares): ''} className="mt-1 w-full h-9 border rounded-md px-2" />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={()=>setOpen(false)} className="h-9 px-3 rounded-md border">Cancel</button>
                <button disabled={!crewId||saving} onClick={assign} className="h-9 px-3 rounded-md bg-emerald-600 text-white disabled:opacity-50">{saving? 'Saving…':'Assign'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Material ordered toggle (minimal inline component for reuse elsewhere)
export function MaterialOrderedToggle({ jobId, initial, onChanged }: { jobId: string; initial: boolean; onChanged?: (v:boolean)=>void }) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  async function toggle(){
    try { setSaving(true); const next = !value; const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/material-ordered`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ordered: next }) }); if (r.ok) { setValue(next); onChanged?.(next) } } finally { setSaving(false) }
  }
  return <button onClick={toggle} disabled={saving} className={"h-8 px-3 rounded-md text-xs border " + (value? 'bg-emerald-600 text-white border-emerald-600':'bg-white text-slate-700')}>{value? 'Material Ordered':'Mark Material Ordered'}</button>
}
