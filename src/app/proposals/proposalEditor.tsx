"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Lead = {
  id: string; title: string;
  contact?: { name: string | null } | null;
  property?: { address1: string | null, city: string | null, state: string | null, postal: string | null } | null;
};

export default function ProposalEditor({ initialLeadId }: { initialLeadId: string }) {
  const [leadId, setLeadId] = useState(initialLeadId);
  const [lead, setLead] = useState<Lead | null>(null);
  const [templateName, setTemplateName] = useState("Retail Reroof");
  const [templateBody, setTemplateBody] = useState("<h1>Proposal for {{customer.name}}</h1><p>Property: {{property.address}}</p><p>Total squares (with waste): {{measure.totalSquares}}</p><p>Price: ${{estimate.total}}</p>");
  const [mergeData, setMergeData] = useState({ measure: { totalSquares: 28.5 }, estimate: { total: 14250 }, customer: { name: "Jane Homeowner" }, property: { address: "123 Main St, Anytown NY 11111" } });

  useEffect(() => {
    if (!leadId) return;
    fetch(`/api/leads?id=${leadId}`).then(r => r.json()).then(setLead).catch(() => {});
  }, [leadId]);

  function render() {
    const tokens: Record<string,string> = {
      "{{customer.name}}": lead?.contact?.name || mergeData.customer.name,
      "{{property.address}}": (lead?.property ? `${lead.property.address1}, ${lead.property.city} ${lead.property.state} ${lead.property.postal}` : mergeData.property.address),
      "{{measure.totalSquares}}": String(mergeData.measure.totalSquares),
      "{{estimate.total}}": String(mergeData.estimate.total)
    };
    let html = templateBody;
    for (const [k,v] of Object.entries(tokens)) html = html.split(k).join(v);
    return { __html: html };
  }

  function save() {
    fetch("/api/proposals", { method: "POST", body: JSON.stringify({ templateName, templateBody, leadId: leadId || null, mergedHtml: "" }) })
      .then(() => alert("Saved proposal ✔"))
      .catch(() => alert("Failed to save"));
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 items-center">
        <label className="text-sm">Lead ID</label>
        <Input className="col-span-2" value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="Paste a lead id (optional)" />
        <label className="text-sm">Template Name</label>
        <Input className="col-span-2" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
      </div>
      <textarea value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} className="w-full h-40 border rounded-md p-2 text-sm" />
      <div className="flex items-center gap-2">
        <Button onClick={save}>Save</Button>
        <Button variant="secondary" onClick={() => window.print()}>Print / PDF</Button>
      </div>
      <div className="mt-4 border rounded-lg p-4">
        <div className="text-sm text-slate-500 mb-2">Preview</div>
        <div dangerouslySetInnerHTML={render()} />
      </div>
      <div className="text-xs text-slate-500">
        Tokens supported:{" "}
        {(["{{customer.name}}", "{{property.address}}", "{{measure.totalSquares}}", "{{estimate.total}}"] as const).map((t, i) => (
          <code key={t} className="mr-2">{t}</code>
        ))}
      </div>
    </div>
  );
}
