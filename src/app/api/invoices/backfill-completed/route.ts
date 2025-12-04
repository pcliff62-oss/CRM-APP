import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { pricingBreakdownForLead } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/invoices/backfill-completed
// Creates invoices for all COMPLETED leads that do not yet have an invoice.
export async function POST(_req: NextRequest) {
  const leads = await prisma.lead.findMany({
    where: { stage: 'COMPLETED' },
    select: { id: true, tenantId: true, contactId: true }
  })
  let created = 0
  const results: Array<{ leadId: string; invoiceId?: string; error?: string }> = []
  for (const l of leads) {
    try {
      const existing = await prisma.invoice.findFirst({ where: { leadId: l.id } })
      if (existing) { results.push({ leadId: l.id, invoiceId: existing.id }); continue }
      const pb = await pricingBreakdownForLead(l.id)
      const contractPrice = pb.contractPrice ?? 0
      const extrasTotal = pb.extrasTotal || 0
      const depositAmount = 0
      const totalDue = contractPrice - depositAmount + extrasTotal
      const appt = await prisma.appointment.findFirst({ where: { leadId: l.id, allDay: true }, orderBy: { start: 'desc' }, select: { id: true } })
      const y = new Date()
      const prefix = `${y.getFullYear()}${String(y.getMonth()+1).padStart(2,'0')}`
      const count = await prisma.invoice.count({ where: { tenantId: l.tenantId } })
      const number = `${prefix}-${String(count + 1).padStart(4,'0')}`
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: l.tenantId,
          leadId: l.id,
          contactId: l.contactId || undefined,
          appointmentId: appt?.id || undefined,
          number,
          status: 'PENDING',
          contractPrice,
          depositAmount,
          extrasJson: pb.extras.length ? JSON.stringify(pb.extras) : undefined,
          extrasTotal,
          totalDue,
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        }
      })
      created += 1
      results.push({ leadId: l.id, invoiceId: invoice.id })
    } catch (e:any) {
      results.push({ leadId: l.id, error: String(e?.message||e) })
    }
  }
  return NextResponse.json({ ok: true, processed: leads.length, created, results })
}
