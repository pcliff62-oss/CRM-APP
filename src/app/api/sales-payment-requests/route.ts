import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/sales-payment-requests
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const paidFilter = url.searchParams.get('paid')
    const where: any = {}
    if (paidFilter === 'true') where.paid = true
    if (paidFilter === 'false') where.paid = false
    const raw = await prisma.salesPaymentRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }) as any[]
    const items: any[] = []
    for (const r of raw) {
      let salesUserName: string | null = null
      const rawName = typeof r.salesUserName === 'string' ? r.salesUserName.trim() : ''
      const looksEmail = /@/.test(rawName)
      if (rawName && rawName !== 'dd' && !looksEmail && rawName.length > 1) {
        // Accept stored proper name
        salesUserName = rawName
      } else if (r.salesUserId) {
        // Enrich from user table when missing or invalid (email/placeholder)
        try {
          const u = await prisma.user.findFirst({ where: { id: r.salesUserId } }) as any
          const candidate = typeof u?.name === 'string' ? u.name.trim() : ''
          if (candidate && candidate.length > 1 && !/@/.test(candidate)) {
            salesUserName = candidate
            // Persist sanitized name for future calls
            try { await prisma.salesPaymentRequest.update({ where:{ id: r.id }, data:{ salesUserName: candidate } }) } catch {}
          }
        } catch {}
      }
      items.push({
        id: r.id,
        createdAt: r.createdAt,
        leadId: r.leadId,
        appointmentId: r.appointmentId,
        salesUserId: r.salesUserId,
        salesUserName,
        customerName: r.customerName || 'Job',
        address: r.address || '',
        contractPrice: r.contractPrice ?? null,
        grandTotal: r.grandTotal ?? null,
        commissionPercent: r.commissionPercent ?? null,
        amount: r.amount ?? null,
        extras: (() => { try { const arr = JSON.parse(r.extrasJson||'[]'); return Array.isArray(arr)? arr.map((x:any)=>({ title: String(x?.title||'').trim(), price: Number(x?.price)||0 })) : [] } catch { return [] } })(),
        paid: !!r.paid,
        paidAt: r.paidAt || null,
      })
    }
    return NextResponse.json({ ok: true, items })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status:500 })
  }
}

// POST /api/sales-payment-requests
// body: { leadId?, appointmentId?, salesUserId?, salesUserName?, contractPrice?, grandTotal?, commissionPercent?, amount?, customerName?, address?, extrasJson? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data:any = {}
    const scalars = ['leadId','appointmentId','salesUserId','salesUserName','customerName','address','extrasJson']
    for (const k of scalars) if (k in body) data[k] = body[k]
    const numerics = ['contractPrice','grandTotal','commissionPercent','amount']
    for (const k of numerics) if (k in body) { const n = Number(body[k]); if (Number.isFinite(n)) data[k] = n }
    // Sanitize provided salesUserName (remove placeholder/email)
    if (typeof data.salesUserName === 'string') {
      const trimmed = data.salesUserName.trim()
      if (trimmed === 'dd' || /@/.test(trimmed) || trimmed.length < 2) {
        delete data.salesUserName
      } else {
        data.salesUserName = trimmed
      }
    }
    // Auto-fill name from user if missing after sanitization
    if (data.salesUserId && !data.salesUserName) {
      try {
        const u = await prisma.user.findFirst({ where: { id: String(data.salesUserId) } }) as any
        const candidate = typeof u?.name === 'string' ? u.name.trim() : ''
        if (candidate && candidate.length > 1 && !/@/.test(candidate)) data.salesUserName = candidate
      } catch {}
    }
    const tenant = await prisma.tenant.findFirst()
    if (!tenant) return NextResponse.json({ ok:false, error:'No tenant found' }, { status:500 })
    data.tenantId = tenant.id
    const created = await prisma.salesPaymentRequest.create({ data })
    return NextResponse.json({ ok:true, item:{ id:created.id } })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status:500 })
  }
}

// PATCH /api/sales-payment-requests
// body: { ids: string[], action:'markPaid' } or { id, updates:{...} }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    if (Array.isArray(body.ids) && body.action === 'markPaid') {
      const now = new Date()
      let count = 0
      for (const id of body.ids) {
        try { await prisma.salesPaymentRequest.update({ where:{ id }, data:{ paid:true, paidAt: now } }); count++ } catch {}
      }
      return NextResponse.json({ ok:true, count })
    }
    if (body.id && body.updates && typeof body.updates === 'object') {
      const data:any = {}
      const numerics = ['contractPrice','grandTotal','commissionPercent','amount']
      for (const k of numerics) if (k in body.updates) { const n = Number(body.updates[k]); if (Number.isFinite(n)) data[k] = n }
      const scalars = ['salesUserName','customerName','address','extrasJson']
      for (const k of scalars) if (k in body.updates) data[k] = body.updates[k]
      // Sanitize salesUserName if provided in updates
      if (typeof data.salesUserName === 'string') {
        const t = data.salesUserName.trim()
        if (t === 'dd' || /@/.test(t) || t.length < 2) {
          // Attempt enrichment if we have a stored salesUserId
          delete data.salesUserName
          try {
            const existing = await prisma.salesPaymentRequest.findFirst({ where:{ id: body.id } }) as any
            if (existing?.salesUserId) {
              const u = await prisma.user.findFirst({ where: { id: existing.salesUserId } }) as any
              const candidate = typeof u?.name === 'string' ? u.name.trim() : ''
              if (candidate && candidate.length > 1 && !/@/.test(candidate)) data.salesUserName = candidate
            }
          } catch {}
        } else {
          data.salesUserName = t
        }
      }
      if (Object.keys(data).length === 0) return NextResponse.json({ ok:false, error:'No valid fields' }, { status:400 })
      await prisma.salesPaymentRequest.update({ where:{ id: body.id }, data })
      return NextResponse.json({ ok:true })
    }
    return NextResponse.json({ ok:false, error:'Invalid payload' }, { status:400 })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status:500 })
  }
}

// DELETE /api/sales-payment-requests?id=REQUEST_ID
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ ok:false, error:'Missing id' }, { status:400 })
    try { await prisma.salesPaymentRequest.delete({ where:{ id } }) } catch (e:any) {
      return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status:500 })
    }
    return NextResponse.json({ ok:true })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status:500 })
  }
}
