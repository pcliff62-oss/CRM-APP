import { useEffect, useRef, useState } from 'react'

export default function CustomerFilesInline({ prefix }) {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const pickRef = useRef(null)

  async function list() {
    setBusy(true)
    try {
      const r = await fetch('/api/files?prefix='+encodeURIComponent(prefix))
      const j = await r.json()
      setItems(j.items || [])
    } finally { setBusy(false) }
  }
  useEffect(()=>{ list() }, [prefix])

  async function uploadFile(file) {
    const form = new FormData()
    form.append('file', file)
    form.append('prefix', prefix)
    const r = await fetch('/api/files/upload', { method:'POST', body: form })
    const j = await r.json()
    if (!j.ok) throw new Error(j.error||'upload failed')
    await list()
  }

  async function uploadSample() {
    const blob = new Blob([`Hello @ ${new Date().toISOString()}`], { type:'text/plain' })
    await uploadFile(new File([blob], 'sample.txt', { type:'text/plain' }))
  }

  async function openItem(key) {
    const r = await fetch('/api/files/sign?key='+encodeURIComponent(key))
    const j = await r.json()
    if (!j.ok) return alert(j.error||'sign failed')
    window.open(j.url, '_blank')
  }

  async function removeItem(key) {
    if (!confirm('Delete this file?')) return
    const r = await fetch('/api/files/delete?key='+encodeURIComponent(key), { method:'POST' })
    const j = await r.json()
    if (!j.ok) return alert(j.error||'delete failed')
    await list()
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input ref={pickRef} type="file" className="hidden"
               onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadFile(f).catch(err=>alert(err.message)) }} />
        <button className="rounded-xl border border-neutral-300 text-sm px-3 py-2"
                onClick={()=>pickRef.current?.click()}>Choose File</button>
        <button className="rounded-xl border border-neutral-300 text-sm px-3 py-2"
                onClick={uploadSample}>Upload sample.txt</button>
        <button className="rounded-xl border border-neutral-300 text-sm px-3 py-2"
                onClick={list}>{busy?'Refreshing…':'Refresh'}</button>
      </div>
      <ul className="space-y-2">
        {items.map(it=>(
          <li key={it.key} className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-3">
            <div className="text-sm break-all">{it.key}</div>
            <div className="text-xs text-neutral-500">Size {it.size} • Updated {new Date(it.updated).toLocaleString()}</div>
            <div className="flex gap-2 pt-2">
              <button className="rounded-xl border border-neutral-300 text-sm px-3 py-1" onClick={()=>openItem(it.key)}>Open</button>
              <button className="rounded-xl border border-neutral-300 text-sm px-3 py-1" onClick={()=>removeItem(it.key)}>Delete</button>
            </div>
          </li>
        ))}
        {items.length===0 && <li className="text-sm text-neutral-500 py-6 text-center">No files yet.</li>}
      </ul>
    </div>
  )
}
