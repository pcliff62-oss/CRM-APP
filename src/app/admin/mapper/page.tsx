"use client";
import React, { useEffect, useMemo, useState } from "react";
import { mapSnapshotToWeb } from "@/templates/hytech/field-map";

export default function MapperAdmin() {
  const [token, setToken] = useState("");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [err, setErr] = useState("");

  const view = useMemo(() => (snapshot ? mapSnapshotToWeb(snapshot) : null), [snapshot]);

  const load = async () => {
    setErr("");
    try {
      const res = await fetch(`/api/proposals/public/${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSnapshot(data?.snapshot || {});
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-xl font-semibold mb-4">Web Proposal Mapper Preview</div>
        <div className="flex gap-2 mb-4">
          <input className="border rounded px-2 py-1 flex-1" value={token} onChange={(e)=>setToken(e.target.value)} placeholder="Paste public token" />
          <button className="px-3 py-1 rounded bg-slate-900 text-white" onClick={load}>Load</button>
        </div>
        {err && <div className="text-rose-600 mb-3">{err}</div>}
        {view && (
          <div className="bg-white rounded border p-4">
            <div className="font-medium mb-2">Scope of Work</div>
            <div className="space-y-2">
              {view.lines.map((line: string, i: number) => (<p key={i}>{line}</p>))}
            </div>
            <div className="mt-3 text-right font-semibold">Total: {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(view.grandTotal || 0)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
