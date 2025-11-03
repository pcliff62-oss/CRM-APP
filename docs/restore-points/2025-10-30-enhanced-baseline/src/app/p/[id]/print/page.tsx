"use client";
import React, { useEffect, useMemo, useState } from "react";
import { mapSnapshotToWeb } from "@/templates/hytech/field-map";
import { renderProposalTemplate } from "@/lib/webProposal/render";

export default function ProposalPrint({ params }: { params: { id: string } }) {
  const id = params.id;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [snapshot, setSnapshot] = useState<any>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/proposals/public/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!mounted) return;
        setSnapshot(data?.snapshot || {});
      } catch (e: any) {
        if (!mounted) return; setErr(e?.message || "Failed to load");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const view = useMemo(() => mapSnapshotToWeb(snapshot), [snapshot]);
  const [tpl, setTpl] = useState<string>("");
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/proposals/template", { cache: "no-store" });
        const t = await r.text();
        if (mounted) setTpl(t);
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);
  const html = useMemo(() => (tpl ? renderProposalTemplate(tpl, view as any, snapshot as any) : ""), [tpl, view, snapshot]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  if (err) return <div className="min-h-screen flex items-center justify-center text-rose-600">{err}</div>;

  return (
    <div className="proposal-doc min-h-screen bg-white">
      <div className="max-w-2xl mx-auto p-4">
        <div className="bg-white rounded-xl shadow p-4">
          {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <div className="text-sm text-slate-500">Loading template…</div>}
        </div>
      </div>
    </div>
  );
}
