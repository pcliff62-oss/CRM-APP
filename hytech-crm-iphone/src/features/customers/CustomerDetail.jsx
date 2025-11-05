import React, { useMemo, useState } from 'react'

export default function CustomerDetail({ initial, onSave, onCancel, onDelete, appts = [] }) {
  const seed = useMemo(() => ({
    id: initial?.id,
    name: initial?.name || '',
    town: initial?.town || '',
    status: initial?.status || '',
    phone: initial?.phone || '',
    email: initial?.email || '',
    address: initial?.address || '',
    assignedTo: initial?.assignedTo || '',
    notes: initial?.notes || '',
  }), [initial])
  const [form] = useState(seed)
  const thisAppts = (appts || []).filter(a => a.customerId === form.id)
  const counts = {
    communications: 0,
    appointments: thisAppts.length,
    photos: 0,
    tasks: 0,
    measurements: 0,
    estimates: 0,
    workflow: 0,
    documents: 0,
    orders: 0,
    messages: 0,
  }
  const [showApptList, setShowApptList] = useState(false)
  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="text-xl font-semibold">{form.name || 'Customer'}</div>

      {/* Status banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-2 text-sm font-semibold flex items-center justify-between">
        <div>{(form.status || 'LEAD').toUpperCase()}</div>
        {/* We could show age like "4 Days Ago" when createdAt is available */}
      </div>

      {/* Payment info row (placeholder) */}
      <button className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left text-sm flex items-center justify-between">
        <span className="flex items-center gap-2"><span className="text-blue-600">$</span> Payment Information</span>
        <span className="text-neutral-400">›</span>
      </button>

      {/* Action tiles grid */}
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Communications" count={counts.communications} icon="💬" />
        <Tile label="Appointments" count={counts.appointments} icon="🗓️" onClick={()=>setShowApptList(s=>!s)} emphasis />
        <Tile label="Photos and Videos" count={counts.photos} icon="📷" disabled />
        <Tile label="Tasks" count={counts.tasks} icon="📌" disabled />
        <Tile label="Measurements" count={counts.measurements} icon="📏" disabled />
        <Tile label="Estimates" count={counts.estimates} icon="📄" disabled />
        <Tile label="Workflow" count={counts.workflow} icon="📈" disabled />
        <Tile label="Documents" count={counts.documents} icon="📁" disabled />
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
