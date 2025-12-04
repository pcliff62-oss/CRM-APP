import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/crew-payment-requests
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const paidFilter = url.searchParams.get('paid')
    const where: any = {}
    if (paidFilter === 'true') where.paid = true
    if (paidFilter === 'false') where.paid = false
  const raw = await prisma.crewPaymentRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }) as any[]
  const items: any[] = []
  for (const r of raw) {
      let pastJob: any = null
      if (r.pastJobId) {
        try { pastJob = await prisma.pastJob.findFirst({ where: { id: r.pastJobId } }) } catch {}
      }
      let crewName: string | null = null
      if (r.crewUserId) {
        try { const u = await prisma.user.findFirst({ where: { id: r.crewUserId } }); crewName = u?.name || null } catch {}
      }
      // Parse extras: prefer request's current extrasJson over pastJob snapshot so edits persist
      let extras: Array<{ title: string; price: number }> = []
      try {
        const rawExtrasSource = (r.extrasJson && r.extrasJson.trim().length>0) ? r.extrasJson : (pastJob?.extrasJson || '[]')
        const arr = JSON.parse(rawExtrasSource || '[]')
        if (Array.isArray(arr)) extras = arr.map((x: any) => ({ title: String(x?.title||'').trim(), price: Number(x?.price)||0 }))
      } catch {}
      let attachments: Array<{ id: string; name: string; url: string }> = []
      try {
  const arr = JSON.parse((pastJob?.attachmentsJson || r.attachmentsJson) || '[]')
        if (Array.isArray(arr)) attachments = arr.map((x: any, i: number) => ({ id: String(x?.id||`att-${i}`), name: String(x?.name||'file'), url: String(x?.url||x?.path||'') }))
      } catch {}
      // Adjustments (from field app)
      let adjustments: any = null
      try {
        const a = JSON.parse((pastJob?.adjustmentsJson || r.adjustmentsJson) || 'null')
        if (a && typeof a === 'object') adjustments = a
      } catch {}
      // Prefer editable CrewPaymentRequest fields over pastJob snapshot so user adjustments persist
      const usedSquares = (() => {
        if (Number.isFinite(Number(r.usedSquares))) return Number(r.usedSquares)
        if (Number.isFinite(Number(pastJob?.usedSquares))) return Number(pastJob.usedSquares)
        return Number(pastJob?.squares)||0
      })()
      const rate = Number.isFinite(Number(r.ratePerSquare)) ? Number(r.ratePerSquare) : (Number.isFinite(Number(pastJob?.ratePerSquare)) ? Number(pastJob.ratePerSquare) : 0)
      const installTotal = Number.isFinite(Number(r.installTotal)) ? Number(r.installTotal) : (Number.isFinite(Number(pastJob?.installTotal)) ? Number(pastJob.installTotal) : usedSquares * rate)
  // Derive extrasTotal: prefer stored request value; else recompute from its extras array; fall back to pastJob
  const extrasTotal = Number.isFinite(Number(r.extrasTotal)) ? Number(r.extrasTotal) : extras.reduce((s,x)=>s+(Number(x.price)||0),0) || (Number.isFinite(Number(pastJob?.extrasTotal)) ? Number(pastJob.extrasTotal) : 0)
      const grandTotal = Number.isFinite(Number(r.grandTotal)) ? Number(r.grandTotal) : (Number.isFinite(Number(pastJob?.grandTotal)) ? Number(pastJob.grandTotal) : installTotal + extrasTotal)
  items.push({
        id: r.id,
        createdAt: r.createdAt,
        appointmentId: r.appointmentId,
        pastJobId: r.pastJobId,
        crewUserId: r.crewUserId,
        crewName,
  // salesPersonName removed; sales requests now separate model
  amount: r.amount ?? grandTotal,
        customerName: pastJob?.customerName || r.customerName || 'Job',
        address: pastJob?.address || r.address || '',
        usedSquares,
        ratePerSquare: rate,
        installTotal,
        extrasTotal,
        grandTotal,
        extras,
  attachments,
  adjustments,
        paid: !!r.paid,
        paidAt: r.paidAt || null,
      })
    }
    return NextResponse.json({ ok: true, items })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}

