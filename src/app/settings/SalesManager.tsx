"use client";
import React, { useEffect, useMemo, useState } from 'react'

type Rep = { id: string; name: string; commissionPercent?: number|null; basePayAmount?: number|null; basePayPeriod?: 'JOB'|'WEEK'|'MONTH'|null; docs?: { type: string; path: string; name?: string }[]; source?: 'user' }

function DocsList({ rep }: { rep: Rep }){
  const [docs, setDocs] = useState(rep.docs||[])
  async function upload(type: string, f?: File){
    const file = f || (document.getElementById(`up-sales-${rep.id}-${type}`) as HTMLInputElement | null)?.files?.[0]
    if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('type', type)
    const r = await fetch(`/api/sales/${encodeURIComponent(rep.id)}/docs`, { method:'POST', body: fd })
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
            <input id={`up-sales-${rep.id}-${t}`} type="file" className="hidden" onChange={e=> e.target.files && upload(t, e.target.files[0])} />
            <button className="px-2 py-1 rounded bg-slate-800 text-white" onClick={()=> (document.getElementById(`up-sales-${rep.id}-${t}`) as HTMLInputElement)?.click()}>Upload</button>
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

export default function SalesManager(){
  const [items, setItems] = useState<Rep[]>([])
  const [filter, setFilter] = useState('')
  const filtered = useMemo(()=> (items||[]).filter(r=> (r?.name||'').toLowerCase().includes(filter.toLowerCase())), [items, filter])
  useEffect(()=>{ fetch('/api/sales').then(r=>r.json()).then(d=> setItems(Array.isArray(d?.items)? d.items:[])).catch(()=>setItems([])) },[])
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search sales reps" className="h-9 w-52 border rounded-md px-2" />
      </div>
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Commission %</th>
              <th className="text-left px-3 py-2">Base Pay</th>
              <th className="text-left px-3 py-2">Documents</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(rep => (
              <tr key={rep.id} className="border-t">
                <td className="px-3 py-2">{rep.name}</td>
                <td className="px-3 py-2 w-48">
                  <CommissionEditor rep={rep} onSaved={(pct)=> setItems(prev => prev.map(it => it.id===rep.id ? { ...it, commissionPercent: pct } : it))} />
                </td>
                <td className="px-3 py-2 w-[340px]">
                  <BasePayEditor rep={rep} onSaved={(amt, per)=> setItems(prev => prev.map(it => it.id===rep.id ? { ...it, basePayAmount: amt, basePayPeriod: per } : it))} />
                </td>
                <td className="px-3 py-2"><DocsList rep={rep} /></td>
              </tr>
            ))}
            {filtered.length===0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No sales reps</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CommissionEditor({ rep, onSaved }: { rep: Rep; onSaved: (pct:number|null)=>void }){
  const [value, setValue] = useState<string>(
    rep.commissionPercent==null ? '' : String(rep.commissionPercent)
  )
  const [saving, setSaving] = useState(false)
  const dirty = (rep.commissionPercent==null ? '' : String(rep.commissionPercent)) !== value
  async function save(){
    const num = value==='' ? 0 : Number(value)
    if (Number.isNaN(num)) { alert('Enter a number'); return }
    const clamped = Math.max(0, Math.min(100, num))
    setSaving(true)
    try {
      const r = await fetch(`/api/sales/${encodeURIComponent(rep.id)}`, { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ commissionPercent: clamped }) })
      const j = await r.json().catch(()=>({})) as any
      if (!r.ok || j?.ok===false) { alert(j?.error||'Save failed'); setSaving(false); return }
      onSaved(clamped)
      setSaving(false)
    } catch (e) {
      console.warn('commission save error', e)
      setSaving(false)
    }
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        step="0.1"
        min={0}
        max={100}
        value={value}
        onChange={e=>setValue(e.target.value)}
        placeholder="0"
        className="h-9 w-24 border rounded-md px-2"
      />
      <span className="text-slate-500">%</span>
      <button onClick={save} disabled={saving || !dirty} className="h-8 px-2 rounded bg-emerald-600 text-white disabled:opacity-50">{saving? 'Saving…':'Save'}</button>
    </div>
  )
}

function BasePayEditor({ rep, onSaved }: { rep: Rep; onSaved: (amount:number|null, period:Rep['basePayPeriod'])=>void }){
  const [amount, setAmount] = useState<string>(rep.basePayAmount==null ? '' : String(rep.basePayAmount))
  const [period, setPeriod] = useState<Rep['basePayPeriod']>(rep.basePayPeriod ?? 'JOB')
  const [saving, setSaving] = useState(false)
  const dirty = (rep.basePayAmount==null ? '' : String(rep.basePayAmount)) !== amount || (rep.basePayPeriod ?? 'JOB') !== period
  async function save(){
    const num = amount==='' ? 0 : Number(amount)
    if (Number.isNaN(num)) { alert('Enter a number'); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/sales/${encodeURIComponent(rep.id)}`, { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ basePayAmount: Math.max(0,num), basePayPeriod: period }) })
      const j = await r.json().catch(()=>({})) as any
      if (!r.ok || j?.ok===false) { alert(j?.error||'Save failed'); setSaving(false); return }
      onSaved(Math.max(0,num), period)
      setSaving(false)
    } catch (e) {
      console.warn('base pay save error', e)
      setSaving(false)
    }
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-500">$</span>
      <input type="number" step="0.01" min={0} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" className="h-9 w-28 border rounded-md px-2" />
      <select value={period ?? 'JOB'} onChange={e=>setPeriod(e.target.value as any)} className="h-9 border rounded-md px-2">
        <option value="JOB">per Job</option>
        <option value="WEEK">per Week</option>
        <option value="MONTH">per Month</option>
      </select>
      <button onClick={save} disabled={saving || !dirty} className="h-8 px-2 rounded bg-emerald-600 text-white disabled:opacity-50">{saving? 'Saving…':'Save'}</button>
    </div>
  )
}
