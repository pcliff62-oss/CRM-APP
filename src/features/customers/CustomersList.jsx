import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../apiClient.js'

// Small subcomponents for card UI
function StatusChip({ status }) {
  if (!status) return null
  const s = String(status).trim().toLowerCase()
  const tone = (
    s === 'lead' ? { bg: 'bg-amber-50', border: 'border-amber-200', fg: 'text-amber-800' } :
    { bg: 'bg-neutral-50', border: 'border-neutral-200', fg: 'text-neutral-700' }
  )
  return (
    <div className={`min-w-[48px] h-8 px-2 inline-flex items-center justify-center rounded-md border text-[12px] font-medium ${tone.bg} ${tone.border} ${tone.fg}`}>
      {status}
    </div>
  )
}

function IconBtn({ ariaLabel, href, onClick, children, disabled }) {
  const common = "w-9 h-9 inline-flex items-center justify-center rounded-md border text-neutral-700 bg-white"
  const enabled = "border-neutral-300 active:scale-[0.98]"
  const off = "border-neutral-200 text-neutral-400 pointer-events-none"
  if (href) {
    return (
      <a aria-label={ariaLabel} href={href} onClick={(e)=>{ e.stopPropagation(); onClick?.(e) }} className={`${common} ${disabled ? off : enabled}`}>{children}</a>
    )
  }
  return (
    <button aria-label={ariaLabel} onClick={(e)=>{ e.stopPropagation(); onClick?.(e) }} className={`${common} ${disabled ? off : enabled}`}>{children}</button>
  )
}

export default function CustomersList({ onOpen, onNew, statusFilter = 'All' }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Search state with debounce
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  function sanitizePhone(s){
    return String(s || '').replace(/[^0-9+]/g, '')
  }

  async function load() {
    try {
      setLoading(true)
      setError(null)
  const res = await apiFetch('/api/customers')
      if (!res.ok) throw new Error('Fetch customers failed: ' + res.status)
      const data = await res.json()
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch (e) {
      console.error('[CustomersList] load error', e)
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const handler = () => load()
    window.addEventListener('customers:refresh', handler)
    return () => window.removeEventListener('customers:refresh', handler)
  }, [])

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div className="px-3 space-y-3">
      {/* Removed legacy New button per design */}

      {/* Sticky search + New button row (below external Status dropdown) */}
      <div className="sticky top-0 z-10 bg-white pb-2 pt-2">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or town…"
            className="flex-1 min-w-0 rounded-xl border border-neutral-300 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-blue-500"
          />
          {/* Keep onNew support but do not render a visible button here */}
          <div className="hidden">
            <button type="button" onClick={(e)=>{ e.preventDefault(); onNew?.() }} aria-hidden>New</button>
          </div>
        </div>
      </div>
      {loading && <div>Loading…</div>}
      {error && <div style={{color:'crimson'}}>Error: {String(error)}</div>}
      {(() => {
        const normalized = (statusFilter || 'All').toLowerCase()
        const filtered = normalized === 'all' ? items : items.filter(it => (it.status || '').toLowerCase() === normalized)
        const q = (debouncedQuery || '').trim().toLowerCase()
        const final = q
          ? filtered.filter(it => (
              ((it.name || '') + ' ' + (it.town || it.city || '') + ' ' + (it.status || ''))
                .toLowerCase()
                .includes(q)
            ))
          : filtered
        const count = final.length
        const countText = q && count === 0 ? 'No results' : `${count} ${count === 1 ? 'customer' : 'customers'}`
        return (
          <>
            <div className="text-xs text-neutral-500 px-1 pb-1">{countText}</div>
            {!loading && !error && final.length === 0 && <div>No customers yet.</div>}
            <ul className="grid gap-3">
              {final.map(it => {
                  const name = (it.name || '(no name)')
                  const status = (it.status || '').trim()
                  const phone = (it.phone || '').trim()
                  const email = (it.email || '').trim()
                  const town = (it.town || it.city || '').trim()
                  const address = (it.address || '').trim()
                  const createdMs = (typeof it.createdAt === 'number' ? it.createdAt : (typeof it.updatedAt === 'number' ? it.updatedAt : null))
                  const created = createdMs ? new Date(createdMs) : null
                  const createdText = created
                    ? created.toLocaleDateString('en-US', created.getFullYear() === new Date().getFullYear()
                        ? { month:'short', day:'2-digit' }
                        : { month:'short', day:'2-digit', year:'numeric' }
                      )
                    : null
                  const telHref = phone ? `tel:${sanitizePhone(phone)}` : '#'
                  const smsHref = phone ? `sms:${sanitizePhone(phone)}` : '#'
                  const mailHref = email ? `mailto:${email}` : '#'
                  const mapQuery = encodeURIComponent([address, town].filter(Boolean).join(', '))
                  const mapHref = mapQuery ? `https://maps.apple.com/?q=${mapQuery}` : '#'

                  return (
                    <li
                      key={it.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open customer ${it.name || 'unknown'}`}
                      onClick={() => onOpen && onOpen(it)}
                      onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); onOpen && onOpen(it) } }}
                      className="rounded-2xl border border-neutral-200 bg-white p-3 md:p-3.5 shadow-sm cursor-pointer select-none leading-tight"
                    >
                      <div className="space-y-2">
                        {/* Top row: name left, status chip right */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 pr-2">
                            <div className="text-[17px] font-semibold truncate">{name}</div>
                          </div>
                          <StatusChip status={status} />
                        </div>

                        {/* Address + Town single line */}
                        {(address || town) && (
                          <div className="text-[14px] text-neutral-600 truncate">
                            {address}
                            {(address && town) ? <span className="mx-1">·</span> : null}
                            {(!address && town) ? town : (address && town ? town : null)}
                          </div>
                        )}

                        {/* Actions row + Footer date in one row */}
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center gap-2">
                            <IconBtn ariaLabel={`Call ${name}`} href={telHref} disabled={!phone}><PhoneIcon /></IconBtn>
                            <IconBtn ariaLabel={`Text ${name}`} href={smsHref} disabled={!phone}><ChatIcon /></IconBtn>
                            <IconBtn ariaLabel={`Email ${name}`} href={mailHref} disabled={!email}><MailIcon /></IconBtn>
                            <IconBtn ariaLabel={`Navigate to ${address || town}`} href={mapHref} disabled={!mapQuery}><MapPinIcon /></IconBtn>
                          </div>
                          {createdText && (
                            <div className="text-[12px] text-neutral-500">Created {createdText}</div>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
            </ul>
          </>
        )
      })()}
    </div>
  )
}

function PhoneIcon(){
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 5a2 2 0 0 1 2-2h2.1a1 1 0 0 1 .95.68l1.1 3.3a1 1 0 0 1-.24 1.02l-1.7 1.7a14 14 0 0 0 7.2 7.2l1.7-1.7a1 1 0 0 1 1.02-.24l3.3 1.1a1 1 0 0 1 .68.95V20a2 2 0 0 1-2 2h-1C9.82 22 2 14.18 2 5v0Z" />
    </svg>
  )
}

function ChatIcon(){
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H9.5L6 19.5V16H7a3 3 0 0 1-3-3V6Z" />
    </svg>
  )
}

function MailIcon(){
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7l8 5 8-5" />
    </svg>
  )
}

function MapPinIcon(){
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s7-5.373 7-12a7 7 0 1 0-14 0c0 6.627 7 12 7 12Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}
