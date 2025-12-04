import { listAppointments, upsertAppointment } from './appointments'

export async function shiftAllJobs(days: number) {
  const all = await listAppointments({ jobOnly: true })
  const todayIso = new Date().toISOString().slice(0,10)
  const future = all.filter(j => (j.when||'').slice(0,10) > todayIso)
  const deltaMs = Math.round(days) * 24 * 60 * 60 * 1000
  let affected = 0
  for (const j of future) {
    try {
      const start = new Date(j.when)
      const next = new Date(start.getTime() + deltaMs)
      // Prevent shifting backward into today or past
      if (days < 0) {
        const nextIso = next.toISOString().slice(0,10)
        if (nextIso <= todayIso) continue
      }
      await upsertAppointment({ id: j.id, when: next.toISOString() })
      affected++
    } catch {}
  }
  return { ok: true, count: affected, totalFuture: future.length }
}

export async function submitJobCompletion(id: string, payload: { squares?: number; extrasJson?: string; attachments?: string[] }) {
  const squares = Number(payload?.squares ?? NaN)
  const safeSquares = isFinite(squares) ? squares : undefined
  const extrasJson = ((): string | undefined => {
    try { const v = String(payload?.extrasJson ?? '[]'); JSON.parse(v); return v } catch { return '[]' }
  })()
  const attachments = Array.isArray(payload?.attachments) ? payload!.attachments!.map(s=>String(s||'').trim()).filter(Boolean) : undefined
  try {
    const saved = await upsertAppointment({ id, jobStatus: 'submitted', completedAt: Date.now(), squares: safeSquares, extrasJson, attachments })
    return saved
  } catch (e:any) {
    console.error('[submitJobCompletion] failed for id', id, 'payload:', payload, 'error:', e)
    throw e
  }
}

export async function markMaterialOrdered(id: string, ordered: boolean) {
  return upsertAppointment({ id, materialOrdered: !!ordered })
}
