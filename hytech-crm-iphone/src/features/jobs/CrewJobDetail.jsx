import React, { useEffect, useState, useMemo } from 'react'
import { fetchCustomer, submitJob } from '../../lib/api.js'

// Lightweight crew-facing job detail card
// Props: job (appointment with job flag), onBack, onUpdated(job), onComplete(job)
export default function CrewJobDetail({ job, userRate, onBack, onUpdated, onComplete }) {
  // Round to nearest 0.5, e.g., 13.40 -> 13.50, 13.74 -> 13.50, 13.76 -> 14.00
  const roundToHalf = (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return 0
    return Math.round(n * 2) / 2
  }
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [usedSquares, setUsedSquares] = useState(() => {
    const val = job?.squaresUsed ?? job?.squares
    if (val == null || val === '') return ''
    const n = roundToHalf(val)
    return Number.isFinite(n) ? n.toFixed(2) : ''
  })
  // Read-only rate per square from CRM user settings
  const ratePerSquare = useMemo(() => {
    const n = Number(userRate)
    return Number.isFinite(n) && n > 0 ? n : 0
  }, [userRate])
  // Extras rows: { id, desc, price }
  const [extrasRows, setExtrasRows] = useState(() => {
    try {
      const arr = JSON.parse(job?.extrasJson || '[]')
      if (Array.isArray(arr) && arr.length) {
        return arr.map((x, i) => ({
          id: x?.id || `extra-${i}`,
          desc: (x?.title || x?.desc || x?.description || (typeof x === 'string' ? x : '') || ''),
          price: (() => {
            const v = x?.price ?? x?.amount ?? x?.total
            const n = Number(v)
            return Number.isFinite(n) ? n : ''
          })()
        }))
      }
    } catch {}
    return [{ id: 'extra-0', desc: '', price: '' }]
  })
  const [attachments, setAttachments] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const adjustmentPerSq = 10 // $10 per square per adjustment

  // New adjustment state (applied vs draft)
  const [adjustPanelOpen, setAdjustPanelOpen] = useState(false)
  const [appliedAdjustments, setAppliedAdjustments] = useState({ doubleLayerRip: false, steepSlope: false, difficult: false })
  const [draftAdjustments, setDraftAdjustments] = useState(appliedAdjustments)
  const appliedAdjustmentCount = useMemo(() => Object.values(appliedAdjustments).filter(Boolean).length, [appliedAdjustments])

  useEffect(() => {
    let active = true
    async function load() {
      try {
        setLoading(true)
        setError(null)
        if (job?.customerId) {
          const c = await fetchCustomer(job.customerId)
          if (active) setCustomer(c)
        } else if (job?.contactId) {
          const c = await fetchCustomer(job.contactId)
          if (active) setCustomer(c)
        }
      } catch (e) {
        if (active) setError(e)
      } finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [job?.customerId, job?.contactId])


  const extras = Array.isArray(job?.extras) ? job.extras : []
  // Build a static map URL similar to CRM Jobs page if we have address and public maps key
  const staticMapUrl = useMemo(() => {
    const addr = job?.address || customer?.address
    if (!addr) return null
    const params = new URLSearchParams([
      ['address', addr],
      ['zoom', '20'],
      ['size', '640x240'],
      ['maptype', 'satellite'],
      ['scale', '2'],
    ])
    return `/api/maps/static?${params.toString()}`
  }, [job?.address, customer?.address])
  function addExtraRow() {
    setExtrasRows(prev => ([...prev, { id: `extra-${prev.length}`, desc: '', price: '' }]))
  }
  function updateExtraRow(idx, patch) {
    setExtrasRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }
  function removeEmptyTrailingRows() {
    setExtrasRows(prev => {
      const next = prev.slice()
      // Keep at least one row
      while (next.length > 1) {
        const last = next[next.length - 1]
        if ((String(last.desc||'').trim() === '') && (String(last.price||'') === '' || Number(last.price) === 0)) {
          next.pop()
        } else break
      }
      return next
    })
  }


  async function markComplete() {
    // Confirm before submitting completion
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Submit job completion and request payment?')
      if (!ok) return
    }
    try {
      setSubmitting(true)
      const squares = usedSquares !== ''
        ? roundToHalf(usedSquares)
        : (job?.squares != null ? roundToHalf(job.squares) : undefined)
      const extraItems = extrasRows
        .map((r,i)=>({ id: r.id || `extra-${i}`, title: String(r.desc||'').trim(), price: Number(r.price)||0, qty: 1 }))
        .filter(it => (it.title && it.title.length) || (it.price && it.price>0))
      const finalAttachments = attachments.map((f,i)=>({ id:`att-${i}`, name:f.name || `file-${i}`, url:f.url || f.preview || '' }))
      const submitted = await submitJob(job.id, { squares, extras: extraItems, attachments: finalAttachments })
      try {
        const extrasJson = JSON.stringify(extraItems)
        const adjustmentsJson = JSON.stringify({ ...appliedAdjustments, adjustmentPerSq })
        const payload = {
          leadId: submitted.customerId || submitted.contactId || undefined,
          appointmentId: submitted.id,
          crewUserId: submitted.crewId || undefined,
          customerName: submitted.customerName || submitted.title || 'Job',
          address: submitted.address || '',
          squares: Number.isFinite(Number(submitted.squares)) ? Number(submitted.squares) : undefined,
          usedSquares: squares,
          ratePerSquare: pricing?.rate || undefined,
          installTotal: pricing?.installTotal || undefined,
          extrasTotal: pricing?.extrasTotal || undefined,
          grandTotal: pricing?.grand || undefined,
          extrasJson,
          adjustmentsJson,
          completedAt: new Date().toISOString(),
        }
        // Fire and forget; Next API will persist centrally
        let pastJobId
        try {
          // Include attachmentsJson in past job record
          const pjRes = await fetch('/api/past-jobs', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ...payload, attachmentsJson: JSON.stringify(finalAttachments) }) })
          const pjJson = await pjRes.json().catch(()=>({}))
          if (pjJson?.ok && pjJson?.item?.id) pastJobId = pjJson.item.id
        } catch {}
        // Create crew payment request and ensure it's persisted (surface errors instead of swallowing)
        try {
          const paymentReq = {
            appointmentId: submitted.id,
            pastJobId,
            crewUserId: submitted.crewId || undefined,
            amount: pricing?.grand || undefined,
            customerName: submitted.customerName || submitted.title || 'Job',
            address: submitted.address || '',
            usedSquares: pricing?.used,
            ratePerSquare: pricing?.rate,
            installTotal: pricing?.installTotal,
            extrasTotal: pricing?.extrasTotal,
            grandTotal: pricing?.grand,
            extrasJson: JSON.stringify(extraItems),
            adjustmentsJson,
            attachmentsJson: JSON.stringify(finalAttachments)
          }
          const cprRes = await fetch('/api/crew-payment-requests', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(paymentReq) })
          const cprJson = await cprRes.json().catch(()=>({}))
          if (!cprRes.ok || !cprJson?.ok) {
            // Provide a visible hint so crews can report issues and admins can refresh Payroll
            throw new Error(cprJson?.error || 'Failed to create payment request')
          }
        } catch (err) {
          // Show an alert but don't stop marking job complete (PastJob and Appointment already saved)
          try { console.error('crew-payment-request create failed', err) } catch {}
          if (typeof window !== 'undefined') {
            window.alert('Payment request may not have been created. You can retry from Payroll. Error: ' + (err?.message || String(err)))
          }
        }
  // Do not move pipeline stage here; only Sales/Admin/Manager should advance pipeline.
      } catch {}
      onComplete?.(submitted)
    } catch (e) {
      alert(e?.message || String(e))
    } finally { setSubmitting(false) }
  }

  function onFilePick(e) {
    const files = Array.from(e.target.files || [])
    const mapped = files.map(f=>({ file:f, name:f.name, preview: URL.createObjectURL(f) }))
    setAttachments(prev=>[...prev, ...mapped])
  }

  // -------- Pricing / Totals Computation --------
  const pricing = useMemo(() => {
    const baseRate = ratePerSquare
    const adjustmentAdder = appliedAdjustmentCount * adjustmentPerSq
    const rate = baseRate + adjustmentAdder
    const used = (() => {
      if (usedSquares !== '') {
        const n = Number(usedSquares)
        return Number.isFinite(n) ? n : 0
      }
      // fallback to job.squaresUsed or job.squares
      const fallback = job?.squaresUsed ?? job?.squares
      const n = Number(fallback)
      return Number.isFinite(n) ? n : 0
    })()
    const installTotal = used * rate
    const newExtrasTotal = extrasRows.reduce((sum, r) => {
      const n = Number(r.price)
      if (!r.desc && (!Number.isFinite(n) || n === 0)) return sum
      return sum + (Number.isFinite(n) ? n : 0)
    }, 0)
    const existingExtrasTotal = extras.reduce((sum, x) => sum + (Number(x?.price) || 0), 0)
    const extrasTotal = newExtrasTotal + existingExtrasTotal
    const grand = installTotal + extrasTotal
    return { rate, used, installTotal, extrasTotal, grand, baseRate, adjustmentAdder }
  }, [ratePerSquare, usedSquares, extrasRows, extras, job?.squaresUsed, job?.squares, appliedAdjustmentCount])

  function fmtMoney(n) {
    return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  }

  function applyAdjustments() {
    setAppliedAdjustments(draftAdjustments)
    setAdjustPanelOpen(false)
  }
  function resetDraftToApplied() {
    setDraftAdjustments(appliedAdjustments)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Job Detail</div>
        <button onClick={onBack} className="text-sm px-3 py-1 rounded border bg-white">Back</button>
      </div>

      {/* Banner */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm flex flex-col gap-1">
        <div className="font-medium">{job.customerName || 'Job'} — {job.workType || 'Install'}</div>
        <div className="text-xs text-neutral-600">
          {new Date(job.when).toLocaleDateString()} • {(() => {
            const startIso = job?.when
            const endIso = job?.end
            const allDay = job?.allDay ?? true
            if (!startIso) return '—'
            const start = new Date(startIso)
            const end = endIso ? new Date(endIso) : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
            const s = new Date(start.getFullYear(), start.getMonth(), start.getDate())
            const e = new Date(end.getFullYear(), end.getMonth(), end.getDate())
            let days = 0
            if (e <= s) days = 1; else {
              for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
                const dow = d.getDay()
                if (allDay) {
                  if (dow !== 0 && dow !== 6) days += 1
                } else {
                  days += 1
                }
              }
            }
            days = Math.max(1, days)
            return `${days} day job`
          })()}{job.address ? ` • ${job.address}` : ''}
        </div>
      </div>

      {/* Map thumbnail + navigate */}
      <div className="space-y-2">
        <div className="rounded-2xl overflow-hidden border border-neutral-200 bg-neutral-100 h-48 flex items-center justify-center text-neutral-500 text-sm">
          {customer?.mapImagePath ? (
            <img src={customer.mapImagePath} alt="Map" className="h-full w-full object-cover" />
          ) : staticMapUrl ? (
            <img src={staticMapUrl} alt="Map" className="h-full w-full object-cover" />
          ) : (
            <span>Map thumbnail</span>
          )}
        </div>
        {job?.address && (
          <button
            onClick={() => {
              const addr = encodeURIComponent(job.address)
              const url = `https://www.google.com/maps/search/?api=1&query=${addr}`
              window.open(url, '_blank', 'noopener')
            }}
            className="w-full h-10 rounded-xl border border-neutral-200 bg-white text-sm flex items-center justify-center gap-2 active:bg-neutral-50"
          >
            <span className="text-blue-600">🧭</span>
            <span>Navigate</span>
          </button>
        )}
      </div>

      {/* Squares adjust */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3 text-sm">
        <div className="font-medium">Squares</div>
        <div className="flex items-center justify-between">
          <div className="text-neutral-600">Total Squares</div>
          <div className="font-semibold">{(() => {
            const n = roundToHalf(job?.squares)
            return Number.isFinite(n) ? n.toFixed(2) : (job?.squares ?? '—')
          })()}</div>
        </div>
        <label className="block">Actual Squares Used
          <div className="mt-1 relative flex items-stretch">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={usedSquares}
              onChange={e=> setUsedSquares(e.target.value)}
              onBlur={() => {
                if (usedSquares==='') return
                const n = roundToHalf(usedSquares)
                setUsedSquares(Number.isFinite(n) ? n.toFixed(2) : '')
              }}
              className="w-full h-9 border rounded-md pl-2 pr-16"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
              <button
                type="button"
                onClick={() => {
                  const base = usedSquares !== '' ? Number(usedSquares) : (Number(job?.squaresUsed ?? job?.squares) || 0)
                  const n = Math.max(0, roundToHalf(base - 0.5))
                  setUsedSquares(n.toFixed(2))
                }}
                className="h-7 w-8 rounded border bg-white text-neutral-700 text-sm active:bg-neutral-50"
                aria-label="Decrease by 0.5"
              >−</button>
              <button
                type="button"
                onClick={() => {
                  const base = usedSquares !== '' ? Number(usedSquares) : (Number(job?.squaresUsed ?? job?.squares) || 0)
                  const n = Math.max(0, roundToHalf(base + 0.5))
                  setUsedSquares(n.toFixed(2))
                }}
                className="h-7 w-8 rounded border bg-white text-neutral-700 text-sm active:bg-neutral-50"
                aria-label="Increase by 0.5"
              >+</button>
            </div>
          </div>
        </label>
        {/* Rate row with Adjust button */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-neutral-600">Rate</span>
              {ratePerSquare > 0 && (
                <button
                  type="button"
                  onClick={() => { setAdjustPanelOpen(o => !o); if (!adjustPanelOpen) resetDraftToApplied(); }}
                  className="text-[11px] px-2 py-0.5 rounded border bg-white active:bg-neutral-50"
                >{adjustPanelOpen ? 'Cancel' : 'Adjust rate'}</button>
              )}
            </div>
            {appliedAdjustmentCount > 0 && !adjustPanelOpen && (
              <div className="text-[11px] text-neutral-500">Base {fmtMoney(pricing.baseRate)} + {appliedAdjustmentCount} × {fmtMoney(adjustmentPerSq)} = {fmtMoney(pricing.rate)}</div>
            )}
          </div>
          <div className="font-medium text-right min-w-[110px]">{pricing.baseRate>0 ? `${fmtMoney(pricing.rate)} / sq` : '—'}</div>
        </div>
        {ratePerSquare===0 && (
          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
            No rate set for this user. Ask an admin to set “Rate per square” in user settings.
          </div>
        )}
        {adjustPanelOpen && (
          <div className="mt-3 space-y-2 border rounded-md p-3 bg-neutral-50">
            <div className="text-xs font-medium mb-1">Rate Adjustments (+{fmtMoney(adjustmentPerSq)} / sq each)</div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={draftAdjustments.doubleLayerRip} onChange={e=> setDraftAdjustments(a=>({...a, doubleLayerRip: e.target.checked}))} />
              <span>Double layer rip</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={draftAdjustments.steepSlope} onChange={e=> setDraftAdjustments(a=>({...a, steepSlope: e.target.checked}))} />
              <span>Steep slope</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={draftAdjustments.difficult} onChange={e=> setDraftAdjustments(a=>({...a, difficult: e.target.checked}))} />
              <span>Difficult</span>
            </label>
            <div className="text-[11px] text-neutral-600 mt-1">Preview: Base {fmtMoney(pricing.baseRate)} + {Object.values(draftAdjustments).filter(Boolean).length} × {fmtMoney(adjustmentPerSq)} = {fmtMoney(pricing.baseRate + Object.values(draftAdjustments).filter(Boolean).length * adjustmentPerSq)}</div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={applyAdjustments} className="h-8 px-3 rounded-md bg-emerald-600 text-white text-xs active:scale-[0.97]">Apply</button>
              <button type="button" onClick={() => { setDraftAdjustments({ doubleLayerRip:false, steepSlope:false, difficult:false }) }} className="h-8 px-3 rounded-md border bg-white text-xs active:bg-neutral-100">Clear</button>
            </div>
          </div>
        )}
      </div>

      {/* Extras */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <div className="font-medium">Extras</div>
          <button onClick={addExtraRow} className="h-8 px-2 rounded-md border bg-white text-xs active:bg-neutral-50">+ Add</button>
        </div>
        <div className="space-y-2">
          {extrasRows.map((row, idx) => (
            <div key={row.id || idx} className="grid grid-cols-5 gap-2">
              <input
                type="text"
                value={row.desc}
                onChange={e=>{ updateExtraRow(idx, { desc: e.target.value }); }}
                onBlur={removeEmptyTrailingRows}
                placeholder="Description"
                className="col-span-3 h-9 border rounded-md px-2"
              />
              <div className="col-span-2 flex items-center gap-2">
                <span className="text-neutral-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={row.price}
                  onChange={e=>{ updateExtraRow(idx, { price: e.target.value }); }}
                  onBlur={removeEmptyTrailingRows}
                  placeholder="0.00"
                  className="h-9 border rounded-md px-2 w-full text-right"
                />
              </div>
            </div>
          ))}
        </div>
        {extras.length>0 && (
          <div className="pt-1">
            <div className="text-xs text-neutral-500 mb-1">Existing extras</div>
            <ul className="text-xs text-neutral-600 flex flex-wrap gap-2">
              {extras.map(x=> <li key={x.id} className="px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200">{x.title}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Photos */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3 text-sm">
        <div className="font-medium">Photos</div>
        <input multiple type="file" accept="image/*" onChange={onFilePick} className="text-xs" />
        <div className="grid grid-cols-4 gap-2">
          {attachments.map(a => (
            <div key={a.preview} className="aspect-square rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200">
              <img src={a.preview} alt={a.name} className="h-full w-full object-cover" />
            </div>
          ))}
          {Array.isArray(customer?.photos) && customer.photos.map(p => (
            <div key={p.id || p.url} className="aspect-square rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200">
              <img src={p.url || p.path || p.imagePath} alt={p.name || 'photo'} className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-2 text-sm">
        <div className="font-medium">Totals</div>
        <div className="flex justify-between"><span className="text-neutral-600">Adjusted Rate</span><span>{fmtMoney(pricing.rate)} / sq</span></div>
        <div className="text-[11px] text-neutral-500 -mt-1 mb-1">Base {fmtMoney(pricing.baseRate)} + {appliedAdjustmentCount} × {fmtMoney(adjustmentPerSq)} = {fmtMoney(pricing.rate)}</div>
        <div className="flex justify-between"><span className="text-neutral-600">Install ({pricing.used.toFixed(2)} sq × ${pricing.rate})</span><span className="font-medium">{fmtMoney(pricing.installTotal)}</span></div>
        <div className="flex justify-between"><span className="text-neutral-600">Extras</span><span className="font-medium">{fmtMoney(pricing.extrasTotal)}</span></div>
        <div className="border-t pt-2 flex justify-between font-semibold text-base">
          <span>Grand Total</span>
          <span>{fmtMoney(pricing.grand)}</span>
        </div>
      </div>

      <div className="pt-2 flex flex-col gap-3">
        <button disabled={submitting} onClick={markComplete} className="h-12 rounded-full bg-emerald-600 text-white font-medium active:scale-[0.99] transition-transform disabled:opacity-50">{submitting? 'Submitting…':'Mark Job Complete'}</button>
      </div>
    </div>
  )
}
