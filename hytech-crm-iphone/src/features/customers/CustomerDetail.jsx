import React, { useMemo, useState } from 'react'

export default function CustomerDetail({ initial, onSave, onCancel, onDelete }) {
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
  return (
    <div className="space-y-4">
      <div className="text-xl font-semibold">{form.name || 'Customer'}</div>
      <div className="rounded-2xl border border-neutral-200 bg-white divide-y">
        <Row label="Status" value={form.status||'—'} />
        <Row label="Phone" value={form.phone? <a className="text-blue-600" href={`tel:${normalizeTel(form.phone)}`}>{form.phone}</a> : '—'} />
        <Row label="Email" value={form.email? <a className="text-blue-600" href={`mailto:${form.email}`}>{form.email}</a> : '—'} />
        <Row label="Address" value={form.address||'—'} />
        <Row label="Town" value={form.town||'—'} />
        <Row label="Assigned To" value={form.assignedTo||'—'} />
        <Row label="Notes" value={form.notes||'—'} />
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

function normalizeTel(raw='') {
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`
  return digits
}
