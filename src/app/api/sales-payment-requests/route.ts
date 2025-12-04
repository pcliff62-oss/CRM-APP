import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

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
      // Recompute extras total and grand/amount if missing
      const extrasArr = (() => {
        try {
          const arr = JSON.parse(r.extrasJson || '[]')
          return Array.isArray(arr) ? arr : []
        } catch { return [] }
      })()
      const extrasTotal = extrasArr.reduce((sum:number,x:any)=>{
        const qty = Number(x?.qty ?? 1) || 1
        const price = Number(x?.price) || 0
        return sum + qty * price
      },0)
      let contractPrice = r.contractPrice ?? null
      if (contractPrice == null && r.leadId) {
        try {
          const lead = await prisma.lead.findFirst({ where:{ id: r.leadId }, select:{ contractPrice:true } }) as any
          if (lead?.contractPrice != null) contractPrice = lead.contractPrice
        } catch {}
      }
      let grandTotal = r.grandTotal ?? null
      if (grandTotal == null || grandTotal === 0) {
        if (contractPrice != null) grandTotal = Number(contractPrice) + extrasTotal
      }
      let commissionPercent = r.commissionPercent ?? null
      let amount = r.amount ?? null
      if ((amount == null || amount === 0) && grandTotal != null && commissionPercent != null) {
        amount = Number(grandTotal) * Number(commissionPercent) / 100
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
        contractPrice: contractPrice,
        grandTotal: grandTotal,
        commissionPercent: commissionPercent,
        amount: amount,
        extras: extrasArr.map((x:any)=>({
          title: String(x?.title||'').trim(),
          price: Number(x?.price)||0,
          qty: Number(x?.qty ?? 1)||1
        })),
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
  // Prefer explicit human name from header if provided; map to user by name within tenant if possible
    let headerName: string | undefined
    try {
      const n = String(req.headers.get('x-user-name') || '').trim()
      if (n && n !== 'dd' && !/@/.test(n)) headerName = n
    } catch {}
    // Resolve tenant first (needed for name->user mapping and foreign keys)
    const tenant = await prisma.tenant.findFirst()
    if (!tenant) return NextResponse.json({ ok:false, error:'No tenant found' }, { status:500 })
    data.tenantId = tenant.id
    let resolvedUser: any = null
    if (headerName) {
      data.salesUserName = headerName
      try {
        const uByName = await prisma.user.findFirst({ where: { tenantId: tenant.id, name: headerName } }) as any
        if (uByName?.id) { data.salesUserId = String(uByName.id); resolvedUser = uByName }
      } catch {}
    }
    // Fallback: derive from appointment or lead assignee when no name present
    if (!data.salesUserName) {
      try {
        let u:any = null
        if (data.appointmentId) {
          const ass = await prisma.appointmentAssignee.findFirst({ where: { appointmentId: String(data.appointmentId), tenantId: tenant.id, role: 'SALES' }, include: { user: true } }) as any
          u = ass?.user || null
          if (!u) {
            const appt = await prisma.appointment.findFirst({ where: { id: String(data.appointmentId), tenantId: tenant.id }, include: { user: true } }) as any
            u = appt?.user || null
          }
        } else if (data.leadId) {
          const lead = await prisma.lead.findFirst({ where: { id: String(data.leadId), tenantId: tenant.id }, include: { assignee: true } }) as any
          u = lead?.assignee || null
        }
        if (u?.name && typeof u.name === 'string') {
          data.salesUserName = String(u.name).trim()
          if (u.id) data.salesUserId = String(u.id)
          resolvedUser = u
        }
      } catch {}
    }
    // Ensure a displayable name from current session as a last resort
    try {
      if (!data.salesUserName || /@/.test(String(data.salesUserName))) {
        const me = await getCurrentUser(req)
        if (me?.name && typeof me.name === 'string') {
          data.salesUserName = String(me.name).trim()
          if (me.id && !data.salesUserId) data.salesUserId = String(me.id)
          if (!resolvedUser) resolvedUser = me
        }
      }
    } catch {}
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
        if (!resolvedUser) resolvedUser = u
      } catch {}
    }

    // Derive commissionPercent from resolved sales user when available
    try {
      let pct: number | undefined
      if (resolvedUser?.commissionPercent != null) {
        const v = Number(resolvedUser.commissionPercent)
        if (Number.isFinite(v) && v > 0) pct = v
      } else if (data.salesUserId) {
        const u = await prisma.user.findFirst({ where: { id: String(data.salesUserId) } }) as any
        const v = Number(u?.commissionPercent)
        if (Number.isFinite(v) && v > 0) pct = v
      } else if (headerName) {
        const u = await prisma.user.findFirst({ where: { tenantId: tenant.id, name: headerName } }) as any
        const v = Number(u?.commissionPercent)
        if (Number.isFinite(v) && v > 0) pct = v
      }
      if (Number.isFinite(pct as any)) data.commissionPercent = pct
    } catch {}

    // Parse extras to compute grandTotal and amount authoritatively
    let extrasList: any[] = []
    try {
      if (typeof data.extrasJson === 'string') {
        const parsed = JSON.parse(data.extrasJson)
        if (Array.isArray(parsed)) extrasList = parsed
      }
    } catch {}
    const extrasTotal = extrasList.reduce((sum:number, x:any)=> {
      const qty = Number(x?.qty ?? 1) || 1
      const price = Number(x?.price) || 0
      return sum + qty * price
    },0)
    if (Number.isFinite(data.contractPrice)) {
      data.grandTotal = Number(data.contractPrice) + extrasTotal
    } else if (Number.isFinite(data.grandTotal)) {
      // leave as provided but ensure numeric
      data.grandTotal = Number(data.grandTotal)
    }
    if (Number.isFinite(data.grandTotal) && Number.isFinite(data.commissionPercent)) {
      data.amount = Number(data.grandTotal) * Number(data.commissionPercent) / 100
    }
    const created = await prisma.salesPaymentRequest.create({ data })
    // Mark the related job as submitted for visibility in Jobs page
    try {
      if (data.appointmentId) {
        await prisma.appointment.update({ where: { id: String(data.appointmentId) }, data: { jobStatus: 'submitted' } })
      } else if (data.leadId) {
        // Fallback: mark the latest job appointment for this lead as submitted
        const latestJob = await prisma.appointment.findFirst({
          where: { tenantId: tenant.id, leadId: String(data.leadId), OR: [ { allDay: true }, { jobStatus: { not: null } }, { crewId: { not: null } } ] },
          orderBy: { start: 'desc' },
          select: { id: true }
        })
        if (latestJob?.id) {
          await prisma.appointment.update({ where: { id: latestJob.id }, data: { jobStatus: 'submitted' } })
        }
      }
    } catch {}
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
