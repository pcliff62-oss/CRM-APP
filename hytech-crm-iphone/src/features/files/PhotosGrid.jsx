import React from 'react'
import { buildFileUrl } from './fileUtil.js'

export default function PhotosGrid({ items = [], onOpen }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((p, idx) => (
        <button
          key={p.id || idx}
          className="relative aspect-square rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 active:opacity-90"
          onClick={() => onOpen?.(p)}
        >
          {p.id || p.url ? (
            <img src={buildFileUrl(p)} alt={p.name || 'Photo'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl">📷</div>
          )}
        </button>
      ))}
      {items.length === 0 && (
        <div className="col-span-3 text-sm text-neutral-600">No photos</div>
      )}
    </div>
  )
}
