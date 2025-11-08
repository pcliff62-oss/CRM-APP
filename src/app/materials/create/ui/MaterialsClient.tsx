"use client";
import { useEffect, useMemo, useState } from "react";

type Prefill = {
  customer: { name: string; email: string; phone: string; address: string };
  measure: { squares: number; eaveFt: number; rakeFt: number; ridgeFt: number; hipFt: number; valleysFt: number; flashingFt: number; transitionFt: number };
  accessories: { smallPipe: number; largePipe: number; vents636: number; vents634: number; skylights: number };
  selections: {
    shingleType: string;
    dripEaveType: string | null;
    dripRakeType: string | null;
    eaveColor?: 'white'|'black'|'brown'|'copper'|null;
    rakeColor?: 'white'|'black'|'brown'|'copper'|null;
    iwFull: boolean;
    wastePct: number;
    color: string;
  };
};

function ceilTo(n: number, step: number) { return Math.ceil((n || 0) / step) * step; }
function roundUp(n: number) { return Math.ceil(n); }

function computeMaterials(p: Prefill) {
  const m = p.measure;
  const sel = p.selections;
  const squares = Math.max(0, Number(m.squares || 0));
  const wasteSquares = squares * (1 + (Number(sel.wastePct || 0) / 100));
  // Drip edges: 10' pieces; associate eave/rake separately and round up to nearest 10'
  const eaveDripFt = ceilTo(m.eaveFt, 10);
  const rakeDripFt = ceilTo(m.rakeFt, 10);
  const eaveIsHicks = (sel.dripEaveType === 'hicks_vent') || (sel.dripRakeType === 'hicks_vent');
  const eaveDripPieces8 = eaveIsHicks ? 0 : Math.ceil(eaveDripFt / 10);
  const rakeDripPieces8 = Math.ceil(rakeDripFt / 10);
  // Ice & Water Shield: 60ft rolls; apply on eaves, transitions, flashings by default; if 100% selected, 1 roll per 2 squares
  let iwFeet = 0;
  if (sel.iwFull) {
    // 1 roll per 2 squares => compute rolls directly from squares
    const rolls = Math.ceil(wasteSquares / 2);
    iwFeet = rolls * 60; // for reporting
  } else {
    iwFeet = (m.eaveFt || 0) + (m.transitionFt || 0) + (m.flashingFt || 0);
  }
  const iwRolls = sel.iwFull ? Math.ceil(wasteSquares / 2) : Math.ceil(iwFeet / 60);
  // Ridge caps: go on hips and ridges; 30ft per bundle
  const ridgeCapFt = (m.ridgeFt || 0) + (m.hipFt || 0);
  const ridgeCapBundles = Math.ceil(ridgeCapFt / 30);
  // Starter shingles: on eaves and rakes; 115ft per bundle
  const starterFt = (m.eaveFt || 0) + (m.rakeFt || 0);
  const starterBundles = Math.ceil(starterFt / 115);
  // Underlayment rolls: 10 squares per roll
  const paperRolls = Math.ceil(wasteSquares / 10);
  // Nails: 1 box covers 15 squares
  const nailBoxes = Math.ceil(wasteSquares / 15);
  // Ridge vent: ridges only; 4 ft per piece
  const ridgeVentPieces = Math.ceil((m.ridgeFt || 0) / 4);
  // Bundles of shingles: assume 3 bundles per square (as common for Landmark/Northgate)
  const bundlesOfShingles = Math.ceil(wasteSquares * 3);
  // Hicks vent pieces if eave drip is Hicks (10' pieces like drip)
  const hicksVentPieces = eaveIsHicks ? Math.ceil(eaveDripFt / 10) : 0;

  return {
    customer: p.customer,
    selections: sel,
    computed: {
      bundlesOfShingles,
      bundlesOfRidgeCaps: ridgeCapBundles,
      piecesCertainteedFilterRidge: ridgeVentPieces,
      bundlesOfStarters: starterBundles,
      rollsOfIceAndWater: iwRolls,
  rollsOfRoofRunnerPaper: paperRolls,
  eaveDripPieces8,
  rakeDripPieces8,
  eaveDripFt, rakeDripFt,
  hicksVent: hicksVentPieces,
      roofNailsBoxes: nailBoxes,
      pipeFlangesSmall: p.accessories.smallPipe,
      pipeFlangesLarge: p.accessories.largePipe,
      vents636: p.accessories.vents636,
      vents634: p.accessories.vents634,
      skylights: p.accessories.skylights,
      ridgeVentPieces,
      ridgeCapFt, ridgeFt: m.ridgeFt,
    }
  };
}

