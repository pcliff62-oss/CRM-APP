import Sheet from '../../ui/Sheet.jsx'
import { useMemo, useState } from 'react'
import { useCustomers, STATUSES } from './useCustomers.js'
import Collapsible from '../../ui/Collapsible.jsx'

export default function CustomerSheet({ openId, onClose }) {
  const { byId, setStatus, addNote, remove } = useCustomers()
  const c = openId ? byId[openId] : null
  const [nextStatus, setNextStatus] = useState(c?.status || 'Lead')
  const [lostReason, setLostReason] = useState(c?.lostReason || '')
  const [note, setNote] = useState('')

  const statusList = useMemo(()=>STATUSES, [])

  if (!c) return <Sheet open={false} />

  function saveStatus() {
    if (nextStatus === 'Lost' && !lostReason.trim()) return
    setStatus(c.id, nextStatus, lostReason.trim() || null)
    onClose?.()
  }

  function addNoteNow() {
    if (!note.trim()) return
    addNote(c.id, note.trim())
    setNote('')
  }

  return (
    <Sheet open={!!c} onClose={onClose} title={`${c.first} ${c.last}`}>
      <div className="space-y-3">
        <div className="text-xs text-neutral-500">Town: {c.town}</div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Status</div>
          <select
            value={nextStatus}
            onChange={e => setNextStatus(e.target.value)}
            className="border border-neutral-300 rounded-lg px-2 py-1 text-sm w-full"
          >
            {statusList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {nextStatus === 'Lost' && (
            <input
              value={lostReason}
              onChange={e=>setLostReason(e.target.value)}
              placeholder="Reason (e.g., went with someone else)"
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full"
            />
          )}
          <div className="flex gap-2">
            <button onClick={saveStatus} className="rounded-xl bg-neutral-900 text-white text-sm px-3 py-2">Save</button>
            <button onClick={onClose} className="rounded-xl border border-neutral-300 text-sm px-3 py-2">Close</button>
            <button onClick={()=>{ remove(c.id); onClose?.() }} className="ml-auto text-rose-600 text-sm">Delete</button>
          </div>
        </div>
        <div className="space-y-3">
          <Collapsible title="Emails" defaultOpen={false}>
            <div className="text-sm text-neutral-600">No emails yet.</div>
          </Collapsible>
          <Collapsible title="Appointments" defaultOpen={false}>
            <div className="text-sm text-neutral-600">No appointments yet.</div>
          </Collapsible>
          <Collapsible title="Tasks" defaultOpen={false}>
            <div className="text-sm text-neutral-600">No tasks yet.</div>
          </Collapsible>
          <Collapsible title="Sales" defaultOpen={false}>
            <div className="text-sm text-neutral-600">No sales yet.</div>
          </Collapsible>
          <Collapsible title="Commissions" defaultOpen={false}>
            <div className="text-sm text-neutral-600">No commissions yet.</div>
          </Collapsible>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Notes</div>
          <div className="flex gap-2">
            <input
              value={note}
              onChange={e=>setNote(e.target.value)}
              placeholder="Add a note…"
              className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={addNoteNow} className="rounded-xl bg-neutral-900 text-white text-sm px-3 py-2">Add</button>
          </div>
          <ul className="space-y-2">
            {c.notes.map(n => (
              <li key={n.id} className="text-sm text-neutral-700">
                <span className="text-xs text-neutral-400 mr-2">{new Date(n.at).toLocaleString()}</span>
                {n.text}
              </li>
            ))}
            {c.notes.length===0 && <li className="text-sm text-neutral-500">No notes yet.</li>}
          </ul>
        </div>
      </div>
    </Sheet>
  )
}
