"use client";
import React, { useEffect, useMemo, useState } from 'react'

type Crew = { id: string; name: string; ratePerSquare?: number; members?: { id: string; name: string }[]; docs?: { type: string; path: string; name?: string }[]; source?: 'user'|'crew' }

async function listCrews(): Promise<Crew[]> {
  return fetch('/api/crews')
    .then(r=>r.json())
    .then(d=> (Array.isArray(d?.items)? d.items:[]))
    .then(items => items.filter(Boolean).map((c:any)=>({
      id: String(c?.id||'').trim(),
      name: String(c?.name||'').trim(),
      ratePerSquare: Number(c?.ratePerSquare||0) || 0,
      members: Array.isArray(c?.members) ? c.members.filter(Boolean).map((m:any)=>({ id:String(m?.id||'').trim(), name:String(m?.name||'').trim() })) : []
    })))
}
async function saveCrew(c: Partial<Crew>): Promise<Crew|null> {
  try {
    const r = await fetch('/api/crews', { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(c) })
    const data = await r.json().catch(()=>({})) as any
    if (!r.ok) {
      console.warn('[CrewsManager] POST /api/crews failed', r.status, data)
      return null
    }
    return (data?.item ?? null) as Crew|null
  } catch (e) {
    console.warn('[CrewsManager] POST /api/crews network error', e)
    return null
  }
}
async function removeCrew(id: string): Promise<void> { await fetch(`/api/crews/${encodeURIComponent(id)}`, { method:'DELETE' }) }

