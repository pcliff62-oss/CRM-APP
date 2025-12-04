import React, { useEffect, useState } from 'react'

export default function AppointmentCard({ id, onClose, onSaved, onDeleted, apiBase = '/next-api' }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [item, setItem] = useState(null)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        setLoading(true)
  const res = await fetch(`${apiBase}/api/appointments/${encodeURIComponent(id)}`)
        const data = await res.json()
        if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to load')
        if (!active) return
        setItem(data.item)
        setTitle(data.item?.title || '')
        setNotes(data.item?.notes || '')
      } catch (e) {
        setError(e?.message || 'Failed to load')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [id])

  async function handleSave() {
    try {
      setSaving(true)
      setError('')
      const body = { id, title, notes }
  const res = await fetch(`${apiBase}/api/appointments`, { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(()=>({}))
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Save failed')
      onSaved?.(data.item)
      onClose?.()
    } catch (e) {
      setError(e?.message || 'Save failed')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!confirm('Delete this appointment?')) return
    try {
      setSaving(true)
  const res = await fetch(`${apiBase}/api/appointments/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await res.json().catch(()=>({}))
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Delete failed')
      onDeleted?.(id)
      onClose?.()
    } catch (e) {
      setError(e?.message || 'Delete failed')
    } finally { setSaving(false) }
  }

  const customer = item?.customerName || '—'
  const address = item?.address || '—'
  const when = item?.when ? new Date(item.when) : null
  const whenStr = when ? when.toLocaleString() : '—'
  const leadNotes = item?.leadNotes || ''
  const contact = item?.contact
  const contactId = item?.contact?.id || item?.contactId || item?.customerId || null

  // Derive assigned user (sales/owner) display: prefer matching assignee name, fall back to email/id.
  const assignedEmail = (item?.assignedTo || '').trim()
  // Prefer explicit name fields exposed by mapper; fallback to assignee lookup; do NOT fallback to email for display.
  const assignedDisplay = (item?.userName || item?.assignedName || '') || (
    (assignedEmail && Array.isArray(item?.assignees) ? item.assignees.find(a => (a.email || '').toLowerCase() === assignedEmail.toLowerCase())?.name : '')
  ) || ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-lg rounded-xl shadow-xl border border-neutral-200 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">Appointment</div>
            {assignedDisplay && (
              <div className="text-xs px-2 py-1 rounded-md bg-neutral-100 border border-neutral-200 text-neutral-700" title={assignedDisplay}>
                Assigned to: {assignedDisplay}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded-lg border hover:bg-neutral-50">Close</button>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-neutral-600">Loading…</div>
        ) : error ? (
          <div className="p-4 text-sm text-red-600">{error}</div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-neutral-600">Title</label>
              <input className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px]"
                value={title} onChange={e=>setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="font-medium">Customer</div>
                <div>{customer}</div>
                {contact?.phone && <div className="text-neutral-500 text-xs">{contact.phone}</div>}
                {contact?.email && <div className="text-neutral-500 text-xs">{contact.email}</div>}
              </div>
              <div>
                <div className="font-medium">When</div>
                <div>{whenStr}</div>
              </div>
            </div>

            <div>
              <div className="font-medium text-sm mb-1">Location</div>
              <div className="text-sm">{address}</div>
            </div>

            <div>
              <div className="font-medium text-sm mb-1">Lead notes</div>
              <div className="text-sm whitespace-pre-wrap bg-yellow-50 rounded-md border px-2 py-2 min-h-[44px]">
                {leadNotes || <span className="text-neutral-400">No notes</span>}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-neutral-600">Appointment notes</label>
              <textarea rows={4} className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px]"
                value={notes} onChange={e=>setNotes(e.target.value)} />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button onClick={handleDelete} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50">Delete</button>
              <div className="flex items-center gap-2">
                {contactId && (
                  <a
                    href={`/customers/${encodeURIComponent(contactId)}`}
                    className="text-xs px-3 py-1.5 rounded-lg border hover:bg-neutral-50"
                  >Go to contact</a>
                )}
                <button onClick={handleSave} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg border hover:bg-neutral-50 disabled:opacity-50">{saving? 'Saving…':'Save'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
