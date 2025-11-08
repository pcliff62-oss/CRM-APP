import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Best-effort detectors for selection values inside a proposal snapshot/HTML
function detectShingleType(txt: string): "Landmark" | "Landmark-PRO" | "Northgate" | null {
  const s = txt.toLowerCase();
  if (s.includes("northgate")) return "Northgate";
  if (s.includes("landmark pro") || s.includes("landmark-pro")) return "Landmark-PRO";
  if (s.includes("landmark")) return "Landmark";
  return null;
}

type DripType = "hicks_vent" | "aluminum_8" | "copper_5" | null;
function detectDripType(txt: string): DripType {
  const s = txt.toLowerCase();
  if (s.includes("hicks")) return "hicks_vent";
  if (s.includes("copper 5") || s.includes("copper-5") || s.includes("copper drip")) return "copper_5";
  if (s.includes("aluminum 8") || s.includes("8\" drip") || s.includes("8\u201d drip")) return "aluminum_8";
  return null;
}
function detectColorStr(txt: string): "white" | "black" | "brown" | "copper" | null {
  const s = txt.toLowerCase();
  if (s.includes('copper')) return 'copper';
  if (s.includes('white')) return 'white';
  if (s.includes('black')) return 'black';
  if (s.includes('brown')) return 'brown';
  return null;
}

// Deep scan helpers for snapshotJson
function deepValues(obj: any): any[] { if (!obj || typeof obj !== 'object') return []; const out: any[] = []; const stack = [obj]; while (stack.length) { const v = stack.pop(); if (v && typeof v === 'object') { for (const k of Object.keys(v)) { const val = (v as any)[k]; out.push({ k, v: val }); if (val && typeof val === 'object') stack.push(val); } } } return out; }
function pickStringByKeys(obj: any, keys: string[]): string | null {
  try {
    const all = deepValues(obj);
    for (const { k, v } of all) {
      const lk = String(k).toLowerCase();
      if (keys.some(t => lk.includes(t))) {
        if (typeof v === 'string' && v.trim()) return v;
        if (typeof v === 'boolean') return v ? 'true' : 'false';
      }
    }
  } catch {}
  return null;
}
function detectShingleFromJson(obj: any): ReturnType<typeof detectShingleType> {
  const s = pickStringByKeys(obj, ['shingle','shingletype','asphalt']);
  return s ? detectShingleType(s) : null;
}
function detectIwFullFromJson(obj: any): boolean {
  try {
    const all = deepValues(obj);
    for (const { k, v } of all) {
      const lk = String(k).toLowerCase();
      if ((lk.includes('iw') || lk.includes('ice')) && (lk.includes('full') || lk.includes('100'))) {
        if (typeof v === 'boolean') return v;
        const sv = String(v).toLowerCase();
        if (sv.includes('true') || sv.includes('yes') || sv.includes('100')) return true;
      }
    }
  } catch {}
  return false;
}

