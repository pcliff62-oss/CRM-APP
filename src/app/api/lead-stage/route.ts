import prisma from '@/lib/db';
import { scheduleJobForLead, pricingBreakdownForLead } from '@/lib/jobs';
import { getCurrentUser } from '@/lib/auth'
import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';

// POST { leadId, stage }
export async function POST(req: NextRequest) {
  const { leadId, stage } = await req.json();
  if (!leadId || !stage) return new Response('Missing leadId or stage', { status: 400 });
  const nextStage = String(stage).toUpperCase();
  // Role gating: only SALES/ADMIN/MANAGER can move to COMPLETED
  if (nextStage === 'COMPLETED') {
    const current = await getCurrentUser(req).catch(() => null as any)
    const role = (current as any)?.role || 'ADMIN'
    const allowedRoles = new Set(['SALES','ADMIN','MANAGER'])
    if (!allowedRoles.has(role)) {
      return new Response('Forbidden: insufficient role to complete lead', { status: 403 })
    }
  }
  let lead;
  try {
    lead = await prisma.lead.update({ where: { id: leadId }, data: { stage: nextStage as any }, include: { contact: true, assignee: true } });
  } catch (e: any) {
    if (e?.code === 'P2025') {
      return new Response('Lead not found', { status: 404 });
    }
    return new Response('Failed to update lead', { status: 500 });
  }

  // If moved into APPROVED, auto-schedule a job as all-day block on next available days
  let jobInfo: any = undefined;
  if (lead.stage === 'APPROVED') {
    try { jobInfo = await scheduleJobForLead(lead.id); } catch (e) { /* ignore */ }
    // attach calendar ownership if possible
    if (jobInfo?.apptId && lead.assigneeId) {
      try { await prisma.appointment.update({ where: { id: jobInfo.apptId }, data: { userId: lead.assigneeId } }) } catch {}
    }
  }

  // If moved into COMPLETED, auto-create a Pending invoice (mirrors /api/leads POST)
  let invoiceId: string | undefined
  if (lead.stage === 'COMPLETED') {
    try {
      const pb = await pricingBreakdownForLead(lead.id)
      const contractPrice = pb.contractPrice ?? 0
      const extrasTotal = pb.extrasTotal || 0
      let depositAmount = 0
      if (lead.contactId) {
        const c = await prisma.contact.findUnique({ where: { id: lead.contactId }, select: { depositReceived: true } })
        if (c && typeof c.depositReceived === 'number' && isFinite(c.depositReceived)) depositAmount = c.depositReceived
      }
      if (depositAmount === 0) {
        const paidDeposits = await prisma.invoice.findMany({ where: { leadId: lead.id, type: 'DEPOSIT', paidAt: { not: null } }, select: { paidAmount: true } })
        depositAmount = paidDeposits.reduce((s,i)=> s + (Number(i.paidAmount||0)||0), 0)
      }
      const totalDue = contractPrice - depositAmount + extrasTotal
      const withProp = await prisma.lead.findUnique({ where: { id: lead.id }, include: { property: true } })
      const p = withProp?.property as any
      const addr = p ? [p.address1, p.city, [p.state, p.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''
      // Build line items: Deposit (negative) first, then extras only. No explicit Contract line.
      const items: any[] = []
      if (depositAmount>0) {
        const depositDesc = `deposit received ${new Date().toLocaleDateString()}`
        items.push({ title: 'Deposit', description: depositDesc, qty: 1, rate: -depositAmount, amount: -depositAmount })
      }
      for (const ex of (pb.extras || [])) {
        const desc = (ex as any).description || (ex as any).title || 'Extra'
        const amt = Number((ex as any).amount ?? (ex as any).price ?? 0) || 0
        items.push({ title: 'Extra', description: String(desc), qty: 1, rate: amt, amount: amt })
      }
      // Find and hydrate existing pending invoice
  // Only hydrate if a PENDING invoice exists (deposit already paid and transitioned) – do not auto-promote unpaid deposit
  let target = await prisma.invoice.findFirst({ where: { leadId: lead.id, status: 'PENDING' }, orderBy: { createdAt: 'desc' } })
  // (No automatic status change from DEPOSIT here; payment receive route handles that.)
      if (target) {
        // assign invoice number if missing
        let number = target.number || null
        if (!number) {
          const y = new Date(); const prefix = `${y.getFullYear()}${String(y.getMonth()+1).padStart(2,'0')}`; let seq = 0
          try { const last = await prisma.invoice.findFirst({ where: { tenantId: lead.tenantId, number: { startsWith: `${prefix}-` } }, orderBy: { number: 'desc' }, select: { number: true } }); if (last?.number) { const m = last.number.match(/-(\d{4})$/); if (m) seq = parseInt(m[1],10) } } catch {}
          number = `${prefix}-${String(seq + 1).padStart(4,'0')}`
        }
        const appt = await prisma.appointment.findFirst({ where: { leadId: lead.id, allDay: true }, orderBy: { start: 'desc' }, select: { id: true } })
        const upd = await prisma.invoice.update({ where: { id: target.id }, data: {
          tenantId: lead.tenantId,
          leadId: lead.id,
          contactId: lead.contactId || undefined,
          appointmentId: appt?.id || undefined,
          number,
          status: 'PENDING',
          // Once hydrated, treat as FINAL invoice.
          type: 'FINAL',
          contractPrice,
          depositAmount,
          extrasJson: items.length ? JSON.stringify(items) : undefined,
          extrasTotal,
          totalDue,
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        } })
        invoiceId = upd.id
      }
      revalidatePath('/invoices')
    } catch (e) {
      console.error('lead-stage COMPLETED invoice create failed', e)
    }
  }

  revalidatePath('/leads');
  if (lead.contactId) {
    revalidatePath('/customers');
    revalidatePath(`/customers/${lead.contactId}`);
  }
  return Response.json({ ok: true, leadId: lead.id, contactId: lead.contactId, stage: lead.stage, job: jobInfo, invoiceId });
}
