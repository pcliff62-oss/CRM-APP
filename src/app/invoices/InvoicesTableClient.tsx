"use client"
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type InvoiceRow = {
  id: string
  number?: string | null
  status?: string | null
  type?: string | null
  contractPrice?: number | null
  depositAmount?: number | null
  extrasTotal?: number | null
  totalDue?: number | null
  emailedAt?: string | null
  viewedAt?: string | null
  paidAt?: string | null
  paidAmount?: number | null
  dueDate?: string | Date | null
  customerName?: string | null
  address?: string | null
  contactEmail?: string | null
  flags?: { overdue14?: boolean; open?: boolean; paid?: boolean }
}

const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })
const dateFmt = (d?: string | Date | null) => {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString() } catch { return '' }
}

const STATUS_ORDER = [
  'ALL', 'DEPOSITS', 'PENDING', 'SENT', 'VIEWED', 'OPEN', 'OVERDUE14', 'PAID'
] as const

type StatusKey = typeof STATUS_ORDER[number]

function useFiltered(items: InvoiceRow[], status: StatusKey) {
  return useMemo(() => {
    switch (status) {
      case 'DEPOSITS':
        // Show only unpaid deposit requests (status DEPOSIT)
        return items.filter(i => i.status === 'DEPOSIT' && (i as any).type === 'DEPOSIT')
      case 'PENDING':
        // Include all regular pending + any deposit invoice now marked PENDING after payment
        return items.filter(i => i.status === 'PENDING')
      case 'SENT':
        return items.filter(i => i.status === 'SENT' && (i as any).type !== 'DEPOSIT')
      case 'VIEWED':
        return items.filter(i => i.status === 'VIEWED' && (i as any).type !== 'DEPOSIT')
      case 'OPEN':
        return items.filter(i => i.flags?.open && (i as any).type !== 'DEPOSIT')
      case 'OVERDUE14':
        return items.filter(i => i.flags?.overdue14 && (i as any).type !== 'DEPOSIT')
      case 'PAID':
        // Only show fully settled invoices (remaining balance 0); exclude deposit type
        return items.filter(i => {
          if ((i as any).type === 'DEPOSIT') return false
          const due = Number(i.totalDue || 0)
          const paid = Number(i.paidAmount || 0)
          const remaining = due - paid
          return remaining <= 0 && (i.paidAt || i.status === 'PAID')
        })
      case 'ALL':
      default:
        return items
    }
  }, [items, status])
}

