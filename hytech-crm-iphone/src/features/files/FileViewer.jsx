import React from 'react'
import { buildFileUrl } from './fileUtil.js'

export default function FileViewer({ file, onBack }) {
  if (!file) return null
  const url = buildFileUrl(file)
  const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name || '')
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white active:bg-neutral-50">← Back</button>
        <div className="font-medium truncate">{file.name || 'File'}</div>
      </div>
      <div className="relative rounded-xl overflow-hidden border border-neutral-200 bg-white">
        {isImage ? (
          <img src={url} alt={file.name} className="w-full h-auto" />
        ) : (
          <iframe src={url} title={file.name} className="w-full h-[70vh]" />
        )}
        <a
          href={`${url}?download=1`}
          className="absolute top-2 right-2 text-xl bg-white/90 rounded-full p-2 border border-neutral-200"
          aria-label="Download"
          target="_blank"
          rel="noreferrer"
        >⬇️</a>
      </div>
    </div>
  )
}
