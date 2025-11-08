import React, { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../apiClient.js'

function StatusBadge({ status }) {
  const s = String(status || 'todo').toLowerCase()
  const tone = (
    s === 'done' ? { bg:'bg-emerald-50', border:'border-emerald-200', fg:'text-emerald-800' } :
    s === 'doing' ? { bg:'bg-sky-50', border:'border-sky-200', fg:'text-sky-800' } :
    s === 'blocked' ? { bg:'bg-rose-50', border:'border-rose-200', fg:'text-rose-800' } :
    { bg:'bg-amber-50', border:'border-amber-200', fg:'text-amber-800' }
  )
  return (
    <span className={`inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone.bg} ${tone.border} ${tone.fg}`}>
      {status || 'todo'}
    </span>
  )
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v7M14 11v7" />
    </svg>
  )
}

export default function TasksList({ customerId }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('med')
  const dateRef = useRef(null)

  const fetchTasks = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/tasks')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const list = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])
      const cid = String(customerId)
      // Ensure priority defaulting for older tasks
      const filtered = list
        .filter(t => String(t?.customerId ?? '') === cid)
        .map(t => {
          const pr = String(t?.priority || '').toLowerCase()
          const normalized = (pr === 'low' || pr === 'med' || pr === 'high') ? pr : 'med'
          const dAt = typeof t?.dueAt === 'string' ? t.dueAt : undefined
          const dDate = typeof t?.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) ? t.dueDate : undefined
          return { ...t, priority: normalized, dueAt: dAt, dueDate: dDate }
        })
      setTasks(filtered)
    } catch (e) {
      console.error('[TasksList] load error', e)
      setError('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  async function handleAdd(e) {
    e?.preventDefault?.()
    const v = title.trim()
    if (!v || !customerId) return
    try {
      const body = {
        title: v,
        status: 'todo',
        customerId,
        priority,
        ...(dueDate ? { dueDate } : {}),
      }
      const res = await apiFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setTitle('')
      setDueDate('')
      setPriority('med')
      await fetchTasks()
    } catch (e) {
      console.error('[TasksList] create error', e)
    }
  }

  async function handleDelete(id) {
    if (!id) return
    try {
      const res = await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchTasks()
    } catch (e) {
      console.error('[TasksList] delete error', e)
    }
  }

  // Sorting comparator: dueAt asc (undefined last), then priority order high>med>low, then createdAt desc
  function cmp(a, b) {
    const da = a?.dueDate ? Date.parse(a.dueDate) : (a?.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY)
    const db = b?.dueDate ? Date.parse(b.dueDate) : (b?.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY)
    const ta = Number.isNaN(da) ? Number.POSITIVE_INFINITY : da
    const tb = Number.isNaN(db) ? Number.POSITIVE_INFINITY : db
    if (ta !== tb) return ta - tb
    const rank = { high: 0, med: 1, low: 2 }
    const ra = rank[String(a?.priority || 'med').toLowerCase()] ?? 1
    const rb = rank[String(b?.priority || 'med').toLowerCase()] ?? 1
    if (ra !== rb) return ra - rb
    const ca = Number(a?.createdAt || 0)
    const cb = Number(b?.createdAt || 0)
    return cb - ca
  }
  const sorted = [...tasks].sort(cmp)

  // Display helper for local YYYY-MM-DD -> MM/DD/YY
  function formatDisplayDate(iso) {
    if (!iso) return ''
    const parts = String(iso).split('-')
    if (parts.length !== 3) return ''
    const [y, m, d] = parts
    return `${m}/${d}/${String(y).slice(2)}`
  }

  function fmtDue(d) {
    if (!d) return ''
    const n = new Date(d)
    if (Number.isNaN(n.getTime())) return ''
    return n.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
  }

  return (
    <div className="space-y-2">
      {loading && <div className="text-sm text-neutral-500">Loading…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && tasks.length === 0 && (
        <div className="text-sm text-neutral-600">No tasks yet.</div>
      )}

      <ul className="grid">
        {sorted.map(t => {
          const isDone = String(t?.status || '').toLowerCase() === 'done'
          const pr = String(t?.priority || 'med').toLowerCase()
          const dotClass = pr === 'high' ? 'bg-rose-500' : pr === 'low' ? 'bg-neutral-400' : 'bg-amber-500'
          return (
            <li
              key={t.id}
              onClick={async () => {
                try {
                  const next = isDone ? 'todo' : 'done'
                  const r = await apiFetch(`/api/tasks/${t.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: next })
                  })
                  if (!r.ok) {
                    // Fallback to POST upsert if PATCH not supported
                    await apiFetch('/api/tasks', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: t.id, status: next })
                    }).catch(()=>{})
                  }
                  await fetchTasks()
                } catch (e) {
                  console.error('[TasksList] toggle error', e)
                }
              }}
              className={
                'rounded-xl bg-white shadow-sm border border-neutral-200 p-3 mb-2 flex items-center justify-between gap-2 transition-colors duration-150 ' +
                (isDone ? 'opacity-80' : '')
              }
            >
              {/* Left: circular checkbox */}
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    const next = isDone ? 'todo' : 'done'
                    const r = await apiFetch(`/api/tasks/${t.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: next })
                    })
                    if (!r.ok) {
                      await apiFetch('/api/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: t.id, status: next })
                      }).catch(()=>{})
                    }
                    await fetchTasks()
                  } catch (err) {
                    console.error('[TasksList] toggle error', err)
                  }
                }}
                className={'w-6 h-6 rounded-full border transition-colors duration-150 flex items-center justify-center ' + (isDone ? 'bg-neutral-800 border-neutral-800' : 'border-neutral-400')}
                aria-label={isDone ? 'Mark as todo' : 'Mark as done'}
              >
                {/* Inner check fill indicator */}
                <div className={'w-2.5 h-2.5 rounded-full transition-colors duration-150 ' + (isDone ? 'bg-white' : 'bg-transparent')} />
              </button>

              {/* Center: title and due date */}
              <div className="min-w-0 flex-1">
                <div className={'truncate font-medium text-lg ' + (isDone ? 'line-through text-neutral-400' : 'text-neutral-900')}>
                  {t.title || '(untitled task)'}
                </div>
                {t.dueDate ? (
                  <div className="text-xs text-neutral-500">Due {formatDisplayDate(t.dueDate)}</div>
                ) : t.dueAt ? (
                  <div className="text-xs text-neutral-500">{fmtDue(t.dueAt)}</div>
                ) : null}
              </div>

              {/* Right: priority dot + delete */}
              <div className="flex items-center gap-2">
                <span className={'w-2.5 h-2.5 rounded-full ' + dotClass} aria-hidden="true" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(t.id) }}
                  className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-neutral-300 text-neutral-700 active:scale-[0.98]"
                  aria-label="Delete task"
                  title="Delete task"
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <form onSubmit={handleAdd} className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {/* Title input with inline calendar icon that opens hidden date picker */}
        <div className="relative flex-1 min-w-0">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New task…"
            className="w-full rounded-lg border border-neutral-300 bg-white pl-3 pr-20 py-2 text-sm shadow-sm focus:ring-1 focus:ring-blue-500"
          />
          {/* Hidden date input to keep native picker and value binding */}
          <input
            ref={dateRef}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="sr-only"
            aria-hidden
            tabIndex={-1}
          />
          {dueDate && (
            <span
              className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-xs text-neutral-500"
            >
              {formatDisplayDate(dueDate)}
            </span>
          )}
          <button
            type="button"
            onClick={() => (dateRef.current?.showPicker?.() ?? dateRef.current?.focus())}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-md border border-neutral-300 text-neutral-600"
            aria-label="Pick due date"
            title="Pick due date"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <rect x="3" y="5" width="18" height="16" rx="2" ry="2" />
              <path d="M16 3v4M8 3v4M3 11h18" />
            </svg>
          </button>
        </div>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="sm:w-28 rounded-md border border-neutral-300 px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="low">Low</option>
          <option value="med">Med</option>
          <option value="high">High</option>
        </select>
        <button type="submit" className="px-3 py-2 rounded-md border border-neutral-300 text-neutral-800 active:scale-[0.98]">
          Add
        </button>
      </form>
    </div>
  )
}
