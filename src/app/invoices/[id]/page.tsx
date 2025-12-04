"use client"
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const currencyFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function money(n: number | null | undefined) { return `$${currencyFmt.format(Number(n)||0)}` }

async function loadInvoice(id: string) {
  const r = await fetch(`/api/invoices/${id}`)
  if (!r.ok) return null
  const j = await r.json()
  return j.item
}

export default function InvoiceDetail({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [inv, setInv] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string|undefined>()
  const [showReceive, setShowReceive] = useState(false)
  const [receiveAmount, setReceiveAmount] = useState('')
  const [receiveMethod, setReceiveMethod] = useState<'CHECK'|'CASH'>('CHECK')
  const [receiveRef, setReceiveRef] = useState('')
  const [receiving, setReceiving] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [sendRecipients, setSendRecipients] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const today = new Date().toISOString().slice(0,10)

  useEffect(()=>{ (async()=>{
    const data = await loadInvoice(params.id)
    if (!data) { setError('Invoice not found'); return }
    setInv(data)
    // Default due date to today if missing (Due on receipt default)
    try {
      const d = data?.dueDate ? new Date(data.dueDate) : new Date()
      const iso = new Date(d).toISOString().slice(0,10)
      setInv((v:any)=> ({ ...data, dueDate: iso }))
    } catch { /* ignore */ }
    let base: any[] = []
    try { base = JSON.parse(data.extrasJson||'[]') } catch { base = [] }

    // Special handling for DEPOSIT invoices: only show a single deposit line item.
    if (String(data.type||'').toUpperCase() === 'DEPOSIT') {
      // Compute 50% from the invoice's contractPrice; fallback to lead.contractPrice or 2x of totalDue
      const contractCandidate = Number(data.contractPrice||0) || Number(data?.lead?.contractPrice||0) || (Number(data.totalDue||0) * 2)
      const contract = Number.isFinite(contractCandidate) ? contractCandidate : 0
      const depositAmount = Math.round((contract * 0.5) * 100) / 100
      const depositLine = { title: 'Deposit', description: '50% deposit request for approved contract', qty: 1, price: depositAmount, amount: depositAmount, manualAmount: true }
      setItems([depositLine])
      return
    }
    // Ensure Contract and Deposit appear as their own line items
    const hasContract = base.some(x => (x?.title||'').toLowerCase() === 'contract')
    const hasDeposit = base.some(x => (x?.title||'').toLowerCase() === 'deposit')
    // Normalize extras: any non-Contract/Deposit becomes title "Extra" with description populated
    const toNum = (v:any) => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : 0
      if (typeof v === 'string') {
        const raw = v.replace(/[^0-9.+-]/g,'')
        const n = raw ? parseFloat(raw) : NaN
        return Number.isFinite(n) ? n : 0
      }
      return 0
    }
    const extractAmountFromText = (s: string): number => {
      // Find the last numeric token, optionally with $ and commas, allow negative
      const re = /-?\$?\s*\d[\d,]*(?:\.\d{1,2})?/g
      let m: RegExpExecArray | null
      let last: string | null = null
      while ((m = re.exec(s)) !== null) { last = m[0] }
      if (!last) return 0
      const cleaned = last.replace(/[^0-9.+-]/g,'')
      const num = cleaned ? parseFloat(cleaned) : NaN
      return Number.isFinite(num) ? num : 0
    }
  const normalized: any[] = base.map(x => {
      const t = String(x?.title||'').toLowerCase()
      if (t === 'contract') return { title: 'Contract', description: 'Approved contract amount', qty: 1, price: Number(data.contractPrice||0), amount: Number(data.contractPrice||0), manualAmount: false }
      if (t === 'deposit') return { title: 'Deposit', description: 'Deposit applied', qty: 1, price: 0, amount: -Math.abs(Number(data.depositAmount||0)), manualAmount: true }
      // Extras: honor explicit amount or rate if provided
      // Support legacy formats:
      // - string item like "chimney flashing — $500" -> parse amount from text
      // - object with title/description and optional price/rate/amount/total
      const isString = typeof x === 'string'
      const qty = isString ? 1 : (toNum((x as any)?.qty ?? 1) || 1)
      let price = isString ? extractAmountFromText(String(x)) : (toNum((x as any)?.rate ?? (x as any)?.price ?? (x as any)?.total ?? 0) || 0)
      const aCand = isString ? extractAmountFromText(String(x)) : toNum((x as any)?.amount)
      let amount = Number.isFinite(aCand) && aCand !== 0 ? aCand : undefined
      if (price === 0 && amount !== undefined && qty > 0) {
        price = amount / qty
      }
      // If still no price/amount, try to extract from text fields for object extras
      if (!isString && price === 0 && amount === undefined) {
        const fromText = extractAmountFromText(String((x as any)?.description || (x as any)?.title || ''))
        if (fromText > 0) {
          price = fromText
        }
      }
      const manualAmount = amount !== undefined
      return { title: 'Extra', description: (isString ? String(x) : (x?.description || x?.title || '')), qty, price, amount, manualAmount }
    })
    const withHeader: any[] = [...normalized]
    if (!hasContract) {
      const amt = Number(data.contractPrice||0)
      withHeader.unshift({ title: 'Contract', description: 'Approved contract amount', qty: 1, price: amt })
    }
    if (!hasDeposit) {
      const dep = Number(data.depositAmount||0)
      withHeader.push({ title: 'Deposit', description: 'Deposit applied', qty: 1, price: -Math.abs(dep) })
    }
    setItems(withHeader)
  })() },[params.id])

  function addLine(){ setItems(it=>[...it,{ title:'', description:'', qty:0, price:0, qtyStr:'', priceStr:'', manualAmount:false, amount:0 }]) }
  const fmtNum = (n:number)=> new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  function removeLine(idx:number){ setItems(it=> it.filter((_,i)=> i!==idx)) }
  function updateLine(idx:number, patch:any){ setItems(it=> it.map((x,i)=> i===idx? { ...x, ...patch }: x)) }
  const extrasTotal = items.reduce((s,x:any)=> {
    const computed = (Number(x.qty||0)||0) * (Number(x.price||0)||0)
    const amt = x.manualAmount ? (Number(x.amount||0)||0) : computed
    return s + amt
  }, 0)
  const totalDue = String(inv?.type||'').toUpperCase() === 'DEPOSIT' ? (items[0]?.amount ?? extrasTotal) : extrasTotal
  const due = inv?.dueDate ? new Date(inv.dueDate).toISOString().slice(0,10) : today

  async function save() {
    if (!inv) return
    setSaving(true); setError(undefined)
    try {
      // Map selected terms dropdown to due date if user changed it
      // (Due date input already updates inv.dueDate directly.)
      const isDeposit = String(inv?.type||'').toUpperCase() === 'DEPOSIT'
      const payload: any = {
        dueDate: due,
        extrasJson: JSON.stringify(items)
      }
      // Do not zero out contract fields for DEPOSIT invoices; for other types, preserve previous behavior
      if (!isDeposit) {
        payload.contractPrice = 0
        payload.depositAmount = 0
      }
      const r = await fetch(`/api/invoices/${inv.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error||'Save failed')
      setInv(j.item)

      // Also persist Bill To edits back to the customer/contact & property
      try {
  const name = (document.getElementById('billto-name') as HTMLInputElement)?.value || ''
        const email = (document.getElementById('billto-email') as HTMLInputElement)?.value || ''
        const phone = (document.getElementById('billto-phone') as HTMLInputElement)?.value || ''
        const address1 = (document.getElementById('billto-address1') as HTMLInputElement)?.value || ''
        const city = (document.getElementById('billto-city') as HTMLInputElement)?.value || ''
        const state = (document.getElementById('billto-state') as HTMLInputElement)?.value || ''
        const postal = (document.getElementById('billto-postal') as HTMLInputElement)?.value || ''
        if (inv.contactId) {
          await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            id: inv.contactId,
            name, email, phone,
            address: address1,
            town: city,
            notes: inv.lead?.notes || ''
          }) })
          // Property updates are handled by customers POST (upsert address)
        }
      } catch { /* non-blocking */ }
    } catch(e:any){ setError(String(e.message||e)) } finally { setSaving(false) }
  }

  if (error) return <div className="p-6">{error}</div>
  if (!inv) return <div className="p-6">Loading…</div>

  const remainingDue = (() => {
    const paid = Number(inv.paidAmount||0)||0
    const due = Number(inv.totalDue||0)||0
    const rem = due - paid
    return rem > 0 ? Math.round(rem*100)/100 : 0
  })()

  async function receivePayment() {
    if (!inv) return
    const amtRaw = receiveAmount.replace(/[^0-9.]/g,'')
    const amt = amtRaw ? parseFloat(amtRaw) : NaN
    if (!Number.isFinite(amt) || amt <= 0) { alert('Enter a valid amount'); return }
    setReceiving(true)
    try {
      const payload: any = { amount: Math.round(amt*100)/100, method: receiveMethod, ref: receiveRef }
      const r = await fetch(`/api/invoices/${inv.id}/receive`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error||'Receive failed')
      setInv(j.item)
      setShowReceive(false)
      router.refresh()
    } catch(e:any){ alert(e.message||'Receive failed') } finally { setReceiving(false) }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto print:p-0">
      <div className="flex justify-between mb-6">
  <h1 className="text-2xl font-bold">Invoice {inv.number || '(Draft)'}</h1>
        <div className="flex gap-3">
          <form action={`/api/invoices/${inv.id}/send`} method="post" className="hidden print:block">
            <button className="px-4 py-2 bg-green-600 text-white rounded text-sm" type="submit">Send</button>
          </form>
          <button
            onClick={()=> {
              const original = document.title
              const cust = (inv?.lead?.contact?.name || 'Customer').replace(/\s+/g,' ').trim()
              const num = inv?.number || 'Draft'
              document.title = `${cust}-Invoice ${num}`
              // Defer print slightly to ensure title applied
              setTimeout(()=> {
                window.print()
                // Restore after a short delay (print dialog blocks JS until closed in most browsers)
                setTimeout(()=> { document.title = original }, 500)
              }, 50)
            }}
            className="px-4 py-2 bg-gray-100 rounded text-sm hidden md:inline"
          >Print / PDF</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">{saving? 'Saving…':'Save'}</button>
      <button
            onClick={async()=>{
              try {
                if (!window.confirm('Delete this invoice? This cannot be undone.')) return
                const r = await fetch(`/api/invoices/${inv.id}`, { method: 'DELETE' })
                if (!r.ok) { try { const j = await r.json(); throw new Error(j?.error||'Delete failed') } catch { throw new Error('Delete failed') } }
                const ts = Date.now()
                router.replace(`/invoices?refresh=${ts}`)
              } catch (e:any) {
                alert(e?.message || 'Delete failed')
              }
            }}
            className="px-4 py-2 bg-red-600 text-white rounded text-sm"
          >Delete</button>
          <Link href="/invoices" className="px-4 py-2 bg-gray-200 rounded text-sm">Back</Link>
        </div>
      </div>
      {/* Bill To & Meta */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="md:col-span-2 border rounded p-4 bg-white">
          <div className="text-sm font-semibold mb-2">Bill to</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Name</label>
              <input id="billto-name" defaultValue={inv.lead?.contact?.name || ''} className="w-full text-sm border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Email</label>
              <input id="billto-email" defaultValue={inv.lead?.contact?.email || ''} className="w-full text-sm border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Phone</label>
              <input id="billto-phone" defaultValue={inv.lead?.contact?.phone || ''} className="w-full text-sm border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Address 1</label>
              <input id="billto-address1" defaultValue={inv.lead?.property?.address1 || ''} className="w-full text-sm border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">City</label>
              <input id="billto-city" defaultValue={inv.lead?.property?.city || ''} className="w-full text-sm border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">State</label>
              <input id="billto-state" defaultValue={inv.lead?.property?.state || ''} className="w-full text-sm border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Postal</label>
              <input id="billto-postal" defaultValue={inv.lead?.property?.postal || ''} className="w-full text-sm border rounded px-2 py-1" />
            </div>
          </div>
        </div>
        <div className="border rounded p-4 bg-white space-y-3 text-sm">
          <div>
            <label className="block text-xs font-semibold mb-1">Invoice date</label>
            <input type="date" defaultValue={today} className="border rounded px-2 py-1 w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Due date</label>
            <input type="date" value={due} onChange={e=> setInv((v:any)=> ({ ...v, dueDate: e.target.value }))} className="border rounded px-2 py-1 w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Terms</label>
            <select className="border rounded px-2 py-1 w-full text-sm" defaultValue="DUE_ON_RECEIPT" onChange={e=> {
              const v = e.target.value
              const days = v === 'DUE_ON_RECEIPT' ? 0 : v === 'NET_15' ? 15 : v === 'NET_30' ? 30 : v === 'NET_60' ? 60 : 0
              setInv((prev:any)=> ({ ...prev, dueDate: new Date(Date.now()+days*86400000).toISOString().slice(0,10) }))
            }}>
              <option value="DUE_ON_RECEIPT">Due on receipt</option>
              <option value="NET_15">Net 15</option>
              <option value="NET_30">Net 30</option>
              <option value="NET_60">Net 60</option>
            </select>
          </div>
        </div>
      </div>
      {/* Totals and Line Items */}
      <div className="mb-8">
        {String(inv?.type||'').toUpperCase() === 'DEPOSIT' && (
          <div className="space-y-1 mb-2">
            <div className="flex justify-between items-center">
              <div className="text-sm font-semibold">Total Contract Price</div>
              <div className="text-sm font-bold">{money((Number(inv?.contractPrice||0) || Number(inv?.lead?.contractPrice||0) || (Number(totalDue||0)*2)))}</div>
            </div>
          </div>
        )}
        <div className="border rounded bg-white overflow-x-auto print:overflow-visible">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="p-2 text-left w-10">#</th>
                <th className="p-2 text-left">Product / Service</th>
                <th className="p-2 text-left">Description</th>
                <th className="p-2 text-right w-16">Qty</th>
                <th className="p-2 text-right w-24">Rate</th>
                <th className="p-2 text-right w-24">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x:any,i:number)=> {
                const amount = (Number(x.qty||0)||0)*(Number(x.price||0)||0)
                return (
                  <tr key={i} className="border-t">
                    <td className="p-2 text-xs text-gray-500">{i+1}</td>
                    <td className="p-2"><input value={x.title} onChange={e=>updateLine(i,{ title:e.target.value })} className="w-full border rounded px-2 py-1" /></td>
                    <td className="p-2"><input value={x.description||''} onChange={e=>updateLine(i,{ description:e.target.value })} className="w-full border rounded px-2 py-1" /></td>
                    <td className="p-2 text-right">
                      <input
                        inputMode="numeric"
                        pattern="[0-9.]*"
                        value={x.qty === 0 ? (x.qtyStr ?? '') : (x.qtyStr || String(x.qty))}
                        placeholder="0"
                        onFocus={e=> { if (x.qty === 0 && (!x.qtyStr || x.qtyStr==='0')) updateLine(i,{ qtyStr: '' }) }}
                        onChange={e=> { const raw=e.target.value.replace(/[^0-9.]/g,''); const num = raw ? parseFloat(raw) : 0; updateLine(i,{ qty: num, qtyStr: raw, manualAmount:false }) }}
                        onBlur={e=> { const raw=e.target.value.trim(); const num = raw? parseFloat(raw):0; const formatted = fmtNum(num); updateLine(i,{ qty: num, qtyStr: formatted }) }}
                        className="w-16 border rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <input
                        inputMode="decimal"
                        pattern="[0-9.]*"
                        value={x.price === 0 ? (x.priceStr ?? '') : (x.priceStr || String(x.price))}
                        placeholder="0"
                        onFocus={e=> { if (x.price === 0 && (!x.priceStr || x.priceStr==='0')) updateLine(i,{ priceStr: '' }) }}
                        onChange={e=> { const raw=e.target.value.replace(/[^0-9.]/g,''); const num = raw ? parseFloat(raw) : 0; updateLine(i,{ price: num, priceStr: raw, manualAmount:false }) }}
                        onBlur={e=> { const raw=e.target.value.trim(); const num = raw? parseFloat(raw):0; const formatted = fmtNum(num); updateLine(i,{ price: num, priceStr: formatted }) }}
                        className="w-24 border rounded px-2 py-1 text-right"
                      />
                    </td>
          <td className="p-2 text-right">
                      <input
                        inputMode="decimal"
                        pattern="[-0-9.]*"
                        value={x.manualAmount ? (x.amount ?? 0) : amount}
            onChange={e=> { const raw=e.target.value.replace(/[^0-9.-]/g,''); const val= raw? parseFloat(raw):0; updateLine(i,{ amount: val, manualAmount:true }) }}
            onBlur={e=> { const raw=e.target.value.trim(); const num = raw? parseFloat(raw):0; /* keep manual amount; no string state needed */ updateLine(i,{ amount: num, manualAmount:true }) }}
                        className="w-24 border rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="p-2 text-right"><button type="button" onClick={()=>removeLine(i)} className="text-xs text-red-600">✕</button></td>
                  </tr>
                )
              })}
              {items.length === 0 && <tr><td colSpan={7} className="p-4 text-sm text-gray-500">No line items</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between mt-4">
          <div className="flex gap-2">
            <button className="px-3 py-1 text-xs bg-gray-100 rounded" type="button" onClick={addLine}>Add line</button>
          </div>
          <div className="text-sm font-semibold">Total Due: {money(totalDue)}</div>
        </div>
        {/* Receive Payment button relocated directly beneath Total Due */}
        <div className="mt-3 flex justify-end gap-3">
          <button
            type="button"
            onClick={()=> {
              const primary = (inv as any).contact?.email || (inv as any).lead?.contact?.email || ''
              setSendRecipients(primary)
              setShowSend(true)
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
          >Send to Customer</button>
          <button
            type="button"
            onClick={()=> { const dueFull = Number(inv?.totalDue||0)||0; const fmt = dueFull>0? dueFull.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}):''; setShowReceive(true); setReceiveAmount(fmt) }}
            className="px-4 py-2 bg-emerald-600 text-white rounded text-sm"
          >Receive Payment</button>
        </div>
        <div className="mt-6">
          <label className="block text-xs font-semibold mb-1">Customer payment options (note)</label>
          <textarea defaultValue={"If you would like to pay online then we accept ACH bank transfers only. Otherwise please mail a check to 714A Route 6-A, Yarmouth Port, MA 02675. Thank you!"} className="w-full border rounded p-2 h-24 text-sm print:h-auto" />
        </div>
        <div className="mt-6">
          <label className="block text-xs font-semibold mb-1">Note to customer</label>
          <textarea className="w-full border rounded p-2 h-24 text-sm print:h-auto" />
        </div>
      </div>
      {showReceive && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/40 p-4" onMouseDown={(e)=> { if (e.target===e.currentTarget) setShowReceive(false) }}>
          <div className="bg-white w-full max-w-md rounded shadow-lg p-4 space-y-4" role="dialog" aria-modal="true">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Receive Payment</h2>
              <button onClick={()=> setShowReceive(false)} className="text-sm px-2 py-1 rounded bg-gray-100">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Invoice</span><span className="font-medium">{inv.number || 'Draft'}</span></div>
              <div className="flex justify-between"><span>Status</span><span className="font-medium">{inv.status || 'PENDING'}</span></div>
              <div className="flex justify-between"><span>Total Due</span><span className="font-bold">{money(Number(inv?.totalDue||0)||0)}</span></div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Amount Received</label>
                <input
                  value={receiveAmount}
                  onChange={(e)=> {
                    const raw = e.target.value.replace(/[^0-9.,]/g,'')
                    setReceiveAmount(raw)
                  }}
                  onBlur={(e)=> {
                    const raw = e.target.value.replace(/[^0-9.]/g,'')
                    const n = raw ? parseFloat(raw) : NaN
                    setReceiveAmount(Number.isFinite(n) && n>0 ? n.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}) : '')
                  }}
                  placeholder={remainingDue.toFixed(2)}
                  inputMode="decimal"
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Payment Method</label>
                <div className="flex gap-4 text-sm">
                  <label className="inline-flex items-center gap-1">
                    <input type="radio" name="recv-method" value="CHECK" checked={receiveMethod==='CHECK'} onChange={()=> setReceiveMethod('CHECK')} />
                    <span>Check</span>
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input type="radio" name="recv-method" value="CASH" checked={receiveMethod==='CASH'} onChange={()=> setReceiveMethod('CASH')} />
                    <span>Cash</span>
                  </label>
                </div>
              </div>
              {receiveMethod==='CHECK' && (
                <div>
                  <label className="block text-xs font-semibold mb-1">Check Number (optional)</label>
                  <input value={receiveRef} onChange={e=> setReceiveRef(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                disabled={receiving || !receiveAmount}
                onClick={receivePayment}
                className="px-3 py-1.5 rounded text-sm bg-emerald-600 text-white disabled:opacity-50"
              >{receiving? 'Saving…':'Save'}</button>
            </div>
          </div>
        </div>
      )}
      {showSend && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/40 p-4" onMouseDown={(e)=> { if (e.target===e.currentTarget) setShowSend(false) }}>
          <div className="bg-white w-full max-w-md rounded shadow-lg p-4 space-y-4" role="dialog" aria-modal="true">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Send Invoice</h2>
              <button onClick={()=> setShowSend(false)} className="text-sm px-2 py-1 rounded bg-gray-100">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Invoice</span><span className="font-medium">{inv.number || 'Draft'}</span></div>
              <div>
                <label className="block text-xs font-semibold mb-1">Recipient Emails (comma separated)</label>
                <textarea
                  value={sendRecipients}
                  onChange={e=> setSendRecipients(e.target.value)}
                  placeholder="customer@example.com, other@example.com"
                  className="w-full border rounded px-2 py-1 text-xs h-20"
                />
                <p className="text-[11px] text-gray-500 mt-1">Add multiple emails by separating with commas.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                disabled={sendingEmail}
                onClick={async()=> {
                  const list = sendRecipients.split(',').map(s=> s.trim()).filter(Boolean)
                  if (list.length === 0) { alert('Enter at least one email'); return }
                  setSendingEmail(true)
                  try {
                    const r = await fetch(`/api/invoices/${inv.id}/send`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ recipients: list.join(',') }) })
                    const j = await r.json()
                    if (!j.ok) throw new Error(j.error||'Send failed')
                    router.refresh()
                    setShowSend(false)
                  } catch(e:any){ alert(e.message||'Send failed') } finally { setSendingEmail(false) }
                }}
                className="px-3 py-1.5 rounded text-sm bg-blue-600 text-white disabled:opacity-50"
              >{sendingEmail? 'Sending…':'Send'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
