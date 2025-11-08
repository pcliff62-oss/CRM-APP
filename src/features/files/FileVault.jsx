import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../apiClient.js'

export default function FileVault() {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  async function refresh() {
    setBusy(true)
    try {
      const r = await apiFetch('/api/storage/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix: 'iphone/' })
      })
      const j = await r.json()
      if (j.ok) setItems(j.items)
    } finally { setBusy(false) }
  }

  useEffect(() => { refresh() }, [])

  async function uploadSample() {
    const blob = new Blob([`Hello @ ${new Date().toISOString()}\n`], { type: 'text/plain' })
    const file = new File([blob], 'sample.txt', { type: 'text/plain' })
    const fd = new FormData()
    fd.append('prefix', 'iphone')
    fd.append('file', file)
  const r = await apiFetch('/api/storage/upload', { method: 'POST', body: fd })
    const j = await r.json()
    if (j.ok) { await refresh() } else { alert(j.error || 'Upload failed') }
  }

  async function onUpload(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const fd = new FormData()
    fd.append('prefix', 'iphone')
    fd.append('file', f)
    setBusy(true)
    try {
  const r = await apiFetch('/api/storage/upload', { method: 'POST', body: fd })
      const j = await r.json()
      if (j.ok) refresh()
      else alert(j.error || 'Upload failed')
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }

  async function copyLink(key) {
    const r = await apiFetch('/api/storage/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, expiresInSeconds: 3600 })
    })
    const j = await r.json()
    console.log('[copyLink sign]', j)
    if (j.ok && j.url) {
      try { await navigator.clipboard.writeText(j.url) } catch {}
      alert('Signed link copied')
    } else {
      alert(j.error || 'Sign failed')
    }
  }

  async function openLink(key) {
    try {
      const r = await apiFetch('/api/storage/sign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, expiresInSeconds: 3600 })
      })
      const j = await r.json()
      console.log('[sign]', j)
      if (!j.ok || !j.url) {
        alert(j.error || 'Sign failed'); return
      }

      // 1) Try popup/tab
      const w = window.open(j.url, '_blank', 'noopener,noreferrer')
      if (w && !w.closed) return

      // 2) Try invisible anchor click (works around some popup blockers)
      const a = document.createElement('a')
      a.href = j.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      // 3) As last resort, same-tab navigation
      setTimeout(() => { window.location.assign(j.url) }, 300)
    } catch (e) {
      console.error('[openLink:error]', e)
      alert('Could not open link. See console for details.')
    }
  }

  async function del(key) {
    if (!confirm('Delete this file?')) return
    const r = await apiFetch('/api/storage/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key })
    })
    const j = await r.json()
    if (j.ok) refresh()
    else alert(j.error || 'Delete failed')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input ref={inputRef} type="file" onChange={onUpload} className="block w-full text-sm" />
        <button onClick={uploadSample} className="rounded-xl border border-neutral-300 px-3 py-2 text-sm">Upload sample.txt</button>
        <button onClick={refresh} className="rounded-xl border border-neutral-300 px-3 py-2 text-sm">
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="text-xs text-neutral-500">Prefix: iphone/</div>
      <ul className="space-y-2">
        {items.map(it => (
          <li key={it.key} className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-3">
            <div className="text-sm break-all">{it.key}</div>
            <div className="text-xs text-neutral-500">Size {it.size} • Updated {new Date(it.updated).toLocaleString()}</div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => copyLink(it.key)} className="rounded-xl bg-neutral-900 text-white text-sm px-3 py-1">Copy link</button>
              <button onClick={() => openLink(it.key)} className="rounded-xl border border-neutral-300 text-sm px-3 py-1">Open</button>
              <button onClick={() => del(it.key)} className="rounded-xl border border-neutral-300 text-sm px-3 py-1">Delete</button>
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-neutral-500 py-8 text-center">No files yet.</li>}
      </ul>
    </div>
  )
}
