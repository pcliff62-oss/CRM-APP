// Proposals listing & editor page
import prisma from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import ProposalEditor from "./proposalEditor";

export default async function ProposalsPage({ searchParams }: { searchParams: { lead?: string } }) {
  const proposals = await prisma.proposal.findMany({ orderBy: { updatedAt: "desc" }, include: { lead: { include: { contact: true, property: true } } } });
  const currentLead = searchParams.lead ? await prisma.lead.findUnique({ where: { id: searchParams.lead }, include: { contact: true, property: true } }) : null;
  const createHref = currentLead?.id ? `/proposals/create?lead=${currentLead.id}` : "/proposals/create";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Proposals</CardTitle>
            <Link href={createHref} className="text-sm underline">Create proposal</Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {proposals.map((p: { id: string; templateName: string; status: string; leadId: string | null }) => (
            <div key={p.id} className="rounded-lg border p-3">
              <div className="font-medium">{p.templateName}</div>
              <div className="text-xs text-slate-500">Status: {p.status}</div>
              <div className="text-xs text-slate-500">Lead: {p.leadId ? <Link href={`/?lead=${p.leadId}`}>{p.leadId}</Link> : "—"}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Editor / Preview</CardTitle></CardHeader>
        <CardContent>
          <ProposalEditor initialLeadId={currentLead?.id ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
