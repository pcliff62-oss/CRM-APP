import { useEffect, useState } from 'react'
import { apiFetch, API_BASE } from '../../apiClient.js'

export default function Diagnostics() {
  const [loading, setLoading] = useState(false)
  const [diag, setDiag] = useState({ health: null, full: null, durationMs: null, error: null })

  async function load() {
    setLoading(true)
    const started = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    try {
      const [r1, r2] = await Promise.all([
        apiFetch('/api/health'),
        apiFetch('/api/health/full'),
      ])
      if (!r1.ok) throw new Error(`Health HTTP ${r1.status}`)
      if (!r2.ok) throw new Error(`Full HTTP ${r2.status}`)
      const [health, full] = await Promise.all([
        r1.json().catch(() => ({})),
        r2.json().catch(() => ({})),
      ])
      const ended = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
      setDiag({ health, full, durationMs: Math.round(ended - started), error: null })
    } catch (e) {
      const ended = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
      setDiag({ health: null, full: null, durationMs: Math.round(ended - started), error: e?.message || String(e) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const healthOk = diag.health?.ok === true
  const fullOk = diag.full?.ok === true
  const bothSucceeded = !diag.error && diag.health && diag.full

  return (
    <div className="p-4">
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Diagnostics</div>
          <button
            className="text-sm rounded-xl border border-neutral-300 px-3 py-1"
            onClick={load}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <div className="text-xs text-neutral-500">API: {API_BASE || '(proxy)'}</div>

        <div className="text-sm flex items-center gap-2">
          <span>Health:</span>
          <span>{healthOk ? '✅' : '❌'}</span>
          {bothSucceeded && (
            <span className="text-neutral-500">({diag.durationMs} ms)</span>
          )}
        </div>
        <div className="text-sm flex items-center gap-2">
          <span>Full:</span>
          <span>{fullOk ? '✅' : '❌'}</span>
        </div>
        {diag.full?.gcs?.bucket && (
          <div className="text-sm text-neutral-700">Bucket: <span className="font-medium">{diag.full.gcs.bucket}</span></div>
        )}
        {diag.full?.customers?.count != null && (
          <div className="text-sm text-neutral-700">Customers: <span className="font-medium">{diag.full.customers.count}</span></div>
        )}
        {diag.error && (
          <div className="text-sm text-red-600">Error: {diag.error}</div>
        )}
        {loading && <div className="text-sm text-neutral-500">Loading…</div>}
      </div>
    </div>
  )
}
