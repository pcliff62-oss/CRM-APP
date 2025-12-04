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

      // If we still didn't get any meaningful data from Measurement.geojson, try the latest editor snapshot
      const hasEdgeData =
        (Number(measure.feetRakes) || 0) > 0 ||
        (Number(measure.feetEaves) || 0) > 0 ||
        (Number(measure.feetRidge) || 0) > 0 ||
        (Number(measure.feetHips) || 0) > 0 ||
        (Number(measure.feetValleys) || 0) > 0 ||
        (Number(measure.feetFlashing) || 0) > 0;
      const hasAnySquares = (Number(measure.roofSquares) || 0) > 0 || (Number(measure.flatRoofSquares) || 0) > 0;

      if (!(hasEdgeData || hasAnySquares)) {
        try {
          // Pull a few recent versions and pick the newest one with actual features
          const versions = await prisma.measurementVersion.findMany({
            where: { measurementId: measurement.id, tenantId: measurement.tenantId },
            orderBy: { createdAt: 'desc' },
            take: 5,
          });
          let mv = versions.find(v => {
            try { const p = JSON.parse(v.payloadJson || 'null'); return Array.isArray(p?.features) && p.features.length > 0; } catch { return false; }
          }) || versions[0];
          if (mv?.payloadJson) {
            try {
              const payload = JSON.parse(mv.payloadJson);
              const features: any[] = Array.isArray(payload?.features) ? payload.features : [];
              const gsd = Number(measurement.gsdMPerPx || 0); // meters per pixel
              const toFeet = (m: number) => m * 3.280839895;
              const toFt2 = (m2: number) => m2 * 10.7639104167;
              const r2 = (n: any) => Math.round(Number(n || 0) * 100) / 100;

              let totalFt2 = 0;
              let lowFt2 = 0;
              const edgeFt = { rake: 0, eave: 0, ridge: 0, hip: 0, valley: 0, flashing: 0 } as Record<string, number>;
              let smallPipe = 0, largePipe = 0, vents636 = 0, vents634 = 0, skylights = 0;

              // Helpers
              const segLenFeet = (a: number[], b: number[]) => {
                const dx = (Number(b[0]) - Number(a[0])) || 0;
                const dy = (Number(b[1]) - Number(a[1])) || 0;
                const px = Math.hypot(dx, dy);
                if (!(isFinite(px) && px > 0 && gsd > 0)) return 0;
                return toFeet(px * gsd);
              };
              const polyAreaFt2 = (coords: number[][]) => {
                if (!Array.isArray(coords) || coords.length < 3 || gsd <= 0) return 0;
                let sum = 0;
                for (let i = 0; i < coords.length; i++) {
                  const [x1, y1] = coords[i];
                  const [x2, y2] = coords[(i + 1) % coords.length];
                  sum += (Number(x1) || 0) * (Number(y2) || 0) - (Number(x2) || 0) * (Number(y1) || 0);
                }
                const areaPx2 = Math.abs(sum) / 2;
                const areaM2 = areaPx2 * (gsd * gsd);
                return toFt2(areaM2);
              };

              for (const f of features) {
                const geom = (f && f.geometry) || {};
                const ring: number[][] = Array.isArray(geom?.coordinates?.[0]) ? geom.coordinates[0] : Array.isArray(geom?.coordinates) ? geom.coordinates : [];
                if (ring.length >= 3) {
                  const ft2 = polyAreaFt2(ring);
                  totalFt2 += ft2;
                  const pitch = Number((f?.properties?.pitch) ?? NaN);
                  if (isFinite(pitch) && pitch <= 2 && ft2 > 0) lowFt2 += ft2;

                  // Edge classification by index
                  const edges = Array.isArray(f?.properties?.edges) ? f.properties.edges : [];
                  for (const e of edges) {
                    const i = Number(e?.i);
                    const t = String(e?.type || '').toLowerCase();
                    if (!isFinite(i) || i < 0 || i >= ring.length) continue;
                    const a = ring[i];
                    const b = ring[(i + 1) % ring.length];
                    const len = segLenFeet(a, b);
                    if (!(len > 0)) continue;
                    if (t in edgeFt) edgeFt[t] += len;
                  }
                }

                // Accessories
                const accs = Array.isArray(f?.properties?.accessories) ? f.properties.accessories : [];
                for (const acc of accs) {
                  const type = (acc?.type || '').toString();
                  if (type === 'Skylight') { skylights += 1; continue; }
                  if (type === 'Pipe flange') {
                    const raw = (acc?.data?.size || '').toString();
                    const nums = Array.from(raw.matchAll(/\d+(?:\.\d+)?/g)).map((m) => parseFloat((m as RegExpMatchArray)[0]));
                    const sizeIn = nums.length ? Math.max(...nums) : NaN;
                    if (Number.isFinite(sizeIn)) {
                      if (sizeIn >= 4) largePipe += 1; else smallPipe += 1;
                    } else {
                      const s = raw.toLowerCase();
                      if (s.includes('4')) largePipe += 1; else smallPipe += 1;
                    }
                    continue;
                  }
                  if (type === 'Vents') {
                    const opts: string[] = Array.isArray(acc?.data?.options) ? acc.data.options : [];
                    for (const o of opts) {
                      const v = String(o).trim();
                      if (v === '636') vents636 += 1; else if (v === '634') vents634 += 1;
                    }
                    continue;
                  }
                }
              }

              // Apply computed values
              if (totalFt2 > 0) measure.roofSquares = r2(totalFt2 / 100);
              if (lowFt2 > 0) { measure.flatRoofSquares = r2(lowFt2 / 100); flags.lowPitchExists = true; }
              measure.feetRakes = r2(edgeFt.rake);
              measure.feetEaves = r2(edgeFt.eave);
              measure.feetRidge = r2(edgeFt.ridge);
              measure.feetHips = r2(edgeFt.hip);
              measure.feetValleys = r2(edgeFt.valley);
              measure.feetFlashing = r2(edgeFt.flashing);
              measure.pipeFlangesSmall = smallPipe;
              measure.pipeFlangesLarge = largePipe;
              measure.vents636 = vents636;
              measure.vents634 = vents634;
              if (skylights > 0) flags.hasSkylight = true;
            } catch {}
          }
        } catch {}
      }
    }

    return NextResponse.json({ customer, measure, flags });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
