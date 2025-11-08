import { useState } from 'react'
export default function QuickActions({ onNewTask, onNewCustomer, onClose }) {
  const [text, setText] = useState('')
  const [urgency, setUrgency] = useState('green')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [town, setTown] = useState('')

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">New Task</div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Task description"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-300"
        />
        <select
          value={urgency}
          onChange={e => setUrgency(e.target.value)}
          className="rounded-lg border border-neutral-300 px-2 py-2 text-sm"
        >
          <option value="green">low</option>
          <option value="orange">med</option>
          <option value="red">high</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { if (text.trim()) { onNewTask(text.trim(), urgency); onClose?.() } }}
          className="rounded-xl bg-neutral-900 text-white text-sm px-3 py-2"
        >
          Add task
        </button>
        <button
          onClick={onClose}
          className="rounded-xl border border-neutral-300 text-sm px-3 py-2"
        >
          Cancel
        </button>
      </div>

      <div className="text-xs text-neutral-500 pt-2 border-t border-neutral-200">Or quick add:</div>
      <div className="text-sm font-medium pt-2 border-t border-neutral-200">New Customer</div>
      <div className="grid grid-cols-2 gap-2">
        <input value={first} onChange={e=>setFirst(e.target.value)} placeholder="First" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        <input value={last} onChange={e=>setLast(e.target.value)} placeholder="Last" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <input value={town} onChange={e=>setTown(e.target.value)} placeholder="Town" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
      <button
        onClick={() => { if (first.trim() || last.trim()) { onNewCustomer?.({ first:first.trim(), last:last.trim(), town:town.trim() }); onClose?.() } }}
        className="w-full rounded-xl bg-neutral-900 text-white text-sm px-3 py-2 mt-2"
      >
        Add customer
      </button>
    </div>
  )
}
