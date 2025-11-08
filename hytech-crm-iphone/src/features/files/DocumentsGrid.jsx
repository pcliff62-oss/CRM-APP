import React from 'react'

export default function DocumentsGrid({ items = [], onOpen }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {items.map((d, idx) => (
          <button
            key={d.id || idx}
            className="aspect-square rounded-xl border border-neutral-200 bg-white flex flex-col items-center justify-between active:bg-neutral-50 overflow-hidden p-2"
            onClick={() => onOpen?.(d)}
          >
            <div className="flex-1 w-full flex items-center justify-center">
              <div className="text-3xl">📄</div>
            </div>
            <div className="w-full text-center text-neutral-700 text-[11px] leading-4 break-all overflow-hidden text-ellipsis max-w-full min-h-8 max-h-10">
              {d.name || 'Document'}
            </div>
          </button>
        ))}
        {items.length === 0 && (
          <div className="col-span-3 text-sm text-neutral-600">No documents</div>
        )}
      </div>
    </div>
  )
}
