import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { pricingBreakdownForLead } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// GET /api/invoices
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId') || undefined
  const includeItems = searchParams.get('include')?.split(',') || []
  const where: any = {}
  if (tenantId) where.tenantId = tenantId
  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { lead: { include: { contact: true, property: true } }, contact: true }
  })

  // Compute derived group flags
  const now = new Date()
  const items = invoices.map(inv => {
    const overdue14 = !!inv.dueDate && inv.paidAt == null && inv.dueDate.getTime() < addDays(now, -14).getTime()
    const open = inv.paidAt == null && !overdue14 && (inv.status === 'SENT' || inv.status === 'VIEWED' || inv.status === 'OPEN')
    const address = (() => {
      const p: any = (inv as any).lead?.property
      if (!p) return ''
      return [p.address1, p.city, [p.state, p.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    })()
    const type = (inv as any).type || 'FINAL'
    const isDeposit = type === 'DEPOSIT'
    const leadContract = Number(((inv as any).lead?.contractPrice) || 0) || 0
    const invContract = Number(inv.contractPrice || 0) || 0
    const invTotalDue = Number(inv.totalDue || 0) || 0
    const derivedContract = invContract || (invTotalDue ? invTotalDue * 2 : 0) || leadContract
    const displayContract = isDeposit ? (invContract || derivedContract) : invContract
    const displayTotalDue = isDeposit ? (invTotalDue || Math.round((derivedContract * 0.5) * 100) / 100) : invTotalDue
    const displayExtras = isDeposit ? 0 : (Number(inv.extrasTotal || 0) || 0)
    return {
      id: inv.id,
      number: inv.number,
      status: inv.status,
      type,
  contractPrice: displayContract,
  depositAmount: inv.depositAmount,
  extrasTotal: displayExtras,
  totalDue: displayTotalDue,
      emailedAt: inv.emailedAt,
      viewedAt: inv.viewedAt,
      paidAt: inv.paidAt,
  paidAmount: (inv as any).paidAmount || null,
  paymentMethod: (inv as any).paymentMethod || null,
  paymentRef: (inv as any).paymentRef || null,
      dueDate: inv.dueDate,
      tenantId: inv.tenantId,
      leadId: inv.leadId,
      contactId: inv.contactId,
      appointmentId: inv.appointmentId,
      customerName: (inv as any).lead?.contact?.name || (inv as any).lead?.title || '',
  contactEmail: inv.contact?.email || (inv as any).lead?.contact?.email || null,
      address,
      flags: { overdue14, open, paid: !!inv.paidAt },
    }
  })

  return NextResponse.json({ ok: true, items })
}

// POST /api/invoices { leadId, depositAmount? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const leadId = String(body?.leadId || '').trim()
    if (!leadId) return NextResponse.json({ ok: false, error: 'Missing leadId' }, { status: 400 })
    const depositAmount = typeof body?.depositAmount === 'number' ? body.depositAmount : 0

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { contact: true } })
    if (!lead) return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
    const tenantId = lead.tenantId

    const pb = await pricingBreakdownForLead(leadId)
    const contractPrice = pb.contractPrice ?? 0
    const extrasTotal = pb.extrasTotal
    const totalDue = contractPrice - (depositAmount || 0) + (extrasTotal || 0)

    // Link to an existing all-day appointment if present
    const appt = await prisma.appointment.findFirst({ where: { leadId, allDay: true }, orderBy: { start: 'desc' }, select: { id: true } })

    // Create invoice number as YYYYMM-<sequence per tenant>
    const y = new Date()
    const prefix = `${y.getFullYear()}${String(y.getMonth()+1).padStart(2,'0')}`
    const count = await prisma.invoice.count({ where: { tenantId } })
    const number = `${prefix}-${String(count + 1).padStart(4,'0')}`

    const isDepositReq = depositAmount > 0
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        leadId,
        contactId: lead.contactId || undefined,
        appointmentId: appt?.id || undefined,
        number,
        // If creating a deposit request (depositAmount>0), mark status DEPOSIT initially.
        status: isDepositReq ? 'DEPOSIT' : 'PENDING',
        type: isDepositReq ? 'DEPOSIT' : 'FINAL',
        contractPrice,
        depositAmount: depositAmount || 0,
        extrasJson: pb.extras.length ? JSON.stringify(pb.extras) : undefined,
        extrasTotal,
        totalDue,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      }
    })

    return NextResponse.json({ ok: true, item: invoice })
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: String(e?.message||e) }, { status: 500 })
  }
}
