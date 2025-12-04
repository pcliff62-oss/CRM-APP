import prisma from "@/lib/db";
import { pricingBreakdownForLead, scheduleJobForLead } from '@/lib/jobs';
export const dynamic = "force-dynamic"; // force dynamic rendering
export const revalidate = 0; // disable ISR caching
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import nextDynamic from "next/dynamic"; // renamed to avoid name clash with exported const dynamic
const NewLeadButton = nextDynamic(() => import("@/components/NewLead"), { ssr: false });
import { revalidatePath } from "next/cache";
import LeadsClient from "./LeadsClient";
import LeadsDragDropClient from "./LeadsDragDropClient";

async function moveLead(id: string, stage: string) {
  "use server";
  const updated = await prisma.lead.update({ where: { id }, data: { stage: stage as any }, include: { contact: true, assignee: true } });
  // On APPROVED: ensure job exists
  if (stage === 'APPROVED') {
    try {
      const res = await scheduleJobForLead(updated.id);
      if (res?.apptId && updated.assigneeId) {
        await prisma.appointment.update({ where: { id: res.apptId }, data: { userId: updated.assigneeId } }).catch(()=>null)
      }
    } catch {}
  }
  // On COMPLETED: create a customer invoice (Pending)
  if (stage === 'COMPLETED') {
    try {
      const pb = await pricingBreakdownForLead(updated.id)
      const contractPrice = pb.contractPrice ?? 0
      const extrasTotal = pb.extrasTotal || 0
      // Determine depositAmount from contact.depositReceived or paid DEPOSIT invoices
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
      // Build address description
      const leadWithProp = await prisma.lead.findUnique({ where: { id: updated.id }, include: { property: true } })
      const p = leadWithProp?.property as any
      const addr = p ? [p.address1, p.city, [p.state, p.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''
      // Build line items
      const items: any[] = []
      items.push({ title: 'Contract', description: addr ? `complete contracted work at ${addr}` : 'complete contracted work', qty: 1, rate: contractPrice, amount: contractPrice })
      if (depositAmount>0) {
        const depositDesc = `deposit received ${new Date().toLocaleDateString()}`
        items.push({ title: 'Deposit', description: depositDesc, qty: 1, rate: -depositAmount, amount: -depositAmount })
      }
      for (const ex of (pb.extras || [])) {
        const desc = (ex as any).description || (ex as any).title || 'Extra'
        const amt = Number((ex as any).amount ?? (ex as any).price ?? 0) || 0
        items.push({ title: 'Extra', description: String(desc), qty: 1, rate: amt, amount: amt })
      }
      const appt = await prisma.appointment.findFirst({ where: { leadId: updated.id, allDay: true }, orderBy: { start: 'desc' }, select: { id: true } })
      // Generate unique number YYYYMM-####
      const y = new Date()
      const prefix = `${y.getFullYear()}${String(y.getMonth()+1).padStart(2,'0')}`
      let seq = 0
      try {
        const last = await prisma.invoice.findFirst({ where: { tenantId: updated.tenantId, number: { startsWith: `${prefix}-` } }, orderBy: { number: 'desc' }, select: { number: true } })
        if (last?.number) { const m = last.number.match(/-(\d{4})$/); if (m) seq = parseInt(m[1],10) }
      } catch {}
      let number = `${prefix}-${String(seq + 1).padStart(4,'0')}`
      let created: any = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          created = await prisma.invoice.create({
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
          break
        } catch (e:any) {
          if (String(e?.message||'').includes('Unique') || String(e?.message||'').includes('unique')) { seq += 1; number = `${prefix}-${String(seq + 1).padStart(4,'0')}`; continue }
          throw e
        }
      }
      if (!created?.id) {
        // Fallback: draft without number
        created = await prisma.invoice.create({
          data: {
            tenantId: updated.tenantId,
            leadId: updated.id,
            contactId: updated.contactId || undefined,
            appointmentId: appt?.id || undefined,
            status: 'PENDING',
            contractPrice,
            depositAmount,
            extrasJson: items.length ? JSON.stringify(items) : undefined,
            extrasTotal,
            totalDue,
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          }
        })
      }
      // Refresh invoices page
      revalidatePath('/invoices')
    } catch {}
  }
  revalidatePath("/leads");
}

export default async function LeadsPage() {
  const stages: Array<{ key: string; label: string }> = [
    { key: "LEAD", label: "Leads" },
    { key: "PROSPECT", label: "Prospects" },
    { key: "APPROVED", label: "Approved" },
    { key: "COMPLETED", label: "Completed" },
    { key: "INVOICED", label: "Invoiced" },
    { key: "ARCHIVE", label: "Archive" }
  ];

  const leads = await prisma.lead.findMany({
    include: { contact: true, property: true },
    orderBy: { createdAt: "desc" }
  });
  // Precompute pricing breakdown for APPROVED leads (N+1 acceptable for now; could batch later)
  const breakdownMap: Record<string, { contractPrice: number | null; grandTotal: number | null; extrasTotal: number }> = {};
  for (const l of leads) {
    if (l.stage === 'APPROVED') {
      const b = await pricingBreakdownForLead(l.id);
      breakdownMap[l.id] = { contractPrice: b.contractPrice, grandTotal: b.grandTotal, extrasTotal: b.extrasTotal };
    }
  }

  const approvedTotal = leads.filter((l: any) => l.stage === "APPROVED").reduce((sum: number, l: any) => {
    const b = breakdownMap[l.id];
    const val = b?.grandTotal !== null ? b.grandTotal : (l.contractPrice || 0);
    return sum + val;
  }, 0);
  const completedTotal = leads.filter((l: any) => l.stage === "COMPLETED").reduce((sum: number, l: any) => sum + (l.contractPrice || 0), 0);
  const invoicedTotal = leads.filter((l: any) => l.stage === "INVOICED").reduce((sum: number, l: any) => sum + (l.contractPrice || 0), 0);
  const stageTotals: Record<string, number> = { APPROVED: approvedTotal, COMPLETED: completedTotal, INVOICED: invoicedTotal };

  return (
    <div className="space-y-4 relative">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <NewLeadButton />
      </div>
  {/* Global pipeline scroller to adjust a selected lead's stage */}
  <InteractivePipeline />
  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
    {stages.map((s) => {
        const totalVal = stageTotals[s.key];
        const count = leads.filter((l: any) => l.stage === s.key).length;
        return (
      <div key={s.key} id={`stage-${s.key.toLowerCase()}`} className="space-y-1 scroll-mt-24">
            {typeof totalVal === 'number' && !isNaN(totalVal) ? (
              <div className="text-xs font-semibold text-emerald-700 tracking-wide uppercase">Total: ${totalVal.toLocaleString()}</div>
            ) : <div className="h-4" />}
            <Card className="min-h-[60vh]">
              <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-xl">
                <CardTitle className="text-white font-bold flex items-center justify-between">
                  <span>{s.label}</span>
                  <span className="text-white/90 text-sm">{count}</span>
                </CardTitle>
              </CardHeader>
               <CardContent className="space-y-3" data-stage-container={s.key}>
                {leads.filter((l: { stage: string }) => l.stage === s.key).map((lead: any) => (
                  <div key={lead.id} data-lead-id={lead.id} data-contact-id={lead.contactId || lead.contact?.id} data-stage={lead.stage} className="cursor-pointer text-left w-full rounded-lg border p-3 hover:shadow transition group focus:outline-none focus:ring-2 focus:ring-sky-400">
                    {/* Title: customer (contact) name only */}
                    <div className="font-medium">
                      {lead.contact?.name || lead.title || 'Untitled Lead'}
                    </div>
                    {/* Price for approved jobs */}
                    {s.key === 'APPROVED' && (() => {
                      const b = breakdownMap[lead.id];
                      if (!b) return null;
                      const base = typeof b.contractPrice === 'number' && isFinite(b.contractPrice) ? b.contractPrice : null;
                      const grand = b.grandTotal !== null ? b.grandTotal : base;
                      if (grand === null) return null;
                      const extras = b.extrasTotal;
                      return (
                        <div className="text-xs font-semibold text-emerald-700">
                          {base !== null ? `$${base.toLocaleString()}` : ''}{extras > 0 && base !== null && (
                            <> + ${extras.toLocaleString()} = <span className="text-emerald-600 text-sm">${grand.toLocaleString()}</span></>
                          )}
                          {extras > 0 && base === null && `$${grand.toLocaleString()}`}
                        </div>
                      );
                    })()}
                    {/* Category (if present) */}
                    {lead.category ? (
                      <div className="text-xs text-slate-500">{lead.category}</div>
                    ) : null}
                    {/* Address (property address1) */}
                    <div className="text-xs text-slate-500">{lead.property?.address1 || '—'}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        );
      })}
      </div>
  <LeadsClient leads={leads as any} />
  <LeadsDragDropClient />
    </div>
  );
}

function nextStage(stage: string) {
  const order = ["LEAD","PROSPECT","APPROVED","COMPLETED","INVOICED"];
  const idx = order.indexOf(stage);
  if (idx === -1) return "LEAD";
  if (idx === order.length - 1) return "ARCHIVE"; // move to archive after invoiced
  return order[idx+1];
}

// Client wrappers for interactive controls -----------------------------
function InteractivePipeline() {
  // This could later hold global selection logic; placeholder now.
  return (
    <div className="rounded-lg border p-3 bg-white">
      <div className="text-xs font-semibold text-slate-500 mb-1">Adjust Stage (hover card for inline)</div>
      <div className="text-xs text-slate-400">Hover a lead card to reveal its stage selector.</div>
    </div>
  );
}