export default function CrewsManager() {
  const [items, setItems] = useState<Crew[]>([])
  const [editing, setEditing] = useState<Partial<Crew>|null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [filter, setFilter] = useState('')
  const filtered = useMemo(()=> (items||[])
    .filter((c:any)=> c && String(c.name||'').toLowerCase().includes(filter.toLowerCase()))
  , [items, filter])

  useEffect(()=>{ listCrews().then(setItems).catch(()=>setItems([])) },[])

  async function onSave(){
    if (!editing) return
    let name = (editing.name||'').trim()
    if (!name) name = 'Crew'
    setSaving(true); setError(null)
    const saved = await saveCrew({ id: editing.id, name, ratePerSquare: Number(editing.ratePerSquare||0), members: editing.members })
    if (!saved || !saved.id) {
      console.warn('[CrewsManager] save failed for crew', { payload: { id: editing.id, name, ratePerSquare: editing.ratePerSquare } })
      setSaving(false); setError('Failed to save crew'); return }
    setItems(prev => {
      const safePrev = (prev||[]).filter(Boolean)
      const idx = safePrev.findIndex(x=>x.id===saved.id)
      if (idx>=0){ const copy=safePrev.slice(); copy[idx]=saved; return copy }
      return [saved, ...safePrev]
    })
    setSaving(false)
    setEditing(null)
  }
  async function onDelete(id: string){ await removeCrew(id); setItems(prev=>prev.filter(c=>c.id!==id)) }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search crews" className="h-9 w-52 border rounded-md px-2" />
        <button onClick={()=>setEditing({ id:'', name:'', ratePerSquare:0, members:[] })} className="h-9 px-3 rounded-md bg-emerald-600 text-white">New Crew</button>
      </div>
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Members</th>
              <th className="text-left px-3 py-2">Documents</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
      {filtered.filter(Boolean).map(c => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2">{c.name}</td>
  <td className="px-3 py-2">{(c.members||[]).filter(Boolean).map(m=>m.name).join(', ')}</td>
                <td className="px-3 py-2">
                  <DocsList crew={c} />
                </td>
                <td className="px-3 py-2 text-right">
                  {c.source!=='user' && <>
                    <button className="text-blue-600 mr-3" onClick={()=>setEditing(c)}>Edit</button>
                    <button className="text-rose-600" onClick={()=>onDelete(c.id)}>Delete</button>
                  </>}
                </td>
              </tr>
            ))}
            {filtered.length===0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No crews</td></tr>
            )}
          </tbody>
        </table>
      </div>

  {editing && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4" onClick={()=>setEditing(null)}>
          <div className="bg-white w-full max-w-lg rounded-xl shadow-xl p-4" onClick={e=>e.stopPropagation()}>
            <div className="font-semibold mb-3">{editing.id ? 'Edit Crew' : 'New Crew'}</div>
    {error && <div className="mb-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm">Name
                <input value={editing.name||''} placeholder="Crew name" onChange={e=>setEditing(prev=>({ ...(prev as any), name:e.target.value }))} className="mt-1 w-full h-9 border rounded-md px-2" />
              </label>
              <label className="text-sm">Rate per square
                <input type="number" step="0.01" value={editing.ratePerSquare ?? 0} onChange={e=>setEditing(prev=>({ ...(prev as any), ratePerSquare: Number(e.target.value) }))} className="mt-1 w-full h-9 border rounded-md px-2" />
              </label>
              <div className="sm:col-span-2">
                <label className="text-sm">Members</label>
                <MemberEditor value={editing.members||[]} onChange={(members)=>setEditing(prev=>({ ...(prev as any), members }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
      <button onClick={()=>setEditing(null)} className="h-9 px-3 rounded-md border" disabled={saving}>Cancel</button>
              <button onClick={onSave} className="h-9 px-3 rounded-md bg-emerald-600 text-white disabled:opacity-50" disabled={saving}> {saving ? 'Saving…' : 'Save'} </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MemberEditor({ value, onChange }: { value: { id: string; name: string }[]; onChange: (v: { id: string; name: string }[])=>void }){
  const [name, setName] = useState('')
  function add(){ const id = `M-${Date.now().toString().slice(-6)}`; onChange([...(value||[]), { id, name: name.trim() }]); setName('') }
  function remove(id: string){ onChange((value||[]).filter(m=>m.id!==id)) }
  return (
    <div className="rounded-md border">
      <div className="p-2 flex items-center gap-2">
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Member name" className="h-8 flex-1 border rounded px-2" />
        <button onClick={add} className="h-8 px-2 rounded bg-slate-800 text-white">Add</button>
      </div>
      <ul className="divide-y">
        {(value||[]).map(m => (
          <li key={m.id} className="px-3 py-2 text-sm flex items-center justify-between">
            <span>{m.name}</span>
            <button onClick={()=>remove(m.id)} className="text-rose-600">Remove</button>
          </li>
        ))}
        {(!value || value.length===0) && <li className="px-3 py-2 text-sm text-slate-500">No members</li>}
      </ul>
    </div>
  )
}

function DocsList({ crew }: { crew: Crew }){
  const [docs, setDocs] = useState(crew.docs||[])
  async function upload(type: string, f?: File){
    const file = f || (document.getElementById(`up-${crew.id}-${type}`) as HTMLInputElement | null)?.files?.[0]
    if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('type', type)
    const r = await fetch(`/api/crews/${encodeURIComponent(crew.id)}/docs`, { method:'POST', body: fd })
    const j = await r.json().catch(()=>({})) as any
    if (!r.ok || j?.ok===false) { alert(j?.error||'Upload failed'); return }
    setDocs(prev => [{ type: j.item?.type||type, path: j.item?.path, name: j.item?.name||file.name }, ...prev])
  }
  const types = ['workers_comp','liability','w9','other']
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2 items-center">
        {types.map(t => (
          <label key={t} className="inline-flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-slate-100 border">{t.replace('_','-')}</span>
            <input id={`up-${crew.id}-${t}`} type="file" className="hidden" onChange={e=> e.target.files && upload(t, e.target.files[0])} />
            <button className="px-2 py-1 rounded bg-slate-800 text-white" onClick={()=> (document.getElementById(`up-${crew.id}-${t}`) as HTMLInputElement)?.click()}>Upload</button>
          </label>
        ))}
      </div>
      <ul className="text-xs space-y-1">
        {(docs||[]).map((d,i)=> (
          <li key={i}><a className="text-blue-700 underline" href={d.path} target="_blank" rel="noreferrer">{(d.type||'doc')}: {d.name||d.path}</a></li>
        ))}
        {(!docs || docs.length===0) && <li className="text-slate-500">No documents</li>}
      </ul>
    </div>
  )
}