function stripHtml(text: string) {
  return text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function findDripLine(all: string, which: 'eave'|'rake') {
  const t = stripHtml(all.toLowerCase());
  const lines = all
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .split(/\n|\.|\r/)
    .map(s=>s.trim())
    .filter(Boolean);
  const want = which === 'eave' ? ['eave','eaves'] : ['rake','rakes','gable','gables'];
  let best: string | null = null; let score = -1;
  for (const L of lines) {
    const s = L.toLowerCase();
    let sc = 0;
    if (s.includes('drip edge')) sc += 2;
    if (want.some(w=> s.includes(w))) sc += 2;
    if (s.includes('supply') || s.includes('install')) sc += 1;
    if (sc > score) { score = sc; best = L; }
  }
  return best;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead") || searchParams.get("leadId");
    if (!leadId) return NextResponse.json({ error: "Missing lead id" }, { status: 400 });

    // Fetch lead with relations
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { contact: true, property: true, proposals: { orderBy: { createdAt: "desc" }, take: 3 } },
    });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    // Choose best measurement similar to proposal prefill route
    async function pickBestMeasurement(where: any) {
      const list = await prisma.measurement.findMany({ where, orderBy: { createdAt: "desc" }, take: 8 });
      if (!list || list.length === 0) return null;
      for (const m of list) {
        if (typeof m.totalSquares === "number" && m.totalSquares > 0) return m;
        try {
          const fc = JSON.parse(m.geojson || "null");
          if (
            fc &&
            ((Array.isArray(fc.features) && fc.features.length > 0) ||
              (fc.properties && (fc.properties.edgeTotalsFt || fc.properties.accessoryTotals)))
          ) {
            return m;
          }
        } catch {}
      }
      return list[0];
    }
    let measurement = await pickBestMeasurement({ leadId });
    if (!measurement && lead.propertyId) {
      measurement = await pickBestMeasurement({ propertyId: lead.propertyId });
    }

    // Defaults and accumulators
    let squares = Number(measurement?.totalSquares || 0) || 0;
    let edgeTotals: Record<string, number> = {};
    let accTotals = { smallPipe: 0, largePipe: 0, vents636: 0, vents634: 0, skylights: 0 };
    if (measurement) {
      try {
        const fc = JSON.parse(measurement.geojson || "null");
        if (fc?.properties?.edgeTotalsFt) edgeTotals = { ...fc.properties.edgeTotalsFt };
        // derive more accurate squares from per-feature areas if present
        const feats = Array.isArray(fc?.features) ? fc.features : [];
        let sumFt2 = 0;
        for (const f of feats) {
          const surf = Number((f as any)?.properties?.surfaceAreaFt2 || 0);
          if (surf > 0) sumFt2 += surf;
          const accs = Array.isArray((f as any)?.properties?.accessories) ? (f as any).properties.accessories : [];
          for (const acc of accs) {
            const type = (acc?.type || '').toString();
            if (type === 'Skylight') { accTotals.skylights++; continue; }
            if (type === 'Pipe flange') {
              const raw = (acc?.data?.size || '').toString();
              const nums = Array.from(raw.matchAll(/\d+(?:\.\d+)?/g)).map((m) => parseFloat((m as RegExpMatchArray)[0]));
              const sizeIn = nums.length ? Math.max(...nums) : NaN;
              if (Number.isFinite(sizeIn)) { if (sizeIn >= 4) accTotals.largePipe++; else accTotals.smallPipe++; }
              else { const s = raw.toLowerCase(); if (s.includes('4')) accTotals.largePipe++; else accTotals.smallPipe++; }
              continue;
            }
            if (type === 'Vents') {
              const opts: string[] = Array.isArray(acc?.data?.options) ? acc.data.options : [];
              for (const o of opts) { const v = String(o).trim(); if (v === '636') accTotals.vents636++; else if (v === '634') accTotals.vents634++; }
            }
          }
        }
        if (sumFt2 > 0) squares = Math.round((sumFt2 / 100) * 100) / 100;
      } catch {}
    }

    const eaveFt = Math.round((Number(edgeTotals.eave || 0)) * 100) / 100;
    const rakeFt = Math.round((Number(edgeTotals.rake || 0)) * 100) / 100;
    const ridgeFt = Math.round((Number(edgeTotals.ridge || 0)) * 100) / 100;
    const hipFt = Math.round((Number(edgeTotals.hip || 0)) * 100) / 100;
    const valleysFt = Math.round((Number(edgeTotals.valley || 0)) * 100) / 100;
    const flashingFt = Math.round((Number(edgeTotals.flashing || 0)) * 100) / 100;
    const transitionFt = Math.round((Number(edgeTotals.transition || 0)) * 100) / 100;

    // Proposal-derived selections
    let shingleType: "Landmark" | "Landmark-PRO" | "Northgate" | null = null;
    let dripEaveType: DripType = null;
    let dripRakeType: DripType = null;
    let iwFull = false;
    let eaveColor: "white"|"black"|"brown"|"copper"|null = null;
    let rakeColor: "white"|"black"|"brown"|"copper"|null = null;
  for (const p of lead.proposals || []) {
      const snap = p.snapshotJson ? (()=>{ try { return JSON.parse(p.snapshotJson); } catch { return null; } })() : null;
      if (!shingleType && snap) shingleType = detectShingleFromJson(snap) || shingleType;
      if (snap) iwFull = iwFull || detectIwFullFromJson(snap);
      // try explicit keys for drip eave/rake
      if (snap) {
        const eTxt = pickStringByKeys(snap, ['dripedge_eave','drip_eave','asphalt_drip_eave_label','cedar_drip_eave_label']);
        const rTxt = pickStringByKeys(snap, ['dripedge_rake','drip_rake','asphalt_drip_rake_label','cedar_drip_rake_label']);
        if (!dripEaveType && eTxt) dripEaveType = detectDripType(eTxt);
        if (!dripRakeType && rTxt) dripRakeType = detectDripType(rTxt);
        if (!eaveColor && eTxt) eaveColor = detectColorStr(eTxt) || eaveColor;
        if (!rakeColor && rTxt) rakeColor = detectColorStr(rTxt) || rakeColor;
        const eClrTxt = pickStringByKeys(snap, ['dripedge_color','drip_edge_color','asphalt_dripedge_color_label','asphalt_dripEdge_color_label']);
        const rClrTxt = pickStringByKeys(snap, ['rakedrip_color','rake_drip_color','asphalt_rakedrip_color_label','asphalt_rakeDrip_color_label']);
        if (!eaveColor && eClrTxt) eaveColor = detectColorStr(eClrTxt) || eaveColor;
        if (!rakeColor && rClrTxt) rakeColor = detectColorStr(rClrTxt) || rakeColor;
      }
      const hay = [p.mergedHtml || "", p.templateBody || ""].join("\n");
      // Prefer line-specific detection for eave/rake
      const eLine = findDripLine(hay, 'eave');
      const rLine = findDripLine(hay, 'rake');
      if (eLine) {
        const t: DripType = detectDripType(eLine) || dripEaveType;
        dripEaveType = t || dripEaveType;
        const c = detectColorStr(eLine) || (t === 'copper_5' ? 'copper' : null);
        eaveColor = c || eaveColor;
      }
      if (rLine) {
        const t: DripType = detectDripType(rLine) || dripRakeType;
        dripRakeType = t || dripRakeType;
        const c = detectColorStr(rLine) || (t === 'copper_5' ? 'copper' : null);
        rakeColor = c || rakeColor;
      }
      if (!shingleType) shingleType = detectShingleType(hay);
      if (!dripEaveType) dripEaveType = detectDripType(hay);
      if (!dripRakeType) dripRakeType = detectDripType(hay);
  // Avoid global bleed: only fallback if still missing and no copper keyword nearby gable/eave words
  if (!eaveColor && !eLine) eaveColor = detectColorStr(hay) || eaveColor;
  if (!rakeColor && !rLine) rakeColor = detectColorStr(hay) || rakeColor;
      const low = hay.toLowerCase();
      if (low.includes("100% ice") || low.includes("full ice") || low.includes("100% i&w") || low.includes("iw full") || low.includes("full i&w")) iwFull = true;
    }

    // Return payload – client can apply waste/i&w toggles and recompute counts
    const customer = {
      name: lead.contact?.name || "",
      email: lead.contact?.email || "",
      phone: lead.contact?.phone || "",
      address: lead.property ? [lead.property.address1, lead.property.city, [lead.property.state, lead.property.postal].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "",
    };

    return NextResponse.json({
      customer,
      measure: { squares, eaveFt, rakeFt, ridgeFt, hipFt, valleysFt, flashingFt, transitionFt },
      accessories: accTotals,
      selections: {
        shingleType: shingleType || "Landmark-PRO",
        dripEaveType: dripEaveType || null,
        dripRakeType: dripRakeType || null,
  eaveColor: eaveColor || (dripEaveType === 'copper_5' ? 'copper' : null),
  rakeColor: rakeColor || (dripRakeType === 'copper_5' ? 'copper' : null),
        iwFull,
        wastePct: 10,
        color: "",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
