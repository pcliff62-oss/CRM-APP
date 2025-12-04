import React, { useMemo, useState, useEffect } from 'react'
import { fetchCrews, assignJob, submitJob, upsertAppointment, createSalesPaymentRequest } from '../../lib/api.js'

// Allow parent to open Measure flow
// Props extended: onStartMeasure?: (opts:{ address?: string|null })=>Promise<void> | void

export default function CustomerDetail({ initial, onSave, onCancel, onDelete, appts = [], onOpenDocuments, onOpenPhotos, onStartMeasure, onCreateQuote, role = 'ADMIN', commissionPercentUser }) {
  const seed = useMemo(() => ({
    id: initial?.id,
  name: initial?.name || initial?.customerName || '',
    town: initial?.town || '',
    status: initial?.status || '',
    phone: initial?.phone || '',
    email: initial?.email || '',
    address: initial?.address || '',
    assignedTo: initial?.assignedTo || '',
    notes: initial?.notes || '',
    contractPrice: initial?.contractPrice ?? null,
    documents: initial?.documents || [],
    photos: initial?.photos || [],
  }), [initial])
  const [form] = useState(seed)
  const thisAppts = (appts || []).filter(a => a.customerId === form.id)
  const counts = {
    communications: 0,
    appointments: thisAppts.length,
    photos: Array.isArray(form.photos) ? form.photos.length : 0,
    tasks: 0,
    measurements: 0,
    estimates: 0,
    workflow: 0,
    documents: Array.isArray(form.documents) ? form.documents.length : 0,
    orders: 0,
    messages: 0,
  }
  const [showApptList, setShowApptList] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [showProposal, setShowProposal] = useState(false)
  const jobAppt = useMemo(() => (thisAppts || []).find(a => a.job) || null, [thisAppts])
  const parsedExtras = useMemo(() => {
    // Sales-managed extras: use lead extrasJson if no job extras
    const jobRaw = jobAppt?.extrasJson
    const leadRaw = initial?.extrasJson || '[]'
    const raw = jobRaw && jobRaw !== '[]' ? jobRaw : leadRaw
    try { return Array.isArray(JSON.parse(raw||'[]')) ? JSON.parse(raw||'[]') : [] } catch { return [] }
  }, [jobAppt?.extrasJson, initial?.extrasJson])
  const [extras, setExtras] = useState(() => {
    const arr = parsedExtras.map((x, i) => {
      if (typeof x === 'string') return { id: `ex-${i}`, title: x, price: '' }
      return { id: `ex-${i}`, title: x?.title || '', price: (x?.price ?? '') }
    })
    return arr
  })
  const [showExtras, setShowExtras] = useState(false)
  const extrasSum = useMemo(() => (extras||[]).reduce((sum, it) => sum + (Number(it.price)||0), 0), [extras])
  const totalWithExtras = useMemo(() => {
    const base = Number(form.contractPrice ?? 0) || 0
    return base + (Number.isFinite(extrasSum) ? extrasSum : 0)
  }, [form.contractPrice, extrasSum])
  const approvedWithPrice =
    String(form.status || '').toUpperCase() === 'APPROVED' &&
    (form.contractPrice ?? null) !== null
  const priceLabel = approvedWithPrice ? ` — ${formatUSD(form.contractPrice)}` : ''
  // Build customer payload for proposal app
  const customerPayload = useMemo(()=> ({
    type: 'hytech-proposal-customer',
    customer: {
      name: initial?.name || initial?.customerName || '',
      tel: initial?.phone || '',
      cell: initial?.phone || '',
      email: initial?.email || '',
      street: initial?.address || '',
      city: initial?.town || '',
      state: '',
      zip: '',
      providedOn: new Date().toISOString().slice(0,10)
    }
  }), [initial?.name, initial?.customerName, initial?.phone, initial?.email, initial?.address, initial?.town])
  useEffect(()=>{
    if (!showProposal) return
    const iframe = document.getElementById('proposal-iframe')
    if (!iframe) return
    // Delay postMessage slightly to allow iframe to load
    const t = setTimeout(()=>{
      try { iframe.contentWindow?.postMessage(customerPayload, '*') } catch {}
    }, 800)
    return ()=> clearTimeout(t)
  }, [showProposal, customerPayload])
  return (
    <div className="space-y-4">
  {/* Top bar: title on left; Back on right */}
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold truncate">{form.name || 'Customer'}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-3 rounded-lg border border-neutral-300 bg-white text-sm"
            aria-label="Back"
          >
            Back
          </button>
        </div>
      </div>
  {/* Title moved to top bar */}

      {/* Location map + navigation (shown only if address available) */}
      {form.address ? (
        <div className="rounded-2xl overflow-hidden border border-neutral-200 bg-neutral-100">
          <div className="h-48 w-full relative">
            <iframe
              title="Location map"
              src={`https://www.google.com/maps?q=${encodeURIComponent(form.address)}&output=embed`}
              loading="lazy"
              className="absolute inset-0 w-full h-full border-0"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div className="absolute top-2 left-2 bg-white/80 backdrop-blur px-2 py-1 rounded text-xs font-medium max-w-[80%] truncate">
              {form.address}
            </div>
          </div>
          <div className="p-3 flex gap-2">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(form.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-9 rounded-md bg-emerald-600 text-white text-sm flex items-center justify-center font-medium"
            >Navigate</a>
            <a
              href={`https://maps.apple.com/?daddr=${encodeURIComponent(form.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-9 rounded-md bg-blue-600 text-white text-sm flex items-center justify-center font-medium"
            >Apple Maps</a>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-500">No address available for map.</div>
      )}

      {/* Status banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-2 text-sm font-semibold flex items-center justify-between">
        <div>{(form.status || 'LEAD').toUpperCase()}{priceLabel}</div>
        {/* We could show age like "4 Days Ago" when createdAt is available */}
      </div>

      {/* Extras + Total pricing (non-crew) */}
      {approvedWithPrice && role !== 'CREW' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-emerald-900">Total Job Price</div>
            <div className="font-bold text-emerald-700">{formatUSD(totalWithExtras)}</div>
          </div>
          {(extras && extras.length>0) ? (
            <ul className="mt-2 text-emerald-900/90 space-y-1">
              {extras.map((it)=> (
                <li key={it.id} className="flex items-center justify-between">
                  <span className="truncate pr-2">{it.title || 'Extra'}</span>
                  <span className="tabular-nums">{Number(it.price)? formatUSD(Number(it.price)) : ''}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-emerald-900/80">No extras added.</div>
          )}
          <div className="mt-3 flex justify-end">
            <button type="button" className="h-9 px-3 rounded-md border border-emerald-300 bg-white text-emerald-800" onClick={()=> setShowExtras(true)}>Add extras</button>
          </div>
        </div>
      )}

      {/* Payment info row (placeholder) */}
      <button className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left text-sm flex items-center justify-between">
        <span className="flex items-center gap-2"><span className="text-blue-600">$</span> Payment Information</span>
        <span className="text-neutral-400">›</span>
      </button>

      {/* Action tiles grid */}
      <div className="grid grid-cols-2 gap-3">
  {/* Prioritized actions at top */}
  <Tile label="Measure" count={counts.measurements} icon="📏" onClick={()=> onStartMeasure?.({ address: form.address || null })} />
        <Tile
          label="Create Proposal"
          count={counts.estimates}
          icon="📄"
          onClick={()=> {
            const leadId = initial?.leadId || null
            if (!leadId) {
              alert('No lead available to prefill. Create or select a lead first.')
              return
            }
            setShowProposal(true)
          }}
        />

        {/* Assign job (non-crew) */}
        {role !== 'CREW' && (
          <Tile label="Assign Job" count={0} icon="🧰" onClick={()=> setShowAssign(true)} emphasis />
        )}
        {/* Complete job (non-crew) */}
        {role !== 'CREW' && (
          <Tile
            label="Complete Job"
            count={0}
            icon="✅"
            onClick={()=> { if (approvedWithPrice) setShowComplete(true) }}
            disabled={!approvedWithPrice}
          />
        )}

        {/* Remaining actions */}
        <Tile label="Communications" count={counts.communications} icon="💬" />
        <Tile label="Appointments" count={counts.appointments} icon="🗓️" onClick={()=>setShowApptList(s=>!s)} emphasis />
        <Tile label="Photos and Videos" count={counts.photos} icon="📷" onClick={()=>onOpenPhotos?.(form.photos)} />
        <Tile label="Tasks" count={counts.tasks} icon="📌" disabled />
        <Tile label="Workflow" count={counts.workflow} icon="📈" disabled />
        <Tile label="Documents" count={counts.documents} icon="📁" onClick={()=>onOpenDocuments?.(form.documents)} />
        <Tile label="Orders" count={counts.orders} icon="🛒" disabled />
        <Tile label="Messages" count={counts.messages} icon="💭" disabled />
        <Tile label="Customer Portal" count={0} icon="🧑‍💻" danger disabled />
      </div>

      {/* Optional appointments inline list */}
      {showApptList && (
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="px-4 py-2 border-b text-sm font-medium">Appointments</div>
          <ul className="divide-y">
            {thisAppts.map(a => (
              <li key={a.id} className="px-4 py-3 text-sm">
                <div className="font-medium">{a.title || 'Appointment'}</div>
                <div className="text-xs text-neutral-500">
                  {new Date(a.when).toLocaleString(undefined, { month:'2-digit', day:'2-digit', year:'numeric', hour:'numeric', minute:'2-digit' })}
                  {a.location ? ` • ${a.location}` : ''}
                </div>
              </li>
            ))}
            {thisAppts.length===0 && (
              <li className="px-4 py-3 text-sm text-neutral-600">No appointments</li>
            )}
          </ul>
        </div>
      )}

  {/* Documents/Photos moved to dedicated pages via onOpenDocuments/onOpenPhotos */}

      {/* Details sheet */}
      <div className="rounded-2xl border border-neutral-200 bg-white divide-y">
        <Row label="Status" value={form.status||'—'} />
        <Row label="Phone" value={form.phone? <a className="text-blue-600" href={`tel:${normalizeTel(form.phone)}`}>{form.phone}</a> : '—'} />
        <Row label="Email" value={form.email? <a className="text-blue-600" href={`mailto:${form.email}`}>{form.email}</a> : '—'} />
        <Row label="Address" value={form.address||'—'} />
        <Row label="Town" value={form.town||'—'} />
        <Row label="Assigned To" value={form.assignedTo||'—'} />
        <Row label="Notes" value={form.notes||'—'} />
      </div>

      {/* Contacts */}
      <div className="space-y-2">
        <div className="text-base font-semibold">Contacts</div>
        <div className="rounded-2xl border border-neutral-200 bg-white">
          <div className="px-4 py-3 text-sm flex items-center justify-between">
            <div>
              <div className="text-xs text-neutral-500">Primary Contact</div>
              <div className="font-medium">{form.name || '—'}</div>
            </div>
            <div className="flex items-center gap-3 text-xl">
              {form.email && <a aria-label="Email" className="text-blue-600" href={`mailto:${form.email}`}>✉️</a>}
              {form.phone && <a aria-label="Message" className="text-blue-600" href={`sms:${normalizeTel(form.phone)}`}>💬</a>}
              {form.phone && <a aria-label="Call" className="text-blue-600" href={`tel:${normalizeTel(form.phone)}`}>📞</a>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="px-3 py-2 text-sm rounded-lg border" onClick={onCancel}>Close</button>
      </div>

      {/* Lightweight modals */}
      {showExtras && (
        <Modal title="Add Extras" onClose={()=>{ setShowExtras(false); setExtras(prev=>prev) }}>
          <ExtrasEditor
            items={extras}
            onChange={setExtras}
            onCancel={()=> setShowExtras(false)}
            onSave={async (items)=>{
              try {
                const payload = items.filter(it=> (it.title||'').trim() || (Number(it.price)||0)).map(it=> ({ title: String(it.title||'').trim(), price: Number(it.price)||0 }))
                // Persist to job if crew job exists; else to lead extras endpoint
                if (jobAppt?.id) {
                  const saved = await upsertAppointment({ id: jobAppt.id, extrasJson: JSON.stringify(payload) })
                  const next = (()=>{ try { const arr = JSON.parse(saved?.extrasJson || '[]'); return Array.isArray(arr)? arr.map((x,i)=> ({ id: `ex-${i}`, title: x?.title || '', price: x?.price ?? '' })) : [] } catch { return [] } })()
                  setExtras(next)
                } else if (initial?.leadId) {
                  await fetch(`/api/leads/${encodeURIComponent(initial.leadId)}/extras`, {
                    method:'PATCH',
                    headers:{ 'Content-Type':'application/json' },
                    body: JSON.stringify({ extrasJson: JSON.stringify(payload) })
                  })
                  const next = payload.map((x,i)=> ({ id:`ex-${i}`, title:x.title, price:x.price }))
                  setExtras(next)
                } else {
                  // Fallback: local only
                  setExtras(payload.map((x,i)=> ({ id:`ex-${i}`, title:x.title, price:x.price })))
                }
                setShowExtras(false)
              } catch (e) {
                // Silent per requirement
              }
            }}
          />
        </Modal>
      )}
      {showAssign && (
        <Modal title="Assign Job" onClose={()=>setShowAssign(false)}>
          <AssignJobForm customer={form} onDone={()=>setShowAssign(false)} />
        </Modal>
      )}
      {showComplete && (
        <Modal title="Complete Job" onClose={()=>setShowComplete(false)}>
          <CompleteJobModal
            customer={form}
            extras={extras}
            commissionPercent={normalizePercent(commissionPercentUser) ?? deriveCommissionPercent(initial)}
            onClose={()=>setShowComplete(false)}
            onSubmit={async ()=>{
              // Persist completion (optional enhancement): submit job data similar to legacy CompleteJobForm
              try {
                const appt = (Array.isArray(initial?.appointments)? initial.appointments: [])?.find?.(a=>a.job)
                const id = appt?.id || ''
                const extraItems = extras.map((it,i)=> ({ id:`ex-${i}`, title:it.title, price:Number(it.price)||0 }))
                let submitted
                if (id) {
                  submitted = await submitJob(id, { extras: extraItems, attachments: [] })
                }
                // Fire sales payment request (simplified: always use assignee/user name)
                const commissionPercent = normalizePercent(commissionPercentUser) ?? deriveCommissionPercent(initial)
                const contractPrice = Number(initial?.contractPrice ?? 0) || 0
                const extrasSum = extraItems.reduce((s,x)=> s + (Number(x.price)||0), 0)
                const grandTotal = contractPrice + extrasSum
                const amount = grandTotal * (commissionPercent/100)
                const payload = {
                  // Provide identifiers so backend can link and jobs card can resolve latest SPR
                  leadId: initial?.leadId || undefined,
                  appointmentId: id || undefined,
                  customerName: initial?.name || initial?.customerName || 'Customer',
                  address: initial?.address || '',
                  // Send base contract price explicitly to populate SalesCommissionBox "Contract Price"
                  contractPrice,
                  grandTotal,
                  commissionPercent,
                  amount,
                  extrasJson: JSON.stringify(extraItems)
                }
                await createSalesPaymentRequest(payload).catch(()=>{})
                // Sales fallback: also request pipeline move; server enforces role (SALES/ADMIN/MANAGER only)
                try {
                  const leadId = initial?.leadId || initial?.id || submitted?.customerId || submitted?.contactId
                  if (leadId) {
                    await fetch('/api/leads', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ id: leadId, stage:'COMPLETED' }) })
                  }
                } catch {}
                if (typeof window !== 'undefined') {
                  try { window.alert('Payment request submitted') } catch {}
                }
              } catch {/* silent */}
              setShowComplete(false)
            }}
          />
        </Modal>
      )}
      {showProposal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={()=> setShowProposal(false)}>
          <div className="bg-white w-full max-w-4xl h-[80vh] rounded-xl overflow-hidden shadow-xl flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <div className="font-semibold text-sm">Proposal Builder</div>
              <button onClick={()=> setShowProposal(false)} className="text-neutral-500 text-sm">✕</button>
            </div>
            <iframe
              id="proposal-iframe"
              title="Proposal App"
              src={(() => {
                const leadId = initial?.leadId || ''
                const base = '/proposal-app'
                return leadId ? `${base}/?lead=${encodeURIComponent(leadId)}` : base
              })()}
              className="flex-1 w-full border-0"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="px-4 py-3 text-sm flex items-start gap-3">
      <div className="w-28 text-neutral-500">{label}</div>
      <div className="flex-1">{value}</div>
    </div>
  )
}

function Tile({ label, count, icon, onClick, disabled, emphasis, danger }) {
  const base = `rounded-xl px-3 py-3 text-sm border flex items-center justify-between ${disabled ? 'bg-neutral-50 text-neutral-400 border-neutral-200' : 'bg-white border-neutral-200 active:bg-neutral-50'}`
  const badge = `ml-2 text-[11px] px-1.5 py-0.5 rounded-md ${danger ? 'bg-rose-100 text-rose-700 border border-rose-200' : emphasis ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-neutral-100 text-neutral-600 border border-neutral-200'}`
  return (
    <button className={base} disabled={disabled} onClick={onClick}>
      <span className="flex items-center gap-2 truncate">
        <span className="text-lg">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className={badge}>{count}</span>
    </button>
  )
}

function normalizeTel(raw='') {
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`
  return digits
}

function formatUSD(value) {
  const num = Number(value)
  if (!isFinite(num)) return '$—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num)
}

// Attempt to derive commission percent (User.commissionPercent if available) else fallback to 10%
function deriveCommissionPercent(customerInitial) {
  // If initial includes a user or assignee with commissionPercent use that
  try {
    const percent = customerInitial?.assignee?.commissionPercent ?? customerInitial?.commissionPercent
    if (typeof percent === 'number' && isFinite(percent) && percent > 0) return percent
  } catch {}
  return 10 // default 10%
}

function normalizePercent(v){
  const n = Number(v)
  return (Number.isFinite(n) && n > 0) ? n : null
}

function CompleteJobModal({ customer, extras = [], commissionPercent = 10, onClose, onSubmit }) {
  const approved = String(customer?.status||'').toUpperCase() === 'APPROVED'
  const baseTotal = Number(customer?.contractPrice ?? 0) || 0
  const parsedExtras = extras.map((x)=> ({ title: x.title || '', price: Number(x.price)||0 }))
  const extrasSum = parsedExtras.reduce((sum,it)=> sum + (Number(it.price)||0), 0)
  const grand = baseTotal + extrasSum
  const commissionAmount = grand * (commissionPercent/100)
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
        <div className="flex items-center justify-between">
          <div className="font-medium">Original Approved Job Total</div>
          <div className="font-semibold">{formatUSD(baseTotal)}</div>
        </div>
        {!approved && (
          <div className="mt-2 text-xs text-amber-600">Status not APPROVED – base may be provisional.</div>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Extras Added</div>
        <div className="rounded-lg border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-100 text-neutral-600">
                <th className="text-left px-3 py-2 font-medium">Description</th>
                <th className="text-right px-3 py-2 font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {parsedExtras.length === 0 && (
                <tr><td className="px-3 py-2 text-neutral-500" colSpan={2}>No extras.</td></tr>
              )}
              {parsedExtras.map((line,i)=> (
                <tr key={i} className="odd:bg-white even:bg-neutral-50">
                  <td className="px-3 py-2">{line.title || 'Extra'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.price? formatUSD(line.price): ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50 border-t border-emerald-200">
                <td className="px-3 py-2 font-semibold text-emerald-800">Extras Subtotal</td>
                <td className="px-3 py-2 text-right font-semibold text-emerald-700 tabular-nums">{formatUSD(extrasSum)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex items-center justify-between text-sm">
          <div className="font-semibold text-emerald-900">Grand Total</div>
          <div className="font-bold text-emerald-700">{formatUSD(grand)}</div>
        </div>
      </div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
        <div className="flex items-center justify-between">
          <div className="font-medium">Sales Commission ({commissionPercent}%)</div>
          <div className="font-semibold text-blue-700 tabular-nums">{formatUSD(commissionAmount)}</div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border">Close</button>
  <button type="button" onClick={onSubmit} className="h-9 px-4 rounded-md bg-emerald-600 text-white">Submit</button>
      </div>
    </div>
  )
}

// Local UI state and forms
function Modal({ title, onClose, children }){
  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-xl shadow-xl p-4" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="text-neutral-500">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// (Removed legacy singleton state helpers; using component state instead)

function AssignJobForm({ customer, onDone }){
  const [crews, setCrews] = useState([])
  const [crewId, setCrewId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10))
  const [squares, setSquares] = useState('')
  const [saving, setSaving] = useState(false)
  React.useEffect(()=>{ fetchCrews().then(setCrews).catch(()=>setCrews([])) },[])
  async function save(){
    try {
      setSaving(true)
      const title = `JOB: ${customer.name || 'Customer'}${squares? ` - ${Number(squares)||0} sq`:''}`
      const when = `${date}T00:00:00.000Z`
      await assignJob({ title, when, customerId: customer.id, contactId: customer.id, customerName: customer.name, address: customer.address, workType: 'Job', job:true, crewId })
      onDone?.()
    } finally { setSaving(false) }
  }
  return (
    <div className="space-y-3">
      <label className="block text-sm">Crew
        <select value={crewId} onChange={e=>setCrewId(e.target.value)} className="mt-1 w-full h-9 border rounded-md px-2">
          <option value="">Select crew…</option>
          {crews.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="block text-sm">Start Date
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full h-9 border rounded-md px-2" />
      </label>
      <label className="block text-sm">Squares (optional)
        <input type="number" step="0.01" value={squares} onChange={e=>setSquares(e.target.value)} className="mt-1 w-full h-9 border rounded-md px-2" />
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onDone} className="h-9 px-3 rounded-md border">Cancel</button>
        <button disabled={!crewId||saving} onClick={save} className="h-9 px-3 rounded-md bg-emerald-600 text-white disabled:opacity-50">{saving? 'Saving…':'Assign'}</button>
      </div>
    </div>
  )
}

function CompleteJobForm({ customer, onDone }){
  const [squares, setSquares] = useState('')
  const [extras, setExtras] = useState('') // comma separated quick entry
  const [saving, setSaving] = useState(false)
  async function save(){
    try {
      setSaving(true)
      const appt = (Array.isArray(customer?.appointments)? customer.appointments: [])?.find?.(a=>a.job)
      const id = appt?.id || ''
      const extraItems = extras.split(',').map(s=>s.trim()).filter(Boolean).map((t,i)=>({ id: `extra-${i}`, title:t, qty:1 }))
      await submitJob(id, { squares: Number(squares)||undefined, extras: extraItems, attachments: [] })
      onDone?.()
    } finally { setSaving(false) }
  }
  return (
    <div className="space-y-3">
      <label className="block text-sm">Final Squares
        <input type="number" step="0.01" value={squares} onChange={e=>setSquares(e.target.value)} className="mt-1 w-full h-9 border rounded-md px-2" />
      </label>
      <label className="block text-sm">Extras (comma separated)
        <input type="text" value={extras} onChange={e=>setExtras(e.target.value)} className="mt-1 w-full h-9 border rounded-md px-2" placeholder="Skylight, Chimney flashing" />
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onDone} className="h-9 px-3 rounded-md border">Cancel</button>
        <button onClick={save} className="h-9 px-3 rounded-md bg-emerald-600 text-white disabled:opacity-50">{saving? 'Submitting…':'Submit'}</button>
      </div>
    </div>
  )
}

function ExtrasEditor({ items = [], onChange, onCancel, onSave }) {
  const [local, setLocal] = useState(() => items.map(it => ({ ...it })))
  function update(id, patch) {
    setLocal(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  }
  function addLine() {
    setLocal(prev => [...prev, { id: `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`, title: '', price: '' }])
  }
  function remove(id) {
    setLocal(prev => prev.filter(it => it.id !== id))
  }
  function save() {
    onChange?.(local)
    onSave?.(local)
  }
  return (
    <div className="space-y-4">
      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
        {local.map(line => (
          <div key={line.id} className="flex items-center gap-2">
            <input
              type="text"
              value={line.title}
              onChange={e=> update(line.id, { title: e.target.value })}
              placeholder="Description"
              className="flex-1 h-9 px-2 rounded-md border border-neutral-300 text-sm"
            />
            <input
              type="number"
              step="0.01"
              value={line.price}
              onChange={e=> update(line.id, { price: e.target.value })}
              placeholder="0.00"
              className="w-28 h-9 px-2 rounded-md border border-neutral-300 text-sm text-right"
            />
            <button
              type="button"
              onClick={()=> remove(line.id)}
              className="h-9 px-2 rounded-md border border-neutral-300 bg-white text-xs"
              title="Remove"
            >✕</button>
          </div>
        ))}
        {local.length === 0 && <div className="text-xs text-neutral-500">No extras yet. Add a line below.</div>}
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addLine}
          className="h-9 px-3 rounded-md bg-emerald-600 text-white text-sm"
        >＋ Add Line</button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="h-9 px-3 rounded-md border text-sm">Cancel</button>
          <button type="button" onClick={save} className="h-9 px-4 rounded-md bg-emerald-600 text-white text-sm">Save</button>
        </div>
      </div>
    </div>
  )
}
