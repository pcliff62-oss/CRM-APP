import prisma from "@/lib/db";
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
  await prisma.lead.update({ where: { id }, data: { stage: stage as any } });
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

  const approvedTotal = leads.filter((l: any) => l.stage === "APPROVED").reduce((sum: number, l: any) => sum + (l.contractPrice || 0), 0);
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
        return (
          <div key={s.key} className="space-y-1">
            {typeof totalVal === 'number' && !isNaN(totalVal) ? (
              <div className="text-xs font-semibold text-emerald-700 tracking-wide uppercase">Total: ${totalVal.toLocaleString()}</div>
            ) : <div className="h-4" />}
            <Card className="min-h-[60vh]">
              <CardHeader>
                <CardTitle>{s.label}</CardTitle>
              </CardHeader>
               <CardContent className="space-y-3" data-stage-container={s.key}>
                {leads.filter((l: { stage: string }) => l.stage === s.key).map((lead: any) => (
                  <div key={lead.id} data-lead-id={lead.id} data-contact-id={lead.contactId || lead.contact?.id} data-stage={lead.stage} className="cursor-pointer text-left w-full rounded-lg border p-3 hover:shadow transition group focus:outline-none focus:ring-2 focus:ring-sky-400">
                    {/* Title: customer (contact) name only */}
                    <div className="font-medium">
                      {lead.contact?.name || lead.title || 'Untitled Lead'}
                    </div>
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