export default function InvoicesTableClient({ items }: { items: InvoiceRow[] }) {
  const router = useRouter()
  const [status, setStatus] = useState<StatusKey>('ALL')
  const [showReceive, setShowReceive] = useState(false)
  const [activeInvoice, setActiveInvoice] = useState<InvoiceRow | null>(null)
  const [showSend, setShowSend] = useState(false)
  const [sendInvoice, setSendInvoice] = useState<InvoiceRow | null>(null)
  const [sendRecipients, setSendRecipients] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const filtered = useFiltered(items, status)
  const counts = useMemo(() => ({
    ALL: items.length,
  DEPOSITS: items.filter(i => (i as any).type === 'DEPOSIT' && i.status === 'DEPOSIT').length,
    PENDING: items.filter(i => i.status === 'PENDING').length,
    SENT: items.filter(i => i.status === 'SENT' && (i as any).type !== 'DEPOSIT').length,
    VIEWED: items.filter(i => i.status === 'VIEWED' && (i as any).type !== 'DEPOSIT').length,
    OPEN: items.filter(i => i.flags?.open && (i as any).type !== 'DEPOSIT').length,
    OVERDUE14: items.filter(i => i.flags?.overdue14 && (i as any).type !== 'DEPOSIT').length,
    PAID: items.filter(i => {
      if ((i as any).type === 'DEPOSIT') return false
      const due = Number(i.totalDue || 0)
      const paid = Number(i.paidAmount || 0)
      return (due - paid) <= 0 && (i.paidAt || i.status === 'PAID')
    }).length,
  }), [items]) as Record<StatusKey, number>
  const totals = useMemo(() => ({
    ALL: items.reduce((s, i) => s + (Number(i.totalDue || 0) || 0), 0),
  DEPOSITS: items.filter(i => (i as any).type === 'DEPOSIT' && i.status === 'DEPOSIT').reduce((s,i)=> s + (Number(i.totalDue||0)||0), 0),
    PENDING: items.filter(i => i.status === 'PENDING').reduce((s,i)=> s + (Number(i.totalDue||0)||0), 0),
    SENT: items.filter(i => i.status === 'SENT' && (i as any).type !== 'DEPOSIT').reduce((s,i)=> s + (Number(i.totalDue||0)||0), 0),
    VIEWED: items.filter(i => i.status === 'VIEWED' && (i as any).type !== 'DEPOSIT').reduce((s,i)=> s + (Number(i.totalDue||0)||0), 0),
    OPEN: items.filter(i => i.flags?.open && (i as any).type !== 'DEPOSIT').reduce((s,i)=> s + (Number(i.totalDue||0)||0), 0),
    OVERDUE14: items.filter(i => i.flags?.overdue14 && (i as any).type !== 'DEPOSIT').reduce((s,i)=> s + (Number(i.totalDue||0)||0), 0),
    PAID: items.filter(i => {
      if ((i as any).type === 'DEPOSIT') return false
      const due = Number(i.totalDue || 0)
      const paid = Number(i.paidAmount || 0)
      return (due - paid) <= 0 && (i.paidAt || i.status === 'PAID')
    }).reduce((s,i)=> s + (Number(i.totalDue||0)||0), 0),
  }), [items]) as Record<StatusKey, number>

  const baseColors: Record<StatusKey, string> = {
    ALL: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
    DEPOSITS: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200',
    PENDING: 'bg-sky-100 text-sky-800 hover:bg-sky-200',
    SENT: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
    VIEWED: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200',
    OPEN: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
    OVERDUE14: 'bg-orange-100 text-orange-900 hover:bg-orange-200',
    PAID: 'bg-green-100 text-green-800 hover:bg-green-200',
  }
  const activeColors: Record<StatusKey, string> = {
    ALL: 'bg-slate-700 text-white',
    DEPOSITS: 'bg-cyan-600 text-white',
    PENDING: 'bg-sky-600 text-white',
    SENT: 'bg-purple-600 text-white',
    VIEWED: 'bg-indigo-600 text-white',
    OPEN: 'bg-gray-600 text-white',
    OVERDUE14: 'bg-orange-500 text-white',
    PAID: 'bg-green-600 text-white',
  }

  function openReceive(inv: InvoiceRow) {
    setActiveInvoice(inv)
    setShowReceive(true)
  }

  function openSend(inv: InvoiceRow) {
    // Prepopulate with customer email if present
  const primary = inv.contactEmail || ''
  const guessed = primary
    setSendRecipients(guessed)
    setSendInvoice(inv)
    setShowSend(true)
  }

  async function submitSend() {
    if (!sendInvoice) return
    // Normalize recipients
    const list = sendRecipients.split(',').map(s=> s.trim()).filter(Boolean)
    if (list.length === 0) { alert('Enter at least one email'); return }
    setSendingEmail(true)
    try {
      const r = await fetch(`/api/invoices/${sendInvoice.id}/send`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ recipients: list.join(',') }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error||'Send failed')
      router.refresh()
      setShowSend(false)
      setSendInvoice(null)
    } catch(e:any){ alert(e.message||'Send failed') } finally { setSendingEmail(false) }
  }

  function closeReceive() {
    setShowReceive(false)
    setActiveInvoice(null)
  }

  function remainingFor(inv: InvoiceRow) {
    if (inv.type === 'DEPOSIT') return Number(inv.totalDue || (Number(inv.contractPrice||0)*0.5) || 0)
    // Remaining = totalDue - paidAmount (uniform)
    // For regular invoice: totalDue minus any paidAmount
    const due = Number(inv.totalDue || 0)
    const paid = Number(inv.paidAmount || 0)
    const rem = due - paid
    return rem > 0 ? rem : 0
  }

  function ReceivePaymentModal({ invoice }: { invoice: InvoiceRow }) {
  // Prefill with full Total Due instead of remaining balance
  const suggested = Number(invoice.totalDue || 0) || 0
    const [method, setMethod] = useState<'CASH'|'CHECK'>('CHECK')
  const [amountInput, setAmountInput] = useState<string>(suggested ? suggested.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}) : '')
    const [checkNumber, setCheckNumber] = useState('')
    const [sending, setSending] = useState(false)
    const parsedAmount = (()=> {
      const raw = amountInput.replace(/[^0-9.]/g,'')
      const n = raw ? parseFloat(raw) : NaN
      return Number.isFinite(n) ? Math.round(n*100)/100 : NaN
    })()
    const valid = Number.isFinite(parsedAmount) && parsedAmount > 0
    const displayAmount = valid ? fmt.format(parsedAmount) : '$0.00'

    async function submit(sendAfter: boolean) {
      if (!valid) return
      try {
        setSending(true)
        const payload: any = { amount: parsedAmount, method, ref: method==='CHECK'? (checkNumber||'') : '' }
        const r = await fetch(`/api/invoices/${invoice.id}/receive`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        const j = await r.json()
        if (!j.ok) throw new Error(j.error || 'Receive failed')
        if (sendAfter) {
          try { await fetch(`/api/invoices/${invoice.id}/send`, { method:'POST' }) } catch {}
        }
        // Refresh by soft reloading router (query param to bust cache) or full reload
        router.refresh()
        closeReceive()
      } catch (e:any) {
        alert(e.message || String(e))
      } finally {
        setSending(false)
      }
    }

    return (
      <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/40 p-4" onMouseDown={(e)=> { if (e.target===e.currentTarget) closeReceive() }}>
        <div className="bg-white w-full max-w-md rounded shadow-lg p-4 space-y-4" role="dialog" aria-modal="true">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Receive Payment</h2>
            <button onClick={closeReceive} className="text-sm px-2 py-1 rounded bg-gray-100">✕</button>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Invoice</span><span className="font-medium">{invoice.number || 'Draft'}</span></div>
            <div className="flex justify-between"><span>Status</span><span className="font-medium">{invoice.status || 'PENDING'}</span></div>
            <div className="flex justify-between"><span>Remaining Due</span><span className="font-bold">{fmt.format(suggested)}</span></div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Amount Received</label>
              <input
                value={amountInput}
                onChange={(e)=> {
                  // Allow commas and dollar sign then normalize
                  const raw = e.target.value.replace(/[^0-9.,]/g,'')
                  // Force two decimals when leaving field (handled on blur)
                  setAmountInput(raw)
                }}
                onBlur={(e)=> {
                  const raw = e.target.value.replace(/[^0-9.]/g,'')
                  const n = raw ? parseFloat(raw) : NaN
                  setAmountInput(Number.isFinite(n) && n>0 ? n.toFixed(2) : '')
                }}
                placeholder={suggested.toFixed(2)}
                inputMode="decimal"
                className="w-full border rounded px-2 py-1 text-sm"
              />
              <div className="text-xs text-gray-500 mt-1">Formatted: <span className="font-medium">{displayAmount}</span></div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Payment Method</label>
              <div className="flex gap-4 text-sm">
                <label className="inline-flex items-center gap-1">
                  <input type="radio" name="method" value="CHECK" checked={method==='CHECK'} onChange={()=> setMethod('CHECK')} />
                  <span>Check</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input type="radio" name="method" value="CASH" checked={method==='CASH'} onChange={()=> setMethod('CASH')} />
                  <span>Cash</span>
                </label>
              </div>
            </div>
            {method==='CHECK' && (
              <div>
                <label className="block text-xs font-semibold mb-1">Check Number (optional)</label>
                <input value={checkNumber} onChange={e=> setCheckNumber(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              disabled={!valid || sending}
              onClick={()=> submit(false)}
              className="px-3 py-1.5 rounded text-sm bg-emerald-600 text-white disabled:opacity-50"
            >{sending? 'Saving…':'Save'}</button>
            <button
              disabled={!valid || sending}
              onClick={()=> submit(true)}
              className="px-3 py-1.5 rounded text-sm bg-blue-600 text-white disabled:opacity-50"
            >{sending? 'Sending…':'Save & Send'}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-stretch">
        {STATUS_ORDER.map(s => {
          const isActive = status === s
          const label = s === 'OVERDUE14' ? 'Overdue 14d' : (s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase())
          const classes = isActive ? activeColors[s] : baseColors[s]
          return (
            <button
              key={s}
              className={`px-3 py-2 rounded text-sm font-medium min-w-[140px] text-left ${classes}`}
              onClick={() => setStatus(s)}
              aria-pressed={isActive}
            >
              <div className="text-[13px] font-semibold">{fmt.format(totals[s] ?? 0)}</div>
              <div className="flex items-center gap-2">
                <span>{label}</span>
                <span className="text-xs opacity-80">{counts[s] ?? 0}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Spreadsheet table */}
      <div className="relative border rounded bg-white overflow-x-auto">
        {/* Full-width gradient overlay behind header */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 rounded-t" />
        <table className="relative z-[1] min-w-full text-sm border-collapse">
          <thead className="text-white">
            <tr className="text-left">
              <th className="p-2 bg-transparent">Number</th>
              <th className="p-2 bg-transparent">Status</th>
              <th className="p-2 bg-transparent">Customer</th>
              <th className="p-2 bg-transparent">Address</th>
              <th className="p-2 text-right bg-transparent">Contract</th>
              <th className="p-2 text-right bg-transparent">Deposit</th>
              <th className="p-2 text-right bg-transparent">Extras</th>
              <th className="p-2 text-right bg-transparent">Total Due</th>
              <th className="p-2 bg-transparent">Due</th>
              <th className="p-2 bg-transparent">Emailed</th>
              <th className="p-2 bg-transparent">Viewed</th>
              <th className="p-2 bg-transparent">Paid</th>
              <th className="p-2 bg-transparent">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(i => (
              <tr
                key={i.id}
                className="border-t hover:bg-gray-50 cursor-pointer"
                tabIndex={0}
                onClick={() => router.push(`/invoices/${i.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/invoices/${i.id}`) } }}
              >
                <td className="p-2 font-medium text-blue-700">{i.number || 'Draft'}</td>
                <td className="p-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{i.status || 'PENDING'}</span>
                    {i.flags?.overdue14 && <span className="text-xs px-2 py-0.5 rounded bg-orange-200 text-orange-900">Overdue</span>}
                    {i.flags?.open && <span className="text-xs px-2 py-0.5 rounded bg-gray-200">Open</span>}
                    {i.paidAt && i.status === 'PENDING' && (Number(i.depositAmount||0) > 0) && (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-200 text-green-900">Deposit received</span>
                    )}
                    {(() => {
                      if (i.paidAt) {
                        const due = Number(i.totalDue||0)
                        const paid = Number(i.paidAmount||0)
                        if ((i as any).type !== 'DEPOSIT' && (due - paid) <= 0) {
                          return <span className="text-xs px-2 py-0.5 rounded bg-green-200 text-green-900">Paid</span>
                        }
                      }
                      return null
                    })()}
                    {(i as any).type === 'DEPOSIT' && i.status === 'DEPOSIT' && (
                      <span className="text-xs px-2 py-0.5 rounded bg-cyan-100 text-cyan-800">Deposit</span>
                    )}
                  </span>
                </td>
                <td className="p-2">{i.customerName || ''}</td>
                <td className="p-2">{i.address || ''}</td>
                <td className="p-2 text-right">{fmt.format(i.contractPrice ?? 0)}</td>
                <td className="p-2 text-right">{fmt.format(i.depositAmount ?? 0)}</td>
                <td className="p-2 text-right">{fmt.format(i.extrasTotal ?? 0)}</td>
                <td className="p-2 text-right font-semibold">{fmt.format(i.totalDue ?? 0)}</td>
                <td className="p-2">{dateFmt(i.dueDate)}</td>
                <td className="p-2">{dateFmt(i.emailedAt)}</td>
                <td className="p-2">{dateFmt(i.viewedAt)}</td>
                <td className="p-2">{dateFmt(i.paidAt)}</td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <button
                      className="text-emerald-700 underline"
                      onClick={(e)=> { e.stopPropagation(); openReceive(i) }}
                    >Receive Payment</button>
                    <button
                      type="button"
                      className="text-green-700 underline"
                      onClick={(e)=> { e.stopPropagation(); openSend(i) }}
                    >Send</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td className="p-4 text-gray-500" colSpan={13}>No invoices</td></tr>
            )}
          </tbody>
        </table>
      </div>
  {showReceive && activeInvoice && <ReceivePaymentModal invoice={activeInvoice} />}
  {showSend && sendInvoice && (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/40 p-4" onMouseDown={(e)=> { if (e.target===e.currentTarget) setShowSend(false) }}>
      <div className="bg-white w-full max-w-md rounded shadow-lg p-4 space-y-4" role="dialog" aria-modal="true">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Send Invoice</h2>
          <button onClick={()=> setShowSend(false)} className="text-sm px-2 py-1 rounded bg-gray-100">✕</button>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span>Invoice</span><span className="font-medium">{sendInvoice.number || 'Draft'}</span></div>
          <div>
            <label className="block text-xs font-semibold mb-1">Recipient Emails (comma separated)</label>
            <textarea
              value={sendRecipients}
              onChange={e=> setSendRecipients(e.target.value)}
              placeholder="customer@example.com, other@example.com"
              className="w-full border rounded px-2 py-1 text-xs h-20"
            />
            <p className="text-[11px] text-gray-500 mt-1">Add multiple emails by separating with commas. Primary auto-filled.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            disabled={sendingEmail}
            onClick={submitSend}
            className="px-3 py-1.5 rounded text-sm bg-blue-600 text-white disabled:opacity-50"
          >{sendingEmail ? 'Sending…':'Send'}</button>
        </div>
      </div>
    </div>
  )}
    </div>
  )
}