// POST /api/crew-payment-requests
// body: { appointmentId?, pastJobId?, crewUserId?, amount?, customerName?, address?, usedSquares?, ratePerSquare?, installTotal?, extrasTotal?, grandTotal?, extrasJson?, adjustmentsJson?, attachmentsJson? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data: any = {}
  const scalarFields = ['appointmentId','pastJobId','crewUserId','customerName','address','extrasJson','adjustmentsJson','attachmentsJson']
    for (const k of scalarFields) if (k in body) data[k] = body[k]
    if ('amount' in body) { const n = Number(body.amount); if (Number.isFinite(n)) data.amount = n }
  if ('usedSquares' in body) { const n = Number(body.usedSquares); if (Number.isFinite(n)) data.usedSquares = n }
  if ('ratePerSquare' in body) { const n = Number(body.ratePerSquare); if (Number.isFinite(n)) data.ratePerSquare = n }
  if ('installTotal' in body) { const n = Number(body.installTotal); if (Number.isFinite(n)) data.installTotal = n }
  if ('extrasTotal' in body) { const n = Number(body.extrasTotal); if (Number.isFinite(n)) data.extrasTotal = n }
  if ('grandTotal' in body) { const n = Number(body.grandTotal); if (Number.isFinite(n)) data.grandTotal = n }

    // naive tenant mapping (first tenant)
    const tenant = await prisma.tenant.findFirst()
    if (!tenant) return NextResponse.json({ ok: false, error: 'No tenant found' }, { status: 500 })
    data.tenantId = tenant.id

  const created = await prisma.crewPaymentRequest.create({ data })
    return NextResponse.json({ ok: true, item: { id: created.id } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}

// PATCH /api/crew-payment-requests
// body: { ids: string[], action: 'markPaid' } or { id: string, updates: { ...fields } }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    // Mark multiple as paid
    if (Array.isArray(body.ids) && body.action === 'markPaid') {
      const now = new Date()
      let count = 0
      for (const id of body.ids) {
        try {
          await prisma.crewPaymentRequest.update({ where: { id }, data: { paid: true, paidAt: now } })
          count++
        } catch (e) {
          // ignore individual failures to allow partial success
        }
      }
      return NextResponse.json({ ok: true, count })
    }
    // Adjust totals for single request
    if (body.id && body.updates && typeof body.updates === 'object') {
      const data: any = {}
    const numeric = ['amount','usedSquares','ratePerSquare','installTotal','extrasTotal','grandTotal']
      for (const k of numeric) if (k in body.updates) { const n = Number(body.updates[k]); if (Number.isFinite(n)) data[k] = n }
  const scalars = ['customerName','address','extrasJson','adjustmentsJson','attachmentsJson']
      for (const k of scalars) if (k in body.updates) data[k] = body.updates[k]

      // Derive installTotal if not explicitly provided but usedSquares & ratePerSquare changed
      const usedSquares = ('usedSquares' in data) ? Number(data.usedSquares) : undefined
      const ratePerSquare = ('ratePerSquare' in data) ? Number(data.ratePerSquare) : undefined
      if (!('installTotal' in data) && Number.isFinite(usedSquares) && Number.isFinite(ratePerSquare)) {
        data.installTotal = Number(usedSquares) * Number(ratePerSquare)
      }
      // Derive extrasTotal from extrasJson if provided and not explicitly set
      if (!('extrasTotal' in data) && 'extrasJson' in data) {
        try {
          const arr = JSON.parse(String(data.extrasJson||'[]'))
          if (Array.isArray(arr)) data.extrasTotal = arr.reduce((s,x)=> s + (Number(x?.price)||0),0)
        } catch {}
      }
      // Derive grandTotal if not provided
      if (!('grandTotal' in data)) {
        const install = ('installTotal' in data) ? Number(data.installTotal) : undefined
        const extras = ('extrasTotal' in data) ? Number(data.extrasTotal) : undefined
        if (Number.isFinite(install) || Number.isFinite(extras)) {
          data.grandTotal = (Number(install)||0) + (Number(extras)||0)
        }
      }
      if (Object.keys(data).length === 0) return NextResponse.json({ ok: false, error: 'No valid fields' }, { status: 400 })
  const updated = await prisma.crewPaymentRequest.update({ where: { id: body.id }, data })
      return NextResponse.json({ ok: true, item: { id: updated.id } })
    }
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}

// DELETE /api/crew-payment-requests?id=REQUEST_ID
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ ok:false, error:'Missing id' }, { status:400 })
    try { await prisma.crewPaymentRequest.delete({ where:{ id } }) } catch (e:any) {
      return NextResponse.json({ ok:false, error: String(e?.message||e) }, { status:500 })
    }
    return NextResponse.json({ ok:true })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status:500 })
  }
}
