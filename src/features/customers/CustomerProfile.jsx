import React, { useEffect, useRef, useState } from 'react'
import { Phone, MessageSquare, Mail, MapPin } from 'lucide-react'
import { apiFetch } from '../../apiClient.js'
import Collapsible from '../../ui/Collapsible.jsx'
import TasksList from './TasksList.jsx'

function useList(prefix) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const res = await apiFetch('/api/storage/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix })
        })
        if (!res.ok) throw new Error('List failed: ' + res.status)
        const data = await res.json()
        if (!cancelled) setItems(Array.isArray(data.items) ? data.items : [])
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load list')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [prefix])

  return { items, loading, error }
}

export default function CustomerProfile({ id, onClose, onEdit, onDelete, version, onStatusChanged }) {
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)
  // Documents local state (enhanced UI)
  const [docs, setDocs] = useState([])
  const [docsLoading2, setDocsLoading2] = useState(false)
  const [docsError2, setDocsError2] = useState(null)
  const [docSearch, setDocSearch] = useState('')
  const [docSearchQ, setDocSearchQ] = useState('')
  const [uploads, setUploads] = useState([]) // {id,name,progress,status:'uploading'|'done'|'error', error?}
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  // Inline Notes state (local only)
  const [notes, setNotes] = useState([])
  const [showNewNote, setShowNewNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  // Status actions
  const [showStatusSheet, setShowStatusSheet] = useState(false)
  const [showLostDialog, setShowLostDialog] = useState(false)
  const [lostReason, setLostReason] = useState('')

  useEffect(() => {
    let cancelled = false
    async function fetchCustomer() {
      try {
        setLoading(true)
        setError(null)
        const res = await apiFetch(`/api/customers/${id}`)
        if (!res.ok) throw new Error('Fetch failed: ' + res.status)
  const data = await res.json()
  const payload = (data && typeof data === 'object' && 'item' in data) ? data.item : data
  console.log('[CustomerProfile] fetched', payload)
        if (!cancelled) setItem(payload)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load customer')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (id) fetchCustomer()
    return () => { cancelled = true }
  }, [id, version])

  // Listen for explicit refresh requests from parent (e.g., after edit save)
  useEffect(() => {
    let cancelled = false
    async function refetch() {
      try {
        setLoading(true)
        const res = await apiFetch(`/api/customers/${id}`)
        if (!res.ok) throw new Error('Fetch failed: ' + res.status)
  const data = await res.json()
  const payload = (data && typeof data === 'object' && 'item' in data) ? data.item : data
  console.log('[CustomerProfile] refetched', payload)
        if (!cancelled) setItem(payload)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load customer')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    function onEvt(e) {
      const targetId = e?.detail?.id
      if (!targetId) return
      if (String(targetId) === String(id)) {
        refetch()
      }
    }
    window.addEventListener('customer:refresh', onEvt)
    return () => {
      cancelled = true
      window.removeEventListener('customer:refresh', onEvt)
    }
  }, [id])

  // Load notes from localStorage on profile load
  useEffect(() => {
    try {
      const key = `customerNotes-${id}`
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const sorted = parsed
            .filter(n => n && typeof n === 'object' && 'createdAt' in n)
            .sort((a,b)=> Number(b.createdAt||0) - Number(a.createdAt||0))
          setNotes(sorted)
        } else {
          setNotes([])
        }
      } else {
        setNotes([])
      }
    } catch {
      setNotes([])
    }
  }, [id])

  // Persist notes when changed
  useEffect(() => {
    try {
      const key = `customerNotes-${id}`
      localStorage.setItem(key, JSON.stringify(notes))
    } catch {}
  }, [id, notes])

  const { items: photoItems, loading: photosLoading, error: photosError } = useList(`customers/${id}/photos/`)
  const { items: docItems, loading: docsLoading, error: docsError } = useList(`customers/${id}/docs/`)

  // Helpers and behaviors for Documents
  function fmtDate(d) {
    if (!d) return ''
    const x = new Date(d)
    if (isNaN(x.getTime())) return ''
    return x.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  function fmtSize(n) {
    const b = Number(n || 0)
    if (b < 1024) return `${b} B`
    if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`
    return `${(b/1024/1024).toFixed(1)} MB`
  }
  function ext(name){
    const m = String(name||'').toLowerCase().match(/\.([a-z0-9]+)$/)
    return m ? m[1] : ''
  }
  function typeBadge(name){
    const e = ext(name)
    if (e==='pdf') return 'PDF'
    if (e==='doc' || e==='docx') return 'DOC'
    if (e==='xls' || e==='xlsx') return 'XLS'
    if (['png','jpg','jpeg','heic','gif','webp'].includes(e)) return 'IMG'
    if (e==='txt') return 'TXT'
    return (e || 'FILE').toUpperCase().slice(0,4)
  }

  async function refreshDocs(){
    setDocsLoading2(true); setDocsError2(null)
    try {
      const prefix = `customers/${id}/docs/`
      const res = await apiFetch('/api/storage/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const items = Array.isArray(json?.items) ? json.items : []
      items.sort((a,b)=>{
        const au = a.updated || a.timeCreated || ''
        const bu = b.updated || b.timeCreated || ''
        if (au && bu) return au < bu ? 1 : -1
        return String(a.key || a.name || '').localeCompare(String(b.key || b.name || ''))
      })
      setDocs(items)
    } catch(e){
      setDocsError2(String(e?.message||e)||'Failed to load')
    } finally {
      setDocsLoading2(false)
    }
  }

  useEffect(()=>{ refreshDocs() }, [id])
  useEffect(()=>{
    const t = setTimeout(()=> setDocSearchQ(docSearch.trim().toLowerCase()), 200)
    return ()=> clearTimeout(t)
  }, [docSearch])

  async function openDoc(key){
    try{
      const res = await apiFetch('/api/storage/sign', {
        method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { url } = await res.json()
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    }catch(e){ console.error('open failed', e) }
  }
  async function deleteDoc(key){
    const ok = window.confirm('Delete this document?')
    if (!ok) return
    try{
      const res = await apiFetch('/api/storage/delete', {
        method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await refreshDocs()
    }catch(e){ console.error('delete failed', e) }
  }

  function addUpload(name){
    const entry = { id: name + '-' + Date.now(), name, progress: 0, status: 'uploading' }
    setUploads(u => [entry, ...u])
    return entry.id
  }
  function updateUpload(id, patch){ setUploads(u => u.map(x => x.id===id ? { ...x, ...patch } : x)) }
  function removeUpload(id){ setUploads(u => u.filter(x => x.id !== id)) }

  async function uploadOne(file){
    const idd = addUpload(file.name)
    // simulate smooth progress to 90%
    let p = 0
    const timer = setInterval(()=>{
      p = Math.min(p + 5, 90)
      updateUpload(idd, { progress: p })
      if (p>=90) clearInterval(timer)
    }, 120)
    try{
      const fd = new FormData()
      fd.append('prefix', `customers/${id}/docs/`)
      fd.append('file', file)
      const res = await apiFetch('/api/storage/upload', { method:'POST', body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      clearInterval(timer)
      updateUpload(idd, { progress: 100, status: 'done' })
      refreshDocs()
      setTimeout(()=> removeUpload(idd), 1500)
    }catch(e){
      clearInterval(0)
      updateUpload(idd, { status: 'error', error: String(e?.message||e) })
    }
  }
  async function handleFiles(list){
    const arr = Array.from(list || [])
    for (const f of arr) uploadOne(f)
  }

  // ================= Photos enhancements =================
  const [photos, setPhotos] = useState([])
  const [photosLoading2, setPhotosLoading2] = useState(false)
  const [photosError2, setPhotosError2] = useState(null)
  const [photoSearch, setPhotoSearch] = useState('')
  const [photoSearchQ, setPhotoSearchQ] = useState('')
  const [photoUploads, setPhotoUploads] = useState([]) // {id,name,progress,status}
  const [photoDragOver, setPhotoDragOver] = useState(false)
  const photoInputRef = useRef(null)

  async function refreshPhotos(){
    setPhotosLoading2(true); setPhotosError2(null)
    try {
      const prefix = `customers/${id}/photos/`
      const res = await apiFetch('/api/storage/list', {
        method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prefix })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const items = Array.isArray(json?.items) ? json.items : []
      items.sort((a,b)=>{
        const au = a.updated || a.timeCreated || ''
        const bu = b.updated || b.timeCreated || ''
        if (au && bu) return au < bu ? 1 : -1
        const an = String(a.key || a.name || '')
        const bn = String(b.key || b.name || '')
        return bn.localeCompare(an)
      })
      setPhotos(items)
    } catch(e){
      setPhotosError2(String(e?.message||e)||'Failed to load')
    } finally { setPhotosLoading2(false) }
  }
  useEffect(()=>{ refreshPhotos() }, [id])
  useEffect(()=>{ const t=setTimeout(()=> setPhotoSearchQ(photoSearch.trim().toLowerCase()), 200); return ()=>clearTimeout(t) }, [photoSearch])

  async function openPhoto(key){
    try {
      const res = await apiFetch('/api/storage/sign', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key }) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { url } = await res.json()
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch(e){ console.error('open photo failed', e) }
  }
  async function deletePhoto(key){
    const ok = window.confirm('Delete this photo?')
    if (!ok) return
    try {
      const res = await apiFetch('/api/storage/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key }) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await refreshPhotos()
    } catch(e){ console.error('delete photo failed', e) }
  }

  function addPhotoUpload(name){ const entry={ id:name+'-'+Date.now(), name, progress:0, status:'uploading' }; setPhotoUploads(u=>[entry,...u]); return entry.id }
  function updatePhotoUpload(id, patch){ setPhotoUploads(u=>u.map(x=> x.id===id ? { ...x, ...patch } : x)) }
  function removePhotoUpload(id){ setPhotoUploads(u=>u.filter(x=> x.id!==id)) }
  async function uploadPhotoOne(file){
    const idd = addPhotoUpload(file.name)
    let p=0
    const timer=setInterval(()=>{ p=Math.min(p+6, 90); updatePhotoUpload(idd,{progress:p}); if(p>=90) clearInterval(timer) }, 120)
    try{
      const fd=new FormData(); fd.append('prefix', `customers/${id}/photos/`); fd.append('file', file)
      const res = await apiFetch('/api/storage/upload', { method:'POST', body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      clearInterval(timer)
      updatePhotoUpload(idd, { progress: 100, status:'done' })
      refreshPhotos()
      setTimeout(()=> removePhotoUpload(idd), 1500)
    }catch(e){
      clearInterval(0)
      updatePhotoUpload(idd, { status:'error', error: String(e?.message||e) })
    }
  }
  async function handlePhotoFiles(list){ const arr=Array.from(list||[]); for(const f of arr) uploadPhotoOne(f) }

  if (loading) return <div className="px-4 py-3 text-sm">Loading…</div>
  if (error) return <div className="px-4 py-3 text-sm text-red-600">Error: {String(error)}</div>
  if (!item) return null

  // Derived fields for normalized display
  const street = (item.address || '').trim()
  const town = (item.town || item.city || '').trim()
  const statusLabel = (item.status || '').trim()
  const tel = (item.phone || '').replace(/\s+/g, '')
  const telHref = tel ? `tel:${tel}` : '#'
  const email = (item.email || '').trim()
  const mailHref = email ? `mailto:${email}` : '#'
  const mapQ = encodeURIComponent([street, town].filter(Boolean).join(', '))
  const mapHref = mapQ ? `https://maps.apple.com/?q=${mapQ}` : '#'

  async function handleDeleteClick() {
    if (deleting) return
    const ok = window.confirm('This will permanently remove the customer and their files. Continue?')
    if (!ok) return
    try {
      setDeleting(true)
      await onDelete?.(id)
    } catch (_) {
      // parent surfaces errors
    } finally {
      setDeleting(false)
    }
  }

  function handleCall(e) {
    try { if (!tel) return; window.location.href = telHref } catch {}
  }
  function handleText(e) {
    try { if (!tel) return; window.location.href = `sms:${tel}` } catch {}
  }
  function handleEmail(e) {
    try { if (!email) return; window.location.href = mailHref } catch {}
  }
  function handleMap(e) {
    try {
      if (!mapQ) return
      if (mapHref && typeof window !== 'undefined') {
        window.open(mapHref, '_blank', 'noopener,noreferrer')
      }
    } catch {}
  }

  return (
    <div className="space-y-3">
      {/* Top summary */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Left: Name */}
          <div className="min-w-0">
            <h2 className="text-xl font-semibold break-words">{item.name || 'Customer'}</h2>
          </div>
          {/* Right: Status badge only */}
          <div className="flex items-center gap-2 shrink-0">
            {statusLabel ? (
              <button
                type="button"
                onClick={()=> setShowStatusSheet(true)}
                className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-neutral-100 text-neutral-800 px-2 py-1 text-[16px]"
                aria-label="Change status"
                title="Change status"
              >
                {statusLabel}
              </button>
            ) : null}
          </div>
        </div>

        {/* Summary: Address·Town, Phone, Email */}
        <div className="mt-2 space-y-1.5">
          <div className="text-[15px] text-neutral-700">
            {street || '—'}
            {(street && town) ? <span className="mx-1">·</span> : null}
            {town || (!street ? '—' : '')}
          </div>
          <a
            href={tel ? `tel:${tel}` : undefined}
            onClick={(e)=>{ if(!tel) e.preventDefault() }}
            className="block text-[15px] text-neutral-800 no-underline"
            style={{ textDecoration: 'none' }}
          >
            {tel || '—'}
          </a>
          <a
            href={email ? `mailto:${email}` : undefined}
            onClick={(e)=>{ if(!email) e.preventDefault() }}
            className="block text-[15px] text-neutral-800 no-underline"
            style={{ textDecoration: 'none' }}
          >
            {email || '—'}
          </a>
        </div>
      </div>

      {/* Status action sheet */}
      {showStatusSheet && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={()=>setShowStatusSheet(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-2xl border border-neutral-200 shadow-lg p-3">
              <div className="text-base font-medium mb-2">Status</div>
              <div className="space-y-2">
                <button
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-[16px] text-neutral-900"
                  onClick={async ()=>{
                    setShowStatusSheet(false)
                    const PIPE = ['Lead','Prospect','Approved','Scheduled','Complete','Invoiced','Archived']
                    const cur = statusLabel || 'Lead'
                    const idx = PIPE.findIndex(s => s.toLowerCase() === cur.toLowerCase())
                    const next = idx < 0 ? 'Prospect' : (idx >= PIPE.length-2 ? 'Archived' : PIPE[idx+1])
                    const ok = window.confirm(`Advance status from ${cur || 'Lead'} to ${next}?`)
                    if (!ok) return
                    try {
                      const res = await apiFetch('/api/customers', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, status: next })
                      })
                      if (!res.ok) throw new Error(`HTTP ${res.status}`)
                      try { window.dispatchEvent(new Event('customers:refresh')) } catch {}
                      try { window.dispatchEvent(new CustomEvent('customer:refresh', { detail: { id } })) } catch {}
                      try { onStatusChanged?.() } catch {}
                    } catch(e){ console.error('advance status failed', e) }
                  }}
                >
                  Advance status
                </button>
                <button
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-[16px] text-neutral-900"
                  onClick={()=>{ setShowStatusSheet(false); setShowLostDialog(true) }}
                >
                  Mark as Lost
                </button>
                <button
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-[16px] text-neutral-700"
                  onClick={()=> setShowStatusSheet(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Lost dialog */}
      {showLostDialog && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={()=>setShowLostDialog(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-2xl border border-neutral-200 shadow-lg p-3">
              <div className="text-base font-medium">Mark as Lost</div>
              <div className="mt-2">
                <textarea
                  value={lostReason}
                  onChange={(e)=> setLostReason(e.target.value)}
                  placeholder="Reason (optional)"
                  rows={3}
                  className="w-full rounded-lg border border-neutral-300 bg-white p-3 text-[16px] shadow-sm focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button className="px-3 py-2 rounded-md border text-[16px]" onClick={()=> setShowLostDialog(false)}>Cancel</button>
                <button
                  className="px-3 py-2 rounded-md border text-[16px] text-neutral-900"
                  onClick={async ()=>{
                    try {
                      const line = `[${new Date().toISOString()}] Status changed to Lost${lostReason.trim()?`: ${lostReason.trim()}`:''}`
                      const notesPatch = (item?.notes ? String(item.notes) + '\n' : '') + line
                      const res = await apiFetch('/api/customers', {
                        method: 'POST', headers:{ 'Content-Type':'application/json' },
                        body: JSON.stringify({ id, status: 'Lost', notes: notesPatch })
                      })
                      if (!res.ok) throw new Error(`HTTP ${res.status}`)
                      setShowLostDialog(false)
                      setLostReason('')
                      try { window.dispatchEvent(new Event('customers:refresh')) } catch {}
                      try { window.dispatchEvent(new CustomEvent('customer:refresh', { detail: { id } })) } catch {}
                      try { onStatusChanged?.() } catch {}
                    } catch(e){ console.error('mark lost failed', e) }
                  }}
                >
                  Mark Lost
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Communications */}
      <Collapsible title="Communications" defaultOpen={false}>
        <div className="text-sm text-neutral-600">
          Coming soon: Calls, texts, and emails (incoming and outgoing) will appear here.
        </div>
      </Collapsible>

      {/* Roofer Info */}
      <Collapsible title="Roofer Info" defaultOpen={false}>
        <div className="text-sm space-y-1">
          {item.roofer ? (
            <>
              {'squares' in item.roofer && <div>Squares: {item.roofer.squares}</div>}
              {'eaves' in item.roofer && <div>Eaves: {item.roofer.eaves}</div>}
              {'rakes' in item.roofer && <div>Rakes: {item.roofer.rakes}</div>}
              {'valleys' in item.roofer && <div>Valleys: {item.roofer.valleys}</div>}
              {'report' in item.roofer && item.roofer.report && (
                <div>
                  Report: <a className="text-indigo-600 underline" href={item.roofer.report} target="_blank" rel="noreferrer">Open</a>
                </div>
              )}
            </>
          ) : (
            <div className="text-neutral-500">No roofer info available.</div>
          )}
        </div>
      </Collapsible>

      {/* Photos */}
      <Collapsible title="Photos" defaultOpen={false}>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2">
          <input
            value={photoSearch}
            onChange={(e)=> setPhotoSearch(e.target.value)}
            placeholder="Search photos…"
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[16px] shadow-sm focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={()=> photoInputRef.current?.click()}
            className="px-3 py-2 rounded-md border border-neutral-300 text-neutral-800"
          >
            Add Photos
          </button>
        </div>

        {/* Hidden picker */}
        <input
          ref={photoInputRef}
          type="file"
          multiple
          accept="image/*,.heic,.HEIC"
          className="hidden"
          onChange={(e)=>{ const files=e.target.files; if(files?.length) handlePhotoFiles(files); e.target.value='' }}
        />

        {/* Drop zone */}
        <div
          onDragOver={(e)=>{ e.preventDefault(); setPhotoDragOver(true) }}
          onDragLeave={()=> setPhotoDragOver(false)}
          onDrop={(e)=>{ e.preventDefault(); setPhotoDragOver(false); const f=e.dataTransfer?.files; if(f?.length) handlePhotoFiles(f) }}
          onClick={()=> photoInputRef.current?.click()}
          className={
            'mt-2 rounded-xl border-2 border-dashed px-3 py-6 text-center cursor-pointer transition ' +
            (photoDragOver ? 'bg-neutral-50 border-neutral-400' : 'border-neutral-200 hover:bg-neutral-50')
          }
        >
          <div className="text-sm text-neutral-600">Drag & drop images here, or tap to choose</div>
        </div>

        {/* Upload queue */}
        {photoUploads.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-neutral-500 mb-1">Uploads</div>
            <ul className="space-y-2">
              {photoUploads.map(u => (
                <li key={u.id} className="rounded-xl border border-neutral-200 bg-white p-2 shadow-sm">
                  <div className="flex items-center justify-between text-sm">
                    <div className="truncate">{u.name}</div>
                    <div className="text-xs text-neutral-500">{u.status === 'uploading' ? 'Uploading…' : (u.status === 'done' ? 'Done' : 'Failed')}</div>
                  </div>
                  <div className="mt-1 h-1.5 bg-neutral-200 rounded overflow-hidden">
                    <div className="h-full bg-neutral-800 transition-all" style={{ width: `${u.progress|| (u.status==='done'?100:0)}%` }} />
                  </div>
                  {u.status === 'error' && (
                    <div className="mt-1 flex items-center justify-between text-xs text-red-600">
                      <span>{u.error || 'Upload failed'}</span>
                      <button type="button" className="underline" onClick={()=>{
                        const name=u.name
                        // can't directly retry without file handle; reopen picker for user to select again
                        // keep the failed row visible
                        photoInputRef.current?.click()
                      }}>Retry</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Photos grid */}
        <div className="mt-3">
          {(photosLoading2 || photosLoading) && <div className="text-sm text-neutral-600">Loading…</div>}
          {(photosError2 || photosError) && (
            <div className="text-sm text-red-600 flex items-center gap-2">
              Couldn’t load photos.
              <button type="button" className="px-2 py-1 rounded-md border text-[12px]" onClick={refreshPhotos}>Retry</button>
            </div>
          )}
          {!photosLoading2 && !photosError2 && (
            (()=>{
              const list = (photos && photos.length ? photos : photoItems || [])
              const filtered = photoSearchQ ? list.filter(ph => String(ph.key || ph.name || '').toLowerCase().includes(photoSearchQ)) : list
              const sorted = filtered.slice().sort((a,b)=>{
                const au = a.updated || a.timeCreated || ''
                const bu = b.updated || b.timeCreated || ''
                if (au && bu) return au < bu ? 1 : -1
                const an = String(a.key || a.name || '')
                const bn = String(b.key || b.name || '')
                return bn.localeCompare(an)
              })
              if (sorted.length === 0) {
                return (
                  <div className="text-sm text-neutral-500 text-center py-6">
                    <div>No photos yet.</div>
                    <div className="text-xs text-neutral-400 mt-1">Tap Add or drop images above.</div>
                  </div>
                )
              }
              return (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {sorted.map((ph, idx) => {
                    const key = ph.key || ph.name || `photo-${idx}`
                    const name = String(ph.name || key).split('/').pop()
                    const thumb = ph.url || ph.mediaLink || ph.signedUrl || undefined // may be signed; if not, click to sign/open
                    return (
                      <div key={key} className="group">
                        <button
                          type="button"
                          onClick={()=> openPhoto(key)}
                          className="block w-24 h-24 sm:w-28 sm:h-28 rounded-md overflow-hidden border border-neutral-200 bg-neutral-100"
                          title={name}
                        >
                          {thumb ? (
                            <img src={thumb} alt={name||'photo'} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs">Open</div>
                          )}
                        </button>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <div className="text-[11px] text-neutral-700 truncate max-w-[6.5rem] sm:max-w-[8rem]" title={name}>{name}</div>
                          <button
                            type="button"
                            onClick={()=> deletePhoto(key)}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-neutral-300 text-neutral-700"
                            aria-label="Delete"
                            title="Delete"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v7M14 11v7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()
          )}
        </div>
      </Collapsible>

      {/* Documents */}
      <Collapsible title="Documents" defaultOpen={false}>
        {/* Toolbar: search (left), add button + hint (right) */}
        <div className="flex items-center justify-between gap-2">
          <input
            value={docSearch}
            onChange={(e)=> setDocSearch(e.target.value)}
            placeholder="Search documents…"
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[16px] shadow-sm focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={()=> fileInputRef.current?.click()}
              className="px-3 py-2 rounded-md border border-neutral-300 text-neutral-800"
            >
              Add Document
            </button>
            <div className="text-[12px] text-neutral-500 hidden sm:block">PDF, Word, Excel, images</div>
          </div>
        </div>

        {/* Hidden file input for picker */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.heic,.txt"
          className="hidden"
          onChange={(e)=>{ const files=e.target.files; if(files?.length) handleFiles(files); e.target.value='' }}
        />

        {/* Drag and drop zone */}
        <div
          onDragOver={(e)=>{ e.preventDefault(); setDragOver(true) }}
          onDragLeave={()=> setDragOver(false)}
          onDrop={(e)=>{ e.preventDefault(); setDragOver(false); const f=e.dataTransfer?.files; if(f?.length) handleFiles(f) }}
          onClick={()=> fileInputRef.current?.click()}
          className={
            'mt-2 rounded-xl border-2 border-dashed px-3 py-6 text-center cursor-pointer transition ' +
            (dragOver ? 'bg-neutral-50 border-neutral-400' : 'border-neutral-200 hover:bg-neutral-50')
          }
        >
          <div className="text-sm text-neutral-600">Drag & drop files here, or tap to choose</div>
        </div>

        {/* Uploads queue */}
        {uploads.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-neutral-500 mb-1">Uploads</div>
            <ul className="space-y-2">
              {uploads.map(u => (
                <li key={u.id} className="rounded-xl border border-neutral-200 bg-white p-2 shadow-sm">
                  <div className="flex items-center justify-between text-sm">
                    <div className="truncate">{u.name}</div>
                    <div className="text-xs text-neutral-500">{u.status === 'uploading' ? 'Uploading…' : (u.status === 'done' ? 'Done' : 'Failed')}</div>
                  </div>
                  <div className="mt-1 h-1.5 bg-neutral-200 rounded overflow-hidden">
                    <div className="h-full bg-neutral-800 transition-all" style={{ width: `${u.progress|| (u.status==='done'?100:0)}%` }} />
                  </div>
                  {u.status === 'error' && (
                    <div className="mt-1 flex items-center justify-between text-xs text-red-600">
                      <span>{u.error || 'Upload failed'}</span>
                      <button type="button" className="underline" onClick={()=>{
                        const name = u.name
                        removeUpload(u.id)
                        // re-open picker for retry intent (no direct file reference retained)
                        fileInputRef.current?.click()
                      }}>Retry</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Documents list */}
        <div className="mt-3">
          {(docsLoading2 || docsLoading) && <div className="text-sm text-neutral-600">Loading…</div>}
          {(docsError2 || docsError) && (
            <div className="text-sm text-red-600 flex items-center gap-2">
              Couldn’t load documents.
              <button type="button" className="px-2 py-1 rounded-md border text-[12px]" onClick={refreshDocs}>Retry</button>
            </div>
          )}
          {!docsLoading2 && !docsError2 && (
            (()=>{
              const list = (docs && docs.length ? docs : docItems || [])
              const filtered = docSearchQ
                ? list.filter(d => String(d.key || d.name || '').toLowerCase().includes(docSearchQ))
                : list
              const sorted = filtered.slice().sort((a,b)=>{
                const au = a.updated || a.timeCreated || ''
                const bu = b.updated || b.timeCreated || ''
                if (au && bu) return au < bu ? 1 : -1
                return String(a.key || a.name || '').localeCompare(String(b.key || b.name || ''))
              })
              if (sorted.length === 0) {
                return (
                  <div className="text-sm text-neutral-500 text-center py-6">
                    <div>No documents yet.</div>
                    <div className="text-xs text-neutral-400 mt-1">Tap Add or drop files above.</div>
                  </div>
                )
              }
              return (
                <ul className="divide-y divide-neutral-200">
                  {sorted.map((d, idx) => {
                    const key = d.key || d.name || `doc-${idx}`
                    const name = String(d.name || key).split('/').pop()
                    const badge = typeBadge(name)
                    const size = d.size
                    const updated = d.updated || d.timeCreated
                    return (
                      <li key={key} className="py-2 flex items-center gap-3 min-h-[48px]">
                        {/* type badge */}
                        <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center text-[11px] text-neutral-700">
                          {badge}
                        </div>
                        {/* middle */}
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-[14px] text-neutral-900">{name}</div>
                          <div className="text-[11px] text-neutral-500 truncate">
                            {size != null ? fmtSize(size) : ''}{updated ? (size!=null ? ' • ' : '') + fmtDate(updated) : ''}
                          </div>
                        </div>
                        {/* actions */}
                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={()=> openDoc(key)}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-neutral-300 text-neutral-700"
                            aria-label="Open"
                            title="Open"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7M21 3l-7 7" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 14v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h4" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={()=> deleteDoc(key)}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-neutral-300 text-neutral-700"
                            aria-label="Delete"
                            title="Delete"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v7M14 11v7" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )
            })()
          )}
        </div>
      </Collapsible>

      {/* Notes */}
      <Collapsible title="Notes" defaultOpen={false}>
        {/* Header right: add note button (inside section body due to Collapsible API) */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={(e)=>{ e.stopPropagation?.(); setShowNewNote(v=>!v) }}
            className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
            aria-label="Add note"
            title="Add note"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* New note editor */}
        {showNewNote && (
          <div className="mt-2">
            <textarea
              value={noteText}
              onChange={(e)=>setNoteText(e.target.value)}
              onKeyDown={(e)=>{
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  const text = noteText.trim()
                  if (!text) return
                  const next = [{ text, createdAt: Date.now() }, ...notes]
                  setNotes(next.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)))
                  setNoteText('')
                  setShowNewNote(false)
                }
              }}
              placeholder="Write a note…"
              className="w-full rounded-lg border border-neutral-300 bg-white p-3 text-[16px] shadow-sm focus:ring-1 focus:ring-blue-500"
              rows={3}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={()=>{
                  const text = noteText.trim()
                  if (!text) return
                  const next = [{ text, createdAt: Date.now() }, ...notes]
                  setNotes(next.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)))
                  setNoteText('')
                  setShowNewNote(false)
                }}
                className="px-3 py-2 rounded-md border border-neutral-300 text-neutral-800"
              >
                Save
              </button>
              <button
                type="button"
                onClick={()=>{ setShowNewNote(false); setNoteText('') }}
                className="px-3 py-2 rounded-md border border-neutral-200 text-neutral-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Notes list */}
        <div className="mt-3">
          {Array.isArray(notes) && notes.length > 0 ? (
            <ul>
              {notes
                .slice()
                .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))
                .map((n, idx) => (
                  <li key={n.createdAt || idx} className="bg-white rounded-lg border border-neutral-200 p-2 shadow-sm mb-2">
                    <div className="text-xs text-neutral-500">
                      {new Date(Number(n.createdAt||Date.now())).toLocaleString(undefined, { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' })}
                    </div>
                    {n.text && (
                      <div className="mt-1 text-[15px] whitespace-pre-wrap break-words">{n.text}</div>
                    )}
                  </li>
                ))}
            </ul>
          ) : (
            <div className="text-sm text-neutral-500">No notes yet.</div>
          )}
        </div>
      </Collapsible>

      {/* Tasks */}
      <Collapsible title="Tasks" defaultOpen={false}>
        <div className="p-3">
          <TasksList customerId={id} />
        </div>
      </Collapsible>

      {/* Footer actions: Edit + Delete at absolute bottom */}
      <div className="mt-6 pb-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="px-3 py-2 rounded-md border text-neutral-700"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleDeleteClick}
          disabled={deleting}
          className="px-3 py-2 rounded-md border text-red-600 disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
