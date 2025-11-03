import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead") || searchParams.get("leadId");
    if (!leadId) return NextResponse.json({ error: "Missing lead id" }, { status: 400 });

    // Tenant scoping when available; fall back gracefully if unauthenticated
    let tenantId: string | null = null;
    try {
      tenantId = await getCurrentTenantId(req);
    } catch {}

    // Fetch lead + related contact/property
    const lead = await prisma.lead.findFirst({
      where: tenantId ? { id: leadId, tenantId } : { id: leadId },
      include: { contact: true, property: true },
    });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    // Choose the newest measurement that actually has computed data
    async function pickBestMeasurement(where: any) {
      const list = await prisma.measurement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 8 });
      if (!list || list.length === 0) return null;
      for (const m of list) {
        if (typeof m.totalSquares === 'number' && m.totalSquares > 0) return m;
        try {
          const fc = JSON.parse(m.geojson || 'null');
          if (fc && ((Array.isArray(fc.features) && fc.features.length > 0) || (fc.properties && (fc.properties.edgeTotalsFt || fc.properties.accessoryTotals)))) {
            return m;
          }
        } catch {}
      }
      return list[0];
    }
    let measurement = await pickBestMeasurement(tenantId ? { leadId, tenantId } : { leadId });
    if (!measurement && lead.propertyId) {
      measurement = await pickBestMeasurement(tenantId ? { propertyId: lead.propertyId, tenantId } : { propertyId: lead.propertyId });
    }

    const todayISO = new Date().toISOString().slice(0, 10);

    const customer = {
      name: lead.contact?.name || "",
      tel: lead.contact?.phone || "",
      cell: lead.contact?.phone || "",
      email: lead.contact?.email || "",
      street: lead.property?.address1 || "",
      city: lead.property?.city || "",
      state: lead.property?.state || "",
      zip: lead.property?.postal || "",
      providedOn: todayISO,
    };

  let measure = {
      roofSquares: 0,
      flatRoofSquares: 0,
      wastePct: 10,
      feetRakes: 0,
      feetEaves: 0,
      feetRidge: 0,
      feetHips: 0,
      feetValleys: 0,
      feetFlashing: 0,
      pipeFlangesSmall: 0,
      pipeFlangesLarge: 0,
      vents636: 0,
      vents634: 0,
    } as any;

    const flags = { hasSkylight: false, lowPitchExists: false };

    if (measurement) {
      // Basic totals from cached fields
      measure.roofSquares = Number(measurement.totalSquares || 0);

      // Inspect stored GeoJSON for edge totals and per-plane pitch/surface areas
      try {
        const fc = JSON.parse(measurement.geojson || "null");
        const props = (fc && fc.properties) || {};
  const edgeTotals = props.edgeTotalsFt || {};
  // Helper to round to 2 decimals
  const r2 = (n: any) => Math.round(Number(n || 0) * 100) / 100;
  // Map known edges with two-decimal rounding
  measure.feetRakes = r2(edgeTotals.rake);
  measure.feetEaves = r2(edgeTotals.eave);
  measure.feetRidge = r2(edgeTotals.ridge);
  measure.feetHips = r2(edgeTotals.hip);
  measure.feetValleys = r2(edgeTotals.valley);
  measure.feetFlashing = r2(edgeTotals.flashing);

        // Prefer precise accessory counts directly from features (accessories with data)
        const features = Array.isArray(fc?.features) ? fc.features : [];
        let smallPipe = 0, largePipe = 0, vents636 = 0, vents634 = 0, skylights = 0;
        for (const f of features) {
          const accs = Array.isArray((f as any)?.properties?.accessories)
            ? (f as any).properties.accessories
            : [];
          for (const acc of accs) {
            const type = (acc?.type || '').toString();
            if (type === 'Skylight') {
              skylights += 1;
              continue;
            }
            if (type === 'Pipe flange') {
              // Sizes like '1"-2"', '3"', '4"' etc
              const raw = (acc?.data?.size || '').toString();
              const nums = Array.from(raw.matchAll(/\d+(?:\.\d+)?/g)).map((m) => parseFloat((m as RegExpMatchArray)[0]));
              const sizeIn = nums.length ? Math.max(...nums) : NaN; // use max value in a range
              if (Number.isFinite(sizeIn)) {
                if (sizeIn >= 4) largePipe += 1; else smallPipe += 1; // <4" => small (1.5-3), >=4" => large
              } else {
                // Fallback by string hints
                const s = raw.toLowerCase();
                if (s.includes('4')) largePipe += 1; else smallPipe += 1;
              }
              continue;
            }
            if (type === 'Vents') {
              const opts: string[] = Array.isArray(acc?.data?.options) ? acc.data.options : [];
              for (const o of opts) {
                const v = String(o).trim();
                if (v === '636') vents636 += 1; else if (v === '634') vents634 += 1; // ignore others like B-Vent for now
              }
              continue;
            }
          }
        }
        // Apply feature-derived counts
        measure.pipeFlangesSmall = smallPipe;
        measure.pipeFlangesLarge = largePipe;
        measure.vents636 = vents636;
        measure.vents634 = vents634;
        if (skylights > 0) flags.hasSkylight = true;

        // Fallback to coarse accessoryTotals when features lacked data (legacy records)
        if ((smallPipe + largePipe + vents636 + vents634) === 0) {
          const acc = props.accessoryTotals || {};
          // Detect skylight presence via totals if not set
          if (!flags.hasSkylight) {
            for (const [k, v] of Object.entries(acc)) {
              if (String(k).toLowerCase().includes('skylight') && Number(v) > 0) { flags.hasSkylight = true; break; }
            }
          }
          const entries = Object.entries(acc).map(([k, v]) => [String(k).toLowerCase(), Number(v || 0)] as const);
          const sum = (pred: (k: string) => boolean) => entries.reduce((t, [k, v]) => (pred(k) ? t + (isFinite(v) ? v : 0) : t), 0);
          smallPipe = sum(k => k.includes('pipe') && (k.includes('1.5') || k.includes('1-1/2') || k.includes('1 1/2') || k.includes('small') || k.includes('1.5-3') || (k.includes('1') && k.includes('3'))) && !k.includes('4'));
          largePipe = sum(k => k.includes('pipe') && (k.includes('4') || k.includes('large')));
          vents636 = sum(k => k.includes('636') || k.includes('6x3x6') || k.includes('6-3-6'));
          vents634 = sum(k => k.includes('634') || k.includes('6x3x4') || k.includes('6-3-4'));
          if (smallPipe || largePipe || vents636 || vents634) {
            measure.pipeFlangesSmall = smallPipe;
            measure.pipeFlangesLarge = largePipe;
            measure.vents636 = vents636;
            measure.vents634 = vents634;
          }
        }

        // Compute low-pitch squares and refine roofSquares from per-feature data if available
  const features2 = Array.isArray(fc?.features) ? fc.features : [];
        let lowFt2 = 0;
        let sumFt2 = 0;
  for (const f of features2) {
          const p = f?.properties || {};
          const pitch = Number(p.pitch ?? NaN);
          const surf = Number(p.surfaceAreaFt2 ?? 0);
          if (surf > 0) sumFt2 += surf;
          if (isFinite(pitch) && pitch <= 2 && surf > 0) lowFt2 += surf;
        }
        if (sumFt2 > 0) {
          measure.roofSquares = Math.round((sumFt2 / 100) * 100) / 100;
        }
        if (lowFt2 > 0) {
          measure.flatRoofSquares = Math.round((lowFt2 / 100) * 100) / 100;
          flags.lowPitchExists = true;
        }
      } catch {}
    }

    return NextResponse.json({ customer, measure, flags });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
