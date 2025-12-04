import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { scheduleJobForLead, pricingBreakdownForLead } from '@/lib/jobs'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/leads?assignedTo=<email>
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const assignedTo = (searchParams.get('assignedTo') || '').trim().toLowerCase()
  const contactId = (searchParams.get('contactId') || '').trim()
  const current = await getCurrentUser(req).catch(()=>null as any)
  const currentEmail = (current?.email||'').toLowerCase()
  const role = (current as any)?.role || 'ADMIN'
  const where: any = {}
  if (contactId) where.contactId = contactId
  let leads = await prisma.lead.findMany({
    where,
    include: {
      contact: true,
      property: true,
      assignee: true,
      files: { select: { id: true, name: true, category: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 },
      measurements: { select: { id: true }, orderBy: { createdAt: 'desc' } },
    },
    orderBy: { createdAt: 'desc' }
  })
  if (role === 'SALES') {
    // Strict: only leads whose assignee matches the current user
    leads = leads.filter(l => (l.assignee?.email||'').toLowerCase() === currentEmail)
  } else if (assignedTo) {
    leads = leads.filter(l => {
      const email = (l.assignee?.email || '').toLowerCase()
      return email === assignedTo || email === ''
    })
  }
  const items = leads.map(l => {
    const p = l.property
    const addr = p ? [p.address1, p.city, [p.state, p.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''
    return {
      id: l.id,
      contactId: l.contactId,
      name: l.contact?.name || l.title,
      status: l.stage,
      address: addr,
      notes: l.notes || '',
      files: l.files.map(f => ({ id: f.id, name: f.name, category: f.category })),
      measurementsCount: l.measurements.length,
    }
  })
  return NextResponse.json({ ok: true, items })
}

// POST /api/leads { id, stage }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body?.id || '').trim()
    const stage = String(body?.stage || '').trim().toUpperCase()
    if (!id || !stage) return NextResponse.json({ ok: false, error: 'Missing id or stage' }, { status: 400 })
    const allowed = ['LEAD','PROSPECT','APPROVED','COMPLETED','INVOICED','ARCHIVE']
    if (!allowed.includes(stage)) return NextResponse.json({ ok: false, error: 'Invalid stage' }, { status: 400 })
    // Role gating: only SALES/ADMIN/MANAGER can move to COMPLETED
    if (stage === 'COMPLETED') {
      const current = await getCurrentUser(req).catch(() => null as any)
      const role = (current as any)?.role || 'ADMIN'
      const allowedRoles = new Set(['SALES','ADMIN','MANAGER'])
      if (!allowedRoles.has(role)) {
        return NextResponse.json({ ok: false, error: 'Forbidden: insufficient role to complete lead' }, { status: 403 })
      }
    }
    const updated = await prisma.lead.update({ where: { id }, data: { stage: stage as any }, include: { contact: true, assignee: true } }).catch(()=>null)
    if (!updated) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    // Auto-create job if moved to APPROVED (align with /api/lead-stage behavior)
  let job: any = null
  let invoiceResult: { created: boolean; id?: string; error?: string } | null = null
    if (updated.stage === 'APPROVED') {
      try {
        job = await scheduleJobForLead(updated.id)
        // If lead has assignee, set appointment.userId so calendar filters pick it up
        if (job?.apptId && updated.assigneeId) {
          await prisma.appointment.update({ where: { id: job.apptId }, data: { userId: updated.assigneeId } }).catch(()=>null)
        }
      } catch {}
    }

    // On COMPLETED: hydrate existing pending invoice (no new invoice creation)
  if (updated.stage === 'COMPLETED') {
      try {
        const pb = await pricingBreakdownForLead(updated.id)
        const contractPrice = pb.contractPrice ?? 0
  const extrasTotal = pb.extrasTotal || 0
  // Prefer contact.depositReceived (accumulated) for deposit line item display; fallback to summing paid DEPOSIT invoices
  let depositAmount = 0
  if (updated.contactId) {
    const c = await prisma.contact.findUnique({ where: { id: updated.contactId }, select: { depositReceived: true } })
    if (c && typeof c.depositReceived === 'number' && isFinite(c.depositReceived)) depositAmount = c.depositReceived
  }
  if (depositAmount === 0) {
    const paidDeposits = await prisma.invoice.findMany({ where: { leadId: updated.id, type: 'DEPOSIT', paidAt: { not: null } }, select: { paidAmount: true } })
    depositAmount = paidDeposits.reduce((s,i)=> s + (Number(i.paidAmount||0)||0), 0)
  }
        const totalDue = contractPrice - depositAmount + extrasTotal
        // Build address string for description
        const leadWithProp = await prisma.lead.findUnique({ where: { id: updated.id }, include: { property: true } })
        const p = leadWithProp?.property
        const addr = p ? [p.address1, p.city, [p.state, p.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''
        // Build initial line items: Contract, Deposit (blank amount), then Extras
        const items: any[] = []
        items.push({ title: 'Contract', description: addr ? `complete contracted work at ${addr}` : 'complete contracted work', qty: 1, rate: contractPrice, amount: contractPrice })
        if (depositAmount>0) {
          const depositDesc = `deposit received ${new Date().toLocaleDateString()}`
          items.push({ title: 'Deposit', description: depositDesc, qty: 1, rate: -depositAmount, amount: -depositAmount })
        }
        for (const ex of (pb.extras || [])) {
          const desc = (ex as any).description || (ex as any).title || 'Extra'
          // Support either price or amount on extras from pricing breakdown
          const amt = Number((ex as any).amount ?? (ex as any).price ?? 0) || 0
          items.push({ title: 'Extra', description: String(desc), qty: 1, rate: amt, amount: amt })
        }
        // Find existing pending invoice for this lead:
        // Prefer a DEPOSIT invoice that is now status=PENDING; else any invoice with status=PENDING
        let target = await prisma.invoice.findFirst({ where: { leadId: updated.id, status: 'PENDING' }, orderBy: { createdAt: 'desc' } })
        if (!target) {
          // As a fallback, transform the most recent DEPOSIT to PENDING
          const lastDeposit = await prisma.invoice.findFirst({ where: { leadId: updated.id, type: 'DEPOSIT' }, orderBy: { createdAt: 'desc' } })
          if (lastDeposit) {
            target = await prisma.invoice.update({ where: { id: lastDeposit.id }, data: { status: 'PENDING' } })
          }
        }
        if (!target) {
          invoiceResult = { created: false, error: 'No pending invoice found to hydrate' }
        } else {
          // Optionally assign a number if missing
          let number = target.number || null
          if (!number) {
            const y = new Date()
            const prefix = `${y.getFullYear()}${String(y.getMonth()+1).padStart(2,'0')}`
            let seq = 0
            try {
              const lastNum = await prisma.invoice.findFirst({ where: { tenantId: updated.tenantId, number: { startsWith: `${prefix}-` } }, orderBy: { number: 'desc' }, select: { number: true } })
              if (lastNum?.number) { const m = lastNum.number.match(/-(\d{4})$/); if (m) seq = parseInt(m[1],10) }
            } catch {}
            number = `${prefix}-${String(seq + 1).padStart(4,'0')}`
          }
          const appt = await prisma.appointment.findFirst({ where: { leadId: updated.id, allDay: true }, orderBy: { start: 'desc' }, select: { id: true } })
          const updatedInv = await prisma.invoice.update({
            where: { id: target.id },
            data: {
              tenantId: updated.tenantId,
              leadId: updated.id,
              contactId: updated.contactId || undefined,
              appointmentId: appt?.id || undefined,
              number,
              status: 'PENDING',
              contractPrice,
              depositAmount,
              extrasJson: items.length ? JSON.stringify(items) : undefined,
              extrasTotal,
              totalDue,
              dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            }
          })
          try { const { revalidatePath } = await import('next/cache'); revalidatePath('/invoices') } catch {}
          invoiceResult = { created: true, id: updatedInv.id }
        }
      } catch (e:any) {
        console.error('Invoice creation on COMPLETED failed:', e)
        invoiceResult = { created: false, error: String(e?.message||e) }
      }
    }

  return NextResponse.json({ ok: true, item: { id: updated.id, stage: updated.stage }, job, invoice: invoiceResult })
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: String(e?.message||e) }, { status: 500 })
  }
}
