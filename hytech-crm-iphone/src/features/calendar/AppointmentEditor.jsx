import React, { useMemo, useState } from 'react'

const typeOptions = [
  { id: 'install', label: 'Install' },
  { id: 'site_visit', label: 'Site visit' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'other', label: 'Other' },
]

export default function AppointmentEditor({ initial, onSave, onCancel, onDelete, assignedName, users = [] }) {
  const seed = useMemo(() => ({
    id: initial?.id,
    title: initial?.title || '',
    type: initial?.type || 'other',
    when: initial?.when ? initial.when.slice(0,16) : new Date(Date.now()+15*60*1000).toISOString().slice(0,16), // yyyy-mm-ddThh:mm
    location: initial?.location || '',
    notes: initial?.notes || '',
    customerId: initial?.customerId || '',
    assignedTo: initial?.assignedTo || '',
  }), [initial])
  const [form, setForm] = useState(seed)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const save = async () => {
    setErr('')
    if (!form.title.trim()) return setErr('Title is required')
    const whenIso = new Date(form.when).toISOString()
    setSaving(true)
    try { await onSave?.({ ...form, when: whenIso }) } catch (e) { setErr(String(e.message||e)) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      {/* Assigned user banner */}
      {(() => {
        // Attempt multiple field names for assigned identity
        const possible = [initial?.assignedTo, initial?.userId, initial?.salesUserId, initial?.crewUserId, form.assignedTo]
        const id = possible.find(v => !!v) || ''
        const userMatch = users.find(u => (u.email || u.id) === id)
        const display = (assignedName || userMatch?.name || id || '').trim()
        if (!display) return null
        return (
          <div className="px-3 py-2 rounded-lg bg-neutral-900 text-white flex items-center justify-between">
            <div className="text-xs font-semibold tracking-wide">Assigned: {display}</div>
            {id && id !== display && <div className="text-[10px] opacity-70">{id}</div>}
          </div>
        )
      })()}
      <Field label="Title">
        <input className="w-full border rounded-lg px-3 py-2" value={form.title} onChange={e=>set('title', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select className="w-full border rounded-lg px-3 py-2" value={form.type} onChange={e=>set('type', e.target.value)}>
            {typeOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="When">
          <input type="datetime-local" className="w-full border rounded-lg px-3 py-2" value={form.when} onChange={e=>set('when', e.target.value)} />
        </Field>
      </div>
      <Field label="Location">
        <input className="w-full border rounded-lg px-3 py-2" value={form.location} onChange={e=>set('location', e.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea rows={4} className="w-full border rounded-lg px-3 py-2" value={form.notes} onChange={e=>set('notes', e.target.value)} />
      </Field>
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="flex gap-2">
        {initial?.id && (
          <button className="px-3 py-2 text-sm rounded-lg border border-red-300 text-red-700" onClick={()=>onDelete?.(initial.id)}>Delete</button>
        )}
        <div className="flex-1" />
        <button className="px-3 py-2 text-sm rounded-lg border" onClick={onCancel}>Cancel</button>
        <button className="px-3 py-2 text-sm rounded-lg bg-neutral-900 text-white disabled:opacity-50" disabled={saving} onClick={save}>{saving? 'Saving…':'Save'}</button>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block text-sm">
      <div className="text-neutral-500 mb-1">{label}</div>
      {children}
    </label>
  )
}
