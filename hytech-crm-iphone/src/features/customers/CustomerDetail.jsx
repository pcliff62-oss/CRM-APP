import React, { useMemo, useState } from 'react'
import { fetchCrews, assignJob, submitJob, upsertAppointment } from '../../lib/api.js'

// Allow parent to open Measure flow
// Props extended: onStartMeasure?: (opts:{ address?: string|null })=>Promise<void> | void

export default function CustomerDetail({ initial, onSave, onCancel, onDelete, appts = [], onOpenDocuments, onOpenPhotos, onStartMeasure, role = 'ADMIN' }) {
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
  const jobAppt = useMemo(() => (thisAppts || []).find(a => a.job) || null, [thisAppts])
  const parsedExtras = useMemo(() => {
    try { return Array.isArray(JSON.parse(jobAppt?.extrasJson||'[]')) ? JSON.parse(jobAppt?.extrasJson||'[]') : [] } catch { return [] }
  }, [jobAppt?.extrasJson])
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
  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="text-xl font-semibold">{form.name || 'Customer'}</div>

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
        <Tile label="Create Quote" count={counts.estimates} icon="📄" disabled />

        {/* Assign job */}
        <Tile label="Assign Job" count={0} icon="🧰" onClick={()=>openAssignJob(form)} emphasis />
        {/* Complete job */}
        <Tile label="Complete Job" count={0} icon="✅" onClick={()=>openCompleteJob(form)} />

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
                const id = jobAppt?.id
                if (!id) { alert('No job scheduled yet. Assign the job first.'); return }
                const payload = items.filter(it=> (it.title||'').trim() || (Number(it.price)||0)).map(it=> ({ title: String(it.title||'').trim(), price: Number(it.price)||0 }))
                const saved = await upsertAppointment({ id, extrasJson: JSON.stringify(payload) })
                // Sync from saved
                const next = (()=>{ try { const arr = JSON.parse(saved?.extrasJson || '[]'); return Array.isArray(arr)? arr.map((x,i)=> ({ id: `ex-${i}`, title: x?.title || '', price: x?.price ?? '' })) : [] } catch { return [] } })()
                setExtras(next)
                setShowExtras(false)
              } catch (e) {
                alert(e?.message || String(e))
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
          <CompleteJobForm customer={form} onDone={()=>setShowComplete(false)} />
        </Modal>
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

function useJobUi() {
  const [showAssign, setShowAssign] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  function openAssignJob(){ setShowAssign(true) }
  function openCompleteJob(){ setShowComplete(true) }
  return { showAssign, setShowAssign, showComplete, setShowComplete, openAssignJob, openCompleteJob }
}

// hoist within component file scope
const { openAssignJob, openCompleteJob, showAssign, setShowAssign, showComplete, setShowComplete } = (()=>{
  // simple singleton per module
  const state = { openAssignJob: (c)=>{}, openCompleteJob: (c)=>{}, showAssign:false, setShowAssign:()=>{}, showComplete:false, setShowComplete:()=>{} }
  return state
})()

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
