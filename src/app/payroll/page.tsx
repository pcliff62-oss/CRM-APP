"use client"
import React, { Suspense, useEffect, useState } from 'react'

export const dynamic = 'force-dynamic'

function CrewRequests() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<any>({})
  const [markingPaid, setMarkingPaid] = useState(false)
  const [savingEdits, setSavingEdits] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch('/api/crew-payment-requests', { cache: 'no-store' })
        const json = await res.json().catch(() => ({ ok: false }))
        if (active) {
          if (json?.ok) {
            const all = Array.isArray(json.items) ? json.items.map((it:any)=> {
              // ensure adjustments object is present if server passed JSON string accidentally
              let adj = it.adjustments
              if (!adj && typeof it.adjustmentsJson === 'string') {
                try { const a = JSON.parse(it.adjustmentsJson); if (a && typeof a==='object') adj = a } catch {}
              }
              return { ...it, adjustments: adj }
            }) : []
            // Exclude sales-tagged requests from crew list
            setItems(all.filter((it:any)=> String(it.rateTier||'').toLowerCase() !== 'sales'))
          }
          else setError(json?.error || 'Failed to load')
        }
      } catch (e: any) {
        if (active) setError(String(e?.message || e))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const refresh = async () => {
    try {
      setRefreshing(true)
      setError(null)
      const res = await fetch('/api/crew-payment-requests', { cache: 'no-store' })
      const json = await res.json().catch(() => ({ ok: false }))
      if (json?.ok) {
        const all = Array.isArray(json.items) ? json.items.map((it:any)=> {
          let adj = it.adjustments
          if (!adj && typeof it.adjustmentsJson === 'string') {
            try { const a = JSON.parse(it.adjustmentsJson); if (a && typeof a==='object') adj = a } catch {}
          }
          return { ...it, adjustments: adj }
        }) : []
        setItems(all.filter((it:any)=> String(it.rateTier||'').toLowerCase() !== 'sales'))
      } else {
        setError(json?.error || 'Failed to load')
      }
    } catch (e:any) {
      setError(String(e?.message||e))
    } finally { setRefreshing(false) }
  }

  const paidItems = items.filter(i => i.paid)
  const crewNames = Array.from(new Set(paidItems.map(i => i.crewName || 'Crew')))
  const historyMatrix = crewNames.map(name => {
    const rows = paidItems.filter(i => (i.crewName || 'Crew') === name)
    const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    return { name, rows, total }
  })

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }
  const allSelectable = items.filter(i => !i.paid)
  const allSelected = allSelectable.length > 0 && selectedIds.length === allSelectable.length
  const toggleAll = () => {
    if (allSelected) setSelectedIds([])
    else setSelectedIds(allSelectable.map(i => i.id))
  }

  const markPaid = async () => {
    if (!selectedIds.length) return
    if (!confirm(`Mark ${selectedIds.length} request(s) as Paid?`)) return
    try {
      setMarkingPaid(true)
      const res = await fetch('/api/crew-payment-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, action: 'markPaid' })
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Failed')
      const ref = await fetch('/api/crew-payment-requests')
      const rj = await ref.json()
      if (rj.ok) setItems(rj.items)
      setSelectedIds([])
    } catch (e: any) {
      alert(e.message || String(e))
    } finally {
      setMarkingPaid(false)
    }
  }

  const startEdit = (it: any) => {
    setEditing(true)
    // Seed editData with computed fields
    const extras = Array.isArray(it.extras) ? it.extras : []
    const normalizedExtras = extras.map((x:any)=> ({ title: String(x.title||'').trim(), price: Number(x.price)||0 }))
    const usedSquares = Number(it.usedSquares||0)
    const ratePerSquare = Number(it.ratePerSquare||0)
    const installTotal = usedSquares * ratePerSquare
    const extrasTotal = normalizedExtras.reduce((s:number,x:any)=> s + (Number(x.price)||0),0)
    const grandTotal = installTotal + extrasTotal
    setEditData({
      id: it.id,
      usedSquares,
      ratePerSquare,
      installTotal,
      extras: normalizedExtras,
      extrasTotal,
      grandTotal,
      amount: grandTotal,
      rateTier: it.rateTier,
      customerName: it.customerName,
      address: it.address
    })
  }
  const recalcDerived = (partial: any) => {
    const used = Number(partial.usedSquares||0)
    const rate = Number(partial.ratePerSquare||0)
    // Always recompute install total from used squares × rate
    const install = used * rate
    // Sum extras array if present
    const extrasTotal = Array.isArray(partial.extras) ? partial.extras.reduce((s:number,x:any)=> s + (Number(x.price)||0),0) : 0
    const grand = install + extrasTotal
    partial.installTotal = install
    partial.extrasTotal = extrasTotal
    partial.grandTotal = grand
    partial.amount = grand
    return partial
  }
  const saveEdits = async () => {
    try {
      setSavingEdits(true)
      const payload: any = {}
      const fields = [
        'amount',
        'usedSquares',
        'ratePerSquare',
        'installTotal',
        'extrasTotal',
        'grandTotal',
        'rateTier',
        'customerName',
        'address'
      ]
      const staged = recalcDerived({ ...editData })
      for (const f of fields) if (f in staged) payload[f] = staged[f]
      if (Array.isArray(staged.extras)) {
        payload.extrasJson = JSON.stringify(staged.extras.map((x:any)=> ({ title: String(x.title||'').trim(), price: Number(x.price)||0 })))
      }
      const res = await fetch('/api/crew-payment-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: staged.id, updates: payload })
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Failed')
      const ref = await fetch('/api/crew-payment-requests')
      const rj = await ref.json()
      if (rj.ok) setItems(rj.items)
      setEditing(false)
    } catch (e: any) {
      alert(e.message || String(e))
    } finally {
      setSavingEdits(false)
    }
  }

  const deleteRequest = async (id:string) => {
    if (!confirm('Delete this crew payment request? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/crew-payment-requests?id=${encodeURIComponent(id)}`, { method:'DELETE' })
      const json = await res.json().catch(()=>({ ok:false }))
      if (!json.ok) throw new Error(json.error||'Failed to delete')
      const ref = await fetch('/api/crew-payment-requests', { cache:'no-store' })
      const rj = await ref.json().catch(()=>({ ok:false, items:[] }))
      if (rj.ok) setItems(rj.items)
      setSelectedId(null); setEditing(false)
    } catch(e:any){ alert(e.message||String(e)) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="font-semibold text-lg">Crews</div>
  <button onClick={refresh} className="text-xs px-2 py-1 rounded border bg-white shadow-sm hover:bg-slate-50">{refreshing? 'Refreshing…':'Refresh'}</button>
        <button
          onClick={() => setShowHistory(true)}
          className="text-xs px-2 py-1 rounded border bg-white shadow-sm hover:bg-slate-50"
        >
          Payment History
        </button>
        {!!selectedIds.length && (
          <button
            disabled={markingPaid}
            onClick={markPaid}
            className="text-xs px-3 py-1 rounded bg-emerald-600 text-white disabled:opacity-50"
          >
            {markingPaid ? 'Marking…' : 'Mark as Paid'}
          </button>
        )}
      </div>
      <p className="text-sm text-slate-600">Payment requests created as crews submit completed jobs.</p>
      {loading && <div className="border rounded-md p-3 bg-white shadow-sm text-sm">Loading…</div>}
      {error && !loading && (
        <div className="border rounded-md p-3 bg-red-50 border-red-200 text-sm text-red-700">{error}</div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="border rounded-md p-3 bg-white shadow-sm text-sm">No crew payment requests yet.</div>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1 text-xs">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span>Select All</span>
          </div>
          {items.map(it => (
            <button
              key={it.id}
              onClick={() => setSelectedId(it.id)}
              className="border rounded-md p-3 bg-white shadow-sm text-sm flex justify-between items-center w-full text-left hover:bg-slate-50 focus:outline-none"
            >
              <div className="flex flex-col">
                <span className="font-bold">{it.crewName || 'Crew'} — {it.customerName || 'Job'}</span>
                  <span className="font-medium">
                  {it.amount ? `$${Number(it.amount).toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}` : '$0.00'}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(it.createdAt).toLocaleString()} {it.paid && '• Paid'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-slate-500">Job: {it.customerName || 'Job'}</div>
                {!it.paid && (
                  <input
                    type="checkbox"
                    onClick={e => e.stopPropagation()}
                    checked={selectedIds.includes(it.id)}
                    onChange={() => toggleSelect(it.id)}
                  />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
      {selectedId && (() => {
        const it = items.find(x => x.id === selectedId)
        if (!it) return null
        const close = () => {
          setSelectedId(null)
          setEditing(false)
        }
        return (
          <div className="fixed inset-0 z-40 flex items-start justify-center p-6">
            <div className="absolute inset-0 bg-black/30" onClick={close} />
            <div className="relative z-10 w-full max-w-2xl bg-white rounded-xl shadow-lg border p-6 space-y-4 text-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xl font-bold mb-1">
                    {it.crewName || 'Crew'} — {it.customerName || 'Job'}
                  </div>
                  <div className="text-xs text-slate-500">{it.address}</div>
                </div>
                <div className="flex gap-2">
                  {!editing && (
                    <button
                      onClick={() => startEdit(it)}
                      className="h-8 px-3 rounded-md border bg-white text-xs"
                    >
                      Adjust Totals
                    </button>
                  )}
                  {editing && (
                    <button
                      disabled={savingEdits}
                      onClick={saveEdits}
                      className="h-8 px-3 rounded-md border bg-emerald-600 text-white text-xs"
                    >
                      {savingEdits ? 'Saving…' : 'Save'}
                    </button>
                  )}
                  {!editing && (
                    <button onClick={()=> deleteRequest(it.id)} className="h-8 px-3 rounded-md border bg-red-600 text-white text-xs">Delete</button>
                  )}
                  <button onClick={close} className="h-8 px-3 rounded-md border bg-white text-xs">
                    Close
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Editable
                    label="Used Squares"
                    field="usedSquares"
                    editing={editing}
                    value={editing ? editData.usedSquares : it.usedSquares}
                    setEditData={(fn:any)=> setEditData((d:any)=> recalcDerived(typeof fn==='function'?fn(d):fn))}
                  />
                  <div className="space-y-0.5">
                    <Editable
                      prefix="$"
                      label="Rate per sq"
                      field="ratePerSquare"
                      editing={editing}
                      value={editing ? editData.ratePerSquare : it.ratePerSquare}
                      setEditData={(fn:any)=> setEditData((d:any)=> recalcDerived(typeof fn==='function'?fn(d):fn))}
                    />
                    {!editing && (()=>{
                      const adj = it.adjustments || null
                      if (!adj || typeof adj !== 'object') return null
                      const flags = [
                        adj.doubleLayerRip? 'Double layer rip': null,
                        adj.steepSlope? 'Steep slope': null,
                        adj.difficult? 'Difficult': null,
                      ].filter(Boolean) as string[]
                      if (!flags.length) return null
                      const per = Number(adj.adjustmentPerSq)||10
                      const count = flags.length
                      const adder = per * count
                      return (
                        <div className="text-[11px] text-slate-500">
                          Adjustments: {flags.join(', ')} ({count} × ${'{'}per{'}'}) → +${'{'}adder.toFixed(2){'}'}/sq
                        </div>
                      )
                    })()}
                  </div>
                  {/* Derived, read-only totals */}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Install Total</span>
                    <span className="font-medium">${Number(editing? editData.installTotal : (it.installTotal ?? (Number(it.usedSquares||0)*Number(it.ratePerSquare||0)))).toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Extras Total</span>
                    <span className="font-medium">${Number(editing? editData.extrasTotal : (it.extrasTotal ?? 0)).toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between text-base font-semibold">
                    <span>Grand Total</span>
                    <span>
                      ${Number(editing ? editData.grandTotal : it.grandTotal || it.amount || 0).toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="font-medium mb-1">Extras</div>
                  {!editing && (it.extras?.length ? (
                    <ul className="space-y-1">
                      {it.extras.map((ex: any, i: number) => (
                        <li key={i} className="flex justify-between border rounded px-2 py-1">
                          <span className="truncate mr-2">{ex.title || 'Extra'}</span>
                          <span>${Number(ex.price || 0).toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-slate-500">No extras</div>
                  ))}
                  {editing && (()=> {
                    const extras = Array.isArray(editData.extras)? editData.extras: []
                    return (
                      <div className="space-y-2">
                        {extras.map((ex:any,i:number)=> (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              className="flex-1 border rounded px-1 py-0.5 text-xs"
                              value={ex.title}
                              placeholder="Title"
                              onChange={e=> setEditData((d:any)=> recalcDerived({ ...d, extras: d.extras.map((x:any,idx:number)=> idx===i? { ...x, title:e.target.value }: x) }))}
                            />
                            <input
                              className="w-24 text-right border rounded px-1 py-0.5 text-xs"
                              value={ex.price}
                              placeholder="0"
                              onChange={e=> setEditData((d:any)=> recalcDerived({ ...d, extras: d.extras.map((x:any,idx:number)=> idx===i? { ...x, price:e.target.value }: x) }))}
                            />
                            <button
                              onClick={()=> setEditData((d:any)=> recalcDerived({ ...d, extras: d.extras.filter((_:any,idx:number)=> idx!==i) }))}
                              className="text-xs px-2 py-1 rounded border bg-white"
                            >✕</button>
                          </div>
                        ))}
                        <button
                          onClick={()=> setEditData((d:any)=> recalcDerived({ ...d, extras: [...(Array.isArray(d.extras)? d.extras: []), { title:'', price:0 }] }))}
                          className="text-xs px-3 py-1 rounded border bg-white"
                        >Add Extra</button>
                      </div>
                    )
                  })()}
                </div>
              </div>
              <div>
                <div className="font-medium mb-2">Photos</div>
                {it.attachments?.length ? (
                  <div className="grid grid-cols-5 gap-2">
                    {it.attachments.map((a: any) => (
                      <div
                        key={a.id}
                        className="aspect-square rounded-lg overflow-hidden bg-slate-100 border"
                      >
                        <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">No photos</div>
                )}
              </div>
              <div className="text-xs text-slate-500">
                Created {new Date(it.createdAt).toLocaleString()} • Payment Request ID {it.id}
              </div>
            </div>
          </div>
        )
      })()}
      {showHistory && (
        <div className="fixed inset-0 z-40 flex items-start justify-center p-6">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowHistory(false)}
          />
          <div className="relative z-10 w-full max-w-5xl bg-white rounded-xl shadow-lg border p-6 space-y-4 text-sm overflow-auto max-h-[90vh]">
            <div className="flex justify-between items-center">
              <div className="text-xl font-bold">Payment History</div>
              <button
                onClick={() => setShowHistory(false)}
                className="h-8 px-3 rounded-md border bg-white text-xs"
              >
                Close
              </button>
            </div>
            <div className="text-xs text-slate-500">
              Paid requests grouped by crew. Subtotals at column bottom.
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-xs border">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border px-2 py-1 text-left">#</th>
                    {crewNames.map(n => (
                      <th key={n} className="border px-2 py-1 text-left">
                        {n}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const maxRows = Math.max(0, ...historyMatrix.map(m => m.rows.length))
                    const rows: any[] = []
                    for (let i = 0; i < maxRows; i++) {
                      rows.push(
                        <tr key={i} className="odd:bg-white even:bg-slate-50">
                          <td className="border px-2 py-1">{i + 1}</td>
                          {historyMatrix.map(m => {
                            const r = m.rows[i]
                            return (
                              <td
                                key={m.name + ':' + i}
                                className="border px-2 py-1 whitespace-nowrap"
                              >
                                {r ? `$${Number(r.amount).toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}\n${r.paidAt? new Date(r.paidAt).toLocaleDateString():''}` : ''}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    }
                    rows.push(
                      <tr
                        key="subtotal"
                        className="bg-emerald-50 font-semibold"
                      >
                        <td className="border px-2 py-1">Subtotal</td>
                        {historyMatrix.map(m => (
                          <td
                            key={m.name + 'subtotal'}
                            className="border px-2 py-1"
                          >
                            ${m.total.toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}
                          </td>
                        ))}
                      </tr>
                    )
                    return rows
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Editable({ label, field, value, editing, setEditData, prefix = '' }: any) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-600">{label}</span>
      {editing ? (
        <input
          className="w-24 text-right border rounded px-1 py-0.5 text-xs"
          value={value ?? ''}
          // Recompute derived totals live on every change
          onChange={e => setEditData((d: any) => ({ ...d, [field]: e.target.value }))}
        />
      ) : (
  <span className="font-medium">{prefix}{Number(value || 0).toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}</span>
      )}
    </div>
  )
}

function SalesPayroll() {
  const [items, setItems] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string|null>(null)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [markingPaid, setMarkingPaid] = React.useState(false)
  const [showHistory, setShowHistory] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string|null>(null)
  const [editing, setEditing] = React.useState(false)
  const [editData, setEditData] = React.useState<any>({})
  const [savingEdits, setSavingEdits] = React.useState(false)

  React.useEffect(()=>{
    let active = true
    ;(async ()=>{
      try {
        setLoading(true); setError(null)
        const res = await fetch('/api/sales-payment-requests', { cache:'no-store' })
        const json = await res.json().catch(()=>({ ok:false }))
        if (!active) return
        if (json.ok) {
          const all = Array.isArray(json.items)? json.items: []
          // Only use server-provided human name; never fallback to id/email
          setItems(all.map((r:any)=> {
            const name = (typeof r.salesUserName==='string'? r.salesUserName.trim(): '')
            const validName = name && name!=='dd' && !/@/.test(name) ? name : undefined
            return { ...r, salesUserName: validName }
          }))
        } else {
          setError(json.error || 'Failed to load')
        }
      } catch (e:any) {
        if (active) setError(String(e?.message||e))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return ()=> { active = false }
  },[])

  async function refresh() {
    try {
      setRefreshing(true); setError(null)
      const res = await fetch('/api/sales-payment-requests', { cache:'no-store' })
      const json = await res.json().catch(()=>({ ok:false }))
      if (json.ok) {
        const all = Array.isArray(json.items)? json.items: []
        setItems(all.map((r:any)=> {
          const name = (typeof r.salesUserName==='string'? r.salesUserName.trim(): '')
          const validName = name && name!=='dd' && !/@/.test(name) ? name : undefined
          return { ...r, salesUserName: validName }
        }))
      } else setError(json.error||'Failed to load')
    } catch(e:any){ setError(String(e?.message||e)) } finally { setRefreshing(false) }
  }

  const unpaid = items.filter(i=> !i.paid)
  const allSelected = unpaid.length>0 && selectedIds.length === unpaid.length
  function toggle(id:string){ setSelectedIds(prev=> prev.includes(id)? prev.filter(x=>x!==id): [...prev,id]) }
  function toggleAll(){ if (allSelected) setSelectedIds([]); else setSelectedIds(unpaid.map(i=>i.id)) }
  async function markPaid(){
    if (!selectedIds.length) return
    if (!confirm(`Mark ${selectedIds.length} sales request(s) as Paid?`)) return
    try {
      setMarkingPaid(true)
      const res = await fetch('/api/sales-payment-requests', { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ids: selectedIds, action:'markPaid' }) })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Failed')
      const ref = await fetch('/api/sales-payment-requests')
      const rj = await ref.json()
      if (rj.ok) setItems(rj.items)
      setSelectedIds([])
    } catch (e:any) { alert(e.message || String(e)) } finally { setMarkingPaid(false) }
  }

  // History grouping by salesUserId
  const paidItems = items.filter(i=> i.paid)
  const salesNames = Array.from(new Set(paidItems.map(i=> (i.salesUserName && i.salesUserName!=='dd' && !/@/.test(i.salesUserName))? i.salesUserName.trim() : ''))).filter(Boolean)
  const historyMatrix = salesNames.map(name => {
  const rows = paidItems.filter(i=> ((i.salesUserName && i.salesUserName!=='dd' && !/@/.test(i.salesUserName))? i.salesUserName.trim() : '') === name)
    const total = rows.reduce((s,r)=> s + (Number(r.amount)||0),0)
    return { name, rows, total }
  })

  const startEdit = (it:any) => {
    setEditing(true)
    const extras = Array.isArray(it.extras)? it.extras: []
    const extrasTotal = extras.reduce((s:number,x:any)=> s + (Number(x.price)||0),0)
    // Derive contract price if missing (mirror detail view logic)
    const storedContract = Number(it.contractPrice)
    const contractDerivedFromGrand = Number.isFinite(Number(it.grandTotal)) ? Number(it.grandTotal) - extrasTotal : NaN
    const invertCommission = (Number(it.amount) && Number(it.commissionPercent)) ? (Number(it.amount) / (Number(it.commissionPercent)/100)) - extrasTotal : NaN
    const resolvedContract = Number.isFinite(storedContract) && storedContract>0 ? storedContract : (Number.isFinite(contractDerivedFromGrand) && contractDerivedFromGrand>0 ? contractDerivedFromGrand : (Number.isFinite(invertCommission) && invertCommission>0 ? invertCommission : 0))
    const commissionPercent = Number(it.commissionPercent)||0
    const grandTotalBase = (Number(it.grandTotal)||0) || (resolvedContract + extrasTotal)
    const amountBase = (Number(it.amount)||0) || (grandTotalBase * (commissionPercent/100))
    setEditData({
      id: it.id,
      commissionPercent,
      contractPrice: resolvedContract,
      extras: extras.map((x:any)=> ({ title: x.title || '', price: Number(x.price)||0 })),
      grandTotal: grandTotalBase,
      amount: amountBase,
      customerName: it.customerName || '',
      address: it.address || ''
    })
  }

  const recalcDerived = (partial:any) => {
    const contract = Number(partial.contractPrice||0)
    const extrasTotal = Array.isArray(partial.extras)? partial.extras.reduce((s:number,x:any)=> s + (Number(x.price)||0),0):0
    const commission = Number(partial.commissionPercent||0)
    partial.grandTotal = contract + extrasTotal
    partial.amount = partial.grandTotal * (commission/100)
    return partial
  }

  const saveEdits = async () => {
    try {
      setSavingEdits(true)
      const staged = recalcDerived({ ...editData })
      const payload:any = {}
      const numeric = ['commissionPercent','contractPrice','grandTotal','amount']
      for (const k of numeric) if (k in staged) payload[k] = Number(staged[k])
      if (Array.isArray(staged.extras)) payload.extrasJson = JSON.stringify(staged.extras.map((x:any)=> ({ title: String(x.title||'').trim(), price: Number(x.price)||0 })))
      for (const s of ['customerName','address']) if (s in staged) payload[s] = staged[s]
      const res = await fetch('/api/sales-payment-requests', { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ id: staged.id, updates: payload }) })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Failed')
      const ref = await fetch('/api/sales-payment-requests', { cache:'no-store' })
      const rj = await ref.json()
      if (rj.ok) setItems(rj.items)
      setEditing(false)
    } catch(e:any) {
      alert(e.message || String(e))
    } finally { setSavingEdits(false) }
  }

  const deleteRequest = async (id:string) => {
    if (!confirm('Delete this sales payment request? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/sales-payment-requests?id=${encodeURIComponent(id)}`, { method:'DELETE' })
      const json = await res.json().catch(()=>({ ok:false }))
      if (!json.ok) throw new Error(json.error||'Failed to delete')
      const ref = await fetch('/api/sales-payment-requests', { cache:'no-store' })
      const rj = await ref.json().catch(()=>({ ok:false, items:[] }))
      if (rj.ok) setItems(rj.items)
      setSelectedId(null); setEditing(false)
    } catch(e:any){ alert(e.message||String(e)) }
  }

  const closeDetail = () => { setSelectedId(null); setEditing(false) }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="font-semibold text-lg">Sales</div>
  <button onClick={refresh} className="text-xs px-2 py-1 rounded border bg-white shadow-sm hover:bg-slate-50">{refreshing? 'Refreshing…':'Refresh'}</button>
  <button onClick={()=> setShowHistory(true)} className="text-xs px-2 py-1 rounded border bg-white shadow-sm hover:bg-slate-50">Payment History</button>
        {!!selectedIds.length && (
          <button disabled={markingPaid} onClick={markPaid} className="text-xs px-3 py-1 rounded bg-emerald-600 text-white disabled:opacity-50">{markingPaid? 'Marking…':'Mark as Paid'}</button>
        )}
      </div>
      <p className="text-sm text-slate-600">Commission payment requests submitted by sales.</p>
      {loading && <div className="border rounded-md p-3 bg-white shadow-sm text-sm">Loading…</div>}
      {error && !loading && <div className="border rounded-md p-3 bg-red-50 border-red-200 text-sm text-red-700">{error}</div>}
      {!loading && !error && items.length===0 && <div className="border rounded-md p-3 bg-white shadow-sm text-sm">No sales payment requests yet.</div>}
      {!loading && !error && items.length>0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1 text-xs">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span>Select All</span>
          </div>
          {items.map(it => {
            const displayName = (it.salesUserName && it.salesUserName!=='dd')? it.salesUserName : (it.salesUserId || '')
            return (
              <button onClick={()=> setSelectedId(it.id)} key={it.id} className={`border rounded-md p-3 bg-white shadow-sm text-sm flex justify-between items-center w-full text-left hover:bg-slate-50 focus:outline-none ${it.paid? 'opacity-70':''}`}> 
                <div className="flex flex-col">
      <span className="font-bold">{displayName} - {it.customerName || 'Customer'}</span>
                  <span className="font-medium">{it.amount? `$${Number(it.amount).toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}`:'$0.00'}</span>
                  <span className="text-xs text-slate-500">{new Date(it.createdAt).toLocaleString()} {it.paid && '• Paid'}</span>
                </div>
                {!it.paid && (
                  <input type="checkbox" checked={selectedIds.includes(it.id)} onChange={()=>toggle(it.id)} />
                )}
              </button>
            )
          })}
        </div>
      )}
      {selectedId && (()=> {
        const it = items.find(x=> x.id === selectedId)
        if (!it) return null
        const extras = Array.isArray(editing? editData.extras: it.extras)? (editing? editData.extras: it.extras): []
        const extrasTotal = extras.reduce((s:number,x:any)=> s + (Number(x.price)||0),0)
  // Derive contract price fallback: prefer stored contractPrice; else derive from grandTotal minus extras; else if amount & commissionPercent available, invert commission
  const storedContract = Number(it.contractPrice)
  const contractDerivedFromGrand = Number.isFinite(Number(it.grandTotal)) ? Number(it.grandTotal) - extrasTotal : NaN
  const invertCommission = (Number(it.amount) && Number(it.commissionPercent)) ? (Number(it.amount) / (Number(it.commissionPercent)/100)) - extrasTotal : NaN
  const resolvedContract = Number.isFinite(storedContract) && storedContract>0 ? storedContract : (Number.isFinite(contractDerivedFromGrand) && contractDerivedFromGrand>0 ? contractDerivedFromGrand : (Number.isFinite(invertCommission) && invertCommission>0 ? invertCommission : 0))
  const contract = editing? Number(editData.contractPrice||resolvedContract||0): resolvedContract
        const commissionPercent = editing? Number(editData.commissionPercent||0): Number(it.commissionPercent||0)
        const grandTotal = editing? Number(editData.grandTotal|| (contract + extrasTotal)) : Number(it.grandTotal || (contract + extrasTotal))
  const amount = editing? Number(editData.amount || (grandTotal * (commissionPercent/100))) : Number(it.amount || (grandTotal * (commissionPercent/100)))
        return (
          <div className="fixed inset-0 z-40 flex items-start justify-center p-6">
            <div className="absolute inset-0 bg-black/30" onClick={closeDetail} />
            <div className="relative z-10 w-full max-w-2xl bg-white rounded-xl shadow-lg border p-6 space-y-4 text-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xl font-bold mb-1">{(it.salesUserName && it.salesUserName!=='dd')? it.salesUserName : (it.salesUserId || 'Sales')} — {it.customerName || 'Customer'}</div>
                  <div className="text-xs text-slate-500">{it.address}</div>
                </div>
                <div className="flex gap-2">
                  {!editing && <button onClick={()=> startEdit(it)} className="h-8 px-3 rounded-md border bg-white text-xs">Adjust Totals</button>}
                  {!editing && <button onClick={()=> deleteRequest(it.id)} className="h-8 px-3 rounded-md border bg-red-600 text-white text-xs">Delete</button>}
                  {editing && <button disabled={savingEdits} onClick={saveEdits} className="h-8 px-3 rounded-md border bg-emerald-600 text-white text-xs">{savingEdits? 'Saving…':'Save'}</button>}
                  <button onClick={closeDetail} className="h-8 px-3 rounded-md border bg-white text-xs">Close</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Editable label="Contract Price" prefix="$" field="contractPrice" editing={editing} value={editing? editData.contractPrice: contract} setEditData={(fn:any)=> setEditData((d:any)=> recalcDerived(typeof fn==='function'? fn(d): fn))} />
                  <Editable label="Commission %" field="commissionPercent" editing={editing} value={editing? editData.commissionPercent: it.commissionPercent} setEditData={(fn:any)=> setEditData((d:any)=> recalcDerived(typeof fn==='function'? fn(d): fn))} />
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Extras Total</span>
                    <span className="font-medium">${extrasTotal.toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between text-base font-semibold">
                    <span>Grand Total</span><span>${grandTotal.toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Commission Amount</span>
                    <span className="font-semibold">${amount.toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="font-medium">Extras</div>
                  {!editing && (!extras || !extras.length) && <div className="text-xs text-slate-500">No extras</div>}
                  {!editing && extras && extras.length>0 && (
                    <ul className="space-y-1">
                      {extras.map((ex:any,i:number)=> (
                        <li key={i} className="flex justify-between border rounded px-2 py-1"><span className="truncate mr-2">{ex.title||'Extra'}</span><span>${Number(ex.price||0).toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}</span></li>
                      ))}
                    </ul>
                  )}
                  {editing && (
                    <div className="space-y-2">
                      {extras.map((ex:any,i:number)=> (
                        <div key={i} className="flex items-center gap-2">
                          <input className="flex-1 border rounded px-1 py-0.5 text-xs" value={ex.title} placeholder="Title" onChange={e=> setEditData((d:any)=> recalcDerived({ ...d, extras: d.extras.map((x:any,idx:number)=> idx===i? { ...x, title:e.target.value }: x) }))} />
                          <input className="w-24 text-right border rounded px-1 py-0.5 text-xs" value={ex.price} placeholder="0" onChange={e=> setEditData((d:any)=> recalcDerived({ ...d, extras: d.extras.map((x:any,idx:number)=> idx===i? { ...x, price:e.target.value }: x) }))} />
                          <button onClick={()=> setEditData((d:any)=> recalcDerived({ ...d, extras: d.extras.filter((_:any,idx:number)=> idx!==i) }))} className="text-xs px-2 py-1 rounded border bg-white">✕</button>
                        </div>
                      ))}
                      <button onClick={()=> setEditData((d:any)=> recalcDerived({ ...d, extras:[...d.extras,{ title:'', price:0 }] }))} className="text-xs px-3 py-1 rounded border bg-white">Add Extra</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-500">Created {new Date(it.createdAt).toLocaleString()} • Payment Request ID {it.id}</div>
            </div>
          </div>
        )
      })()}
      {showHistory && (
        <div className="fixed inset-0 z-40 flex items-start justify-center p-6">
          <div className="absolute inset-0 bg-black/30" onClick={()=> setShowHistory(false)} />
          <div className="relative z-10 w-full max-w-5xl bg-white rounded-xl shadow-lg border p-6 space-y-4 text-sm overflow-auto max-h-[90vh]">
            <div className="flex justify-between items-center">
              <div className="text-xl font-bold">Sales Payment History</div>
              <button onClick={()=> setShowHistory(false)} className="h-8 px-3 rounded-md border bg-white text-xs">Close</button>
            </div>
            <div className="text-xs text-slate-500">Paid requests grouped by salesperson.</div>
            <div className="overflow-auto">
              <table className="min-w-full text-xs border">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border px-2 py-1 text-left">#</th>
                    {salesNames.map(n=> <th key={n} className="border px-2 py-1 text-left">{n}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const maxRows = Math.max(0, ...historyMatrix.map(m=> m.rows.length))
                    const rows:any[] = []
                    for (let i=0;i<maxRows;i++) {
                      rows.push(
                        <tr key={i} className="odd:bg-white even:bg-slate-50">
                          <td className="border px-2 py-1">{i+1}</td>
                          {historyMatrix.map(m=> {
                            const r = m.rows[i]
                            return <td key={m.name+':'+i} className="border px-2 py-1 whitespace-nowrap">{r? `$${Number(r.amount).toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}\n${r.paidAt? new Date(r.paidAt).toLocaleDateString():''}`: ''}</td>
                          })}
                        </tr>
                      )
                    }
                    rows.push(
                      <tr key="subtotal" className="bg-emerald-50 font-semibold">
                        <td className="border px-2 py-1">Subtotal</td>
                        {historyMatrix.map(m=> <td key={m.name+'subtotal'} className="border px-2 py-1">${m.total.toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })}</td>)}
                      </tr>
                    )
                    return rows
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmployeePayroll() {
  return (
    <div className="space-y-3">
      <div className="font-semibold text-lg">Employees</div>
      <p className="text-sm text-slate-600">Upcoming: hourly & salary calculations.</p>
      <div className="border rounded-md p-3 bg-white shadow-sm text-sm">Not implemented.</div>
    </div>
  )
}

export default function PayrollPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Payroll</h1>
      <Suspense fallback={<div>Loading…</div>}>
        <div className="grid gap-8 md:grid-cols-3">
          <CrewRequests />
          <SalesPayroll />
          <EmployeePayroll />
        </div>
      </Suspense>
    </div>
  )
}
