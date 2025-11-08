import React, { useState } from 'react'

export default function EventEditor({ defaultDate, onCancel, onSave, saving=false }) {
  const todayISO = (defaultDate || new Date()).toISOString().slice(0,10)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayISO)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [where, setWhere] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)

  function handleSave(){
    if(!title.trim()){ setError('Title is required.'); return }
    setError(null)
    onSave?.({ title, date, start, end, where, notes })
  }

  return (
    <div className="fixed inset-0 z-40 bg-white">
      <div className="sticky top-0 border-b border-neutral-200 bg-white">
        <div className="px-3 py-2 flex items-center justify-between">
          <button onClick={onCancel} className="text-sm px-2 py-1 rounded-lg border hover:bg-neutral-50">Close</button>
          <div className="text-sm font-semibold">New Event</div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={"text-sm px-3 py-1 rounded-lg border " + (saving ? "opacity-50" : "hover:bg-neutral-50")}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="space-y-1">
          <label className="text-xs text-neutral-600">Title</label>
          <input className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px]"
            value={title} onChange={e=>setTitle(e.target.value)} placeholder="What is this?" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-neutral-600">Date</label>
            <input type="date" className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px]"
              value={date} onChange={e=>setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-600">Where</label>
            <input className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px]"
              value={where} onChange={e=>setWhere(e.target.value)} placeholder="Location" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-neutral-600">Start</label>
            <input type="time" className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px]"
              value={start} onChange={e=>setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-600">End</label>
            <input type="time" className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px]"
              value={end} onChange={e=>setEnd(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-neutral-600">Notes</label>
          <textarea rows={4} className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px]"
            value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional details…" />
        </div>
      </div>
    </div>
  )
}