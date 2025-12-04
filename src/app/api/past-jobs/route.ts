import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseExtras(json?: string): Array<{ title: string; price: number }> {
  try {
    const arr = JSON.parse(json || '[]')
    if (!Array.isArray(arr)) return []
    return arr.map((x: any) => ({ title: String(x?.title || '').trim(), price: Number(x?.price) || 0 }))
  } catch { return [] }
}

// GET /api/past-jobs?assignedTo=<email>
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const assignedTo = (searchParams.get('assignedTo') || '').trim().toLowerCase()
  // In this starter, we don't have multi-tenant auth wired; return all unless filtered
  const items = await prisma.pastJob.findMany({ orderBy: { completedAt: 'desc' }, take: 200 }).catch(() => [] as any[])
  let filtered = items
  if (assignedTo) {
    let crewIdFromUser: string | null = null
    try {
      const u = await prisma.user.findFirst({ where: { email: assignedTo } })
      crewIdFromUser = u?.id || null
    } catch {}
    filtered = items.filter((it: any) => {
      const v = String(it?.crewUserId || '').toLowerCase()
      return v === assignedTo || (crewIdFromUser ? v === crewIdFromUser.toLowerCase() : false)
    })
  }
  const out = filtered.map((it: any) => {
    const extras = parseExtras(it.extrasJson || '[]')
    let attachments: Array<{ id: string; name: string; url: string }> = []
    try {
      const arr = JSON.parse(it.attachmentsJson || '[]')
      if (Array.isArray(arr)) attachments = arr.map((x: any, i: number) => ({ id: String(x?.id||`att-${i}`), name: String(x?.name||'file'), url: String(x?.url||x?.path||'') }))
    } catch {}
    let adjustments: any = null
    try {
      const a = JSON.parse(it.adjustmentsJson || 'null')
      if (a && typeof a === 'object') adjustments = a
    } catch {}
    const extrasTotal = Number.isFinite(Number(it.extrasTotal)) ? Number(it.extrasTotal) : extras.reduce((s, x) => s + (Number(x.price) || 0), 0)
    const installTotal = Number.isFinite(Number(it.installTotal)) ? Number(it.installTotal) : ((Number(isFinite(Number(it.usedSquares)) ? it.usedSquares : it.squares) || 0) * (Number(it.ratePerSquare) || 0))
    const grandTotal = Number.isFinite(Number(it.grandTotal)) ? Number(it.grandTotal) : (installTotal + extrasTotal)
    return {
      id: it.id,
      leadId: it.leadId,
      appointmentId: it.appointmentId,
      crewUserId: it.crewUserId,
      customerName: it.customerName || 'Job',
      address: it.address || '',
      squares: it.squares ?? null,
      usedSquares: it.usedSquares ?? null,
      rateTier: it.rateTier || null,
      ratePerSquare: it.ratePerSquare ?? null,
      installTotal,
      extras,
      extrasTotal,
      grandTotal,
  attachments,
  adjustments,
      completedAt: it.completedAt,
    }
  })
  return NextResponse.json({ ok: true, items: out })
}

// POST /api/past-jobs
// body: { leadId?, appointmentId?, crewUserId?, customerName?, address?, squares?, extrasJson?, completedAt? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data: any = {}
  const fields = ['leadId','appointmentId','crewUserId','customerName','address','extrasJson','attachmentsJson','adjustmentsJson','rateTier']
    for (const k of fields) if (k in body) data[k] = body[k]
    if ('squares' in body) { const n = Number(body.squares); if (Number.isFinite(n)) data.squares = n }
  if ('usedSquares' in body) { const n = Number(body.usedSquares); if (Number.isFinite(n)) data.usedSquares = n }
  if ('ratePerSquare' in body) { const n = Number(body.ratePerSquare); if (Number.isFinite(n)) data.ratePerSquare = n }
  if ('installTotal' in body) { const n = Number(body.installTotal); if (Number.isFinite(n)) data.installTotal = n }
  if ('extrasTotal' in body) { const n = Number(body.extrasTotal); if (Number.isFinite(n)) data.extrasTotal = n }
  if ('grandTotal' in body) { const n = Number(body.grandTotal); if (Number.isFinite(n)) data.grandTotal = n }
    if ('completedAt' in body) { const d = new Date(body.completedAt); if (!isNaN(+d)) data.completedAt = d as any }

    // naive tenant mapping (first tenant) for starter DB; in real app derive from auth
    const tenant = await prisma.tenant.findFirst()
    if (!tenant) return NextResponse.json({ ok: false, error: 'No tenant found' }, { status: 500 })
    data.tenantId = tenant.id

    if (typeof data.extrasJson === 'string') {
      try { JSON.parse(data.extrasJson) } catch { data.extrasJson = '[]' }
    }

    const created = await prisma.pastJob.create({ data })
    return NextResponse.json({ ok: true, item: { id: created.id } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