export default function MaterialsClient({ leadId }: { leadId?: string }) {
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [color, setColor] = useState("");
  const [shingleType, setShingleType] = useState("Landmark-PRO");
  const [iwFull, setIwFull] = useState(false);
  const [wastePct, setWastePct] = useState(10);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams(); if (leadId) qs.set("lead", leadId);
        const res = await fetch(`/api/materials/prefill?${qs.toString()}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) {
          setPrefill(data);
          setColor(data?.selections?.color || "");
          setShingleType(data?.selections?.shingleType || "Landmark-PRO");
          setIwFull(Boolean(data?.selections?.iwFull));
          setWastePct(Number(data?.selections?.wastePct || 10));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  const result = useMemo(() => {
    if (!prefill) return null;
    return computeMaterials({ ...prefill, selections: { ...prefill.selections, color, shingleType, iwFull, wastePct } as any });
  }, [prefill, color, shingleType, iwFull, wastePct]);

  if (!prefill || !result) return <div className="text-sm text-slate-600">Loading…</div>;

  const c = result.customer;
  const r = result.computed as any;

  return (
    <div className="bg-white rounded-lg shadow border overflow-hidden">
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/LOGO-2017-edit-GOOD.png" alt="HyTech Roofing" className="h-10" />
            <div className="text-slate-600">
              <div className="text-xl font-semibold text-sky-700">Material Order Form</div>
            </div>
          </div>
          <div className="text-xs text-right text-slate-500">
            <div>Date: {new Date().toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 bg-slate-50 border-b grid gap-3 md:grid-cols-4">
        <label className="text-xs grid gap-1">
          <span>Shingle Type</span>
          <select value={shingleType} onChange={(e)=>setShingleType(e.target.value)} className="h-9 rounded border px-2">
            <option>Landmark</option>
            <option>Landmark-PRO</option>
            <option>Northgate</option>
          </select>
        </label>
        <label className="text-xs grid gap-1">
          <span>Color</span>
          <input value={color} onChange={(e)=>setColor(e.target.value)} className="h-9 rounded border px-2" placeholder="Type color" />
        </label>
        <label className="text-xs grid gap-1">
          <span>Waste %</span>
          <input type="number" value={wastePct} onChange={(e)=>setWastePct(Math.max(0, Number(e.target.value||0)))} className="h-9 rounded border px-2 w-24" />
        </label>
        <label className="text-xs inline-flex items-center gap-2 mt-6">
          <input type="checkbox" checked={iwFull} onChange={(e)=>setIwFull(e.target.checked)} />
          <span>100% Ice & Water</span>
        </label>
      </div>

      {/* Customer Info */}
      <div className="p-6 grid gap-4">
        <div className="text-sky-700 font-semibold">Customer Info</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <InfoRow label="Customer Name" value={c.name || ""} />
          <InfoRow label="Customer Address" value={c.address || ""} />
          <InfoRow label="Shingle Type" value={shingleType} />
          <InfoRow label="Color" value={color} editable onChange={setColor} />
        </div>
      </div>

      {/* Job Details */}
      <div className="px-6 pb-4">
        <div className="text-sky-700 font-semibold mb-2">Job Details</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <InfoRow label="Eave Drip Edge" value={(() => {
            // If Hicks is selected anywhere, treat eave as Hicks regardless of other values
            const eType = prefill.selections.dripEaveType === 'hicks_vent' || prefill.selections.dripRakeType === 'hicks_vent' ? 'hicks_vent' : prefill.selections.dripEaveType;
            const color = prefill.selections.eaveColor || (eType === 'copper_5' ? 'copper' : 'white');
            // Only show color/material per requirement
            return color;
          })()} editable />
          <InfoRow label="Rake Drip Edge" value={(() => {
            const rType = prefill.selections.dripRakeType;
            const color = prefill.selections.rakeColor || (rType === 'copper_5' ? 'copper' : 'white');
            return color;
          })()} editable />
        </div>
      </div>

      {/* Materials table */}
      <div className="px-6 pb-6">
        <div className="text-sky-700 font-semibold mb-2">Materials</div>
        <table className="w-full text-sm border">
          <tbody>
            <Row label="Bundles of Shingles" value={r.bundlesOfShingles} />
            <Row label="Bundles of Ridge Caps" value={r.bundlesOfRidgeCaps} />
            <Row label={'Pieces Certainteed Filter Ridge'} value={r.piecesCertainteedFilterRidge} />
            <Row label="Bundles of Starters" value={r.bundlesOfStarters} />
            <Row label="Rolls of winterguard Ice and water" value={r.rollsOfIceAndWater} />
            <Row label="Rolls of Roof Runner Paper" value={r.rollsOfRoofRunnerPaper} />
            <Row label={'8" Drip Edge (Eave)'} value={r.eaveDripPieces8} />
            <Row label={'8" Drip Edge (Rake)'} value={r.rakeDripPieces8} />
            <Row label="Hicks Vent" value={r.hicksVent} />
            <Row label={'Roof Nails (1 1/4")'} value={r.roofNailsBoxes} />
            <Row label={'1-3" Universal Pipe Flanges'} value={r.pipeFlangesSmall} />
            <Row label={'>=4" Pipe Flanges'} value={r.pipeFlangesLarge} />
            <Row label="636 Vents" value={r.vents636} />
            <Row label="634 Vents" value={r.vents634} />
            <Row label="Skylights" value={r.skylights} />
            <Row label="Ridge Vent (4' pieces)" value={r.ridgeVentPieces} />
          </tbody>
        </table>
      </div>

      <div className="p-4 flex justify-end gap-2 border-t bg-slate-50">
        <button className="h-9 px-4 rounded-md border" onClick={()=>window.print()}>Print</button>
      </div>
    </div>
  );
}

function InfoRow({ label, value, editable, onChange }:{ label: string; value: string; editable?: boolean; onChange?: (v:string)=>void }){
  return (
    <div className="grid grid-cols-3 border rounded">
      <div className="col-span-1 px-2 py-2 bg-slate-100 text-slate-700 text-xs font-semibold">{label}</div>
      <div className="col-span-2 px-2 py-2">
        {editable ? (<input value={value} onChange={e=>onChange?.(e.target.value)} className="h-8 w-full border rounded px-2" />) : (<span>{value}</span>)}
      </div>
    </div>
  );
}

function Row({ label, value, note }:{ label: string; value: number | string; note?: string }){
  return (
    <tr className="border-b">
      <td className="p-2 bg-slate-100 text-slate-700 w-2/3">{label}</td>
      <td className="p-2 text-right tabular-nums">{String(value)}</td>
      {note ? <td className="p-2 text-xs text-slate-500">{note}</td> : null}
    </tr>
  );
}
