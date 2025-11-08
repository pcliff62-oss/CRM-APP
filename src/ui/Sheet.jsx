import { useEffect } from 'react'

export default function Sheet({ open, onClose, children, title = 'Quick Actions' }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl border-t border-neutral-200"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="px-4 pt-3 pb-2 font-medium border-b border-neutral-100">{title}</div>
        <div className="p-3 space-y-2">{children}</div>
      </div>
    </div>
  )
}
