import { useState } from 'react'

export default function Collapsible({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm">
      <button
        className="w-full flex items-center justify-between px-3 py-2"
        onClick={() => setOpen(o => !o)}
      >
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-neutral-500">{open ? 'Hide' : 'Show'}</div>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}
