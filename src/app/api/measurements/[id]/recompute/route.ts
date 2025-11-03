import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';

export const runtime = 'nodejs';

// Body: { features: Feature[], defaultPitchIn12?: number }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const m = await prisma.measurement.findFirst({ where: { id: params.id, tenantId } });
    if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const features = body?.features || [];
  const defaultPitch = Number(body?.defaultPitchIn12 ?? 6);

    // Recompute totals from image-space polygons using stored GSD
    const gsd = m.gsdMPerPx || 0; // meters per pixel
    const toFt = 3.28084;
  let totalPlanFt2 = 0;
  let totalSurfaceFt2 = 0;
  // We'll compute perimeter and edge totals after scanning all features using a robust shared-edge detector
  let totalPerimeterFt = 0;
  const edgeTotalsFt: Record<string, number> = {};
  type EdgeItem = {
    fi: number; ei: number;
    ax: number; ay: number; bx: number; by: number;
    planLenFt: number;
    pitch: number;
    slopeMult: number; // 1/cos(theta)
    type: string;
  };
  const allEdges: EdgeItem[] = [];

  const updatedFeatures = [] as any[];
  const accessoryTotals: Record<string, number> = {};
  for (const f of features) {
      if (!f?.geometry || f.geometry.type !== 'Polygon') continue;
      const ring = (f.geometry.coordinates?.[0] || []) as number[][];
      if (ring.length < 3) continue;
      // Shoelace area and perimeter in pixels
      let areaPx = 0;
      let periPx = 0;
      for (let i=0; i<ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i+1) % ring.length];
        areaPx += (x1*y2 - x2*y1);
        const dx = x2 - x1; const dy = y2 - y1;
        periPx += Math.hypot(dx, dy);
      }
      areaPx = Math.abs(areaPx) / 2.0;
  const planM2 = areaPx * (gsd ** 2);
      const planFt2 = planM2 * 10.7639;
  const perimFt = periPx * gsd * toFt;

      const planeId = f.properties?.id || '';
      const pitch = typeof f.properties?.pitch === 'number' ? f.properties.pitch : defaultPitch;
      const theta = Math.atan(pitch/12.0);
      const surfaceFt2 = planFt2 / Math.cos(theta);

      totalPlanFt2 += planFt2;
      totalSurfaceFt2 += surfaceFt2;
  // Do not sum per-feature perimeter; we'll compute exterior perimeter from unique edges

      // Collect edges (robust against different vertex splits along shared edges)
      const edges = (f.properties?.edges || []) as { i: number; type: string }[];
      const currentFi = updatedFeatures.length; // face index before push
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        const lenFtPlan = Math.hypot(x2 - x1, y2 - y1) * gsd * toFt;
        const et = (edges.find(e => e.i === i)?.type || 'unknown').toString();
        const slopeMult = 1 / Math.cos(theta);
        allEdges.push({ fi: currentFi, ei: i, ax: x1, ay: y1, bx: x2, by: y2, planLenFt: lenFtPlan, pitch, slopeMult, type: et });
      }

      // Accessories passthrough and count
      const accessories = Array.isArray(f.properties?.accessories) ? f.properties.accessories : [];
      for (const acc of accessories) {
        const t = (acc?.type || 'unknown').toString();
        accessoryTotals[t] = (accessoryTotals[t] || 0) + 1;
      }

      updatedFeatures.push({
        type: 'Feature',
        properties: { ...f.properties, id: planeId, pitch, planAreaFt2: planFt2, surfaceAreaFt2: surfaceFt2, accessories },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }

    // After scanning all features, robustly detect shared edges and aggregate totals without double-counting
  function pointOnSeg(px:number, py:number, ax:number, ay:number, bx:number, by:number, tol=0.5) {
      const abx = bx-ax, aby = by-ay;
      const apx = px-ax, apy = py-ay;
      const ab2 = abx*abx + aby*aby;
      if (ab2 === 0) return Math.hypot(px-ax, py-ay) <= tol;
      const t = (apx*abx + apy*aby) / ab2;
      const tClamped = Math.max(0, Math.min(1, t));
      const projx = ax + tClamped * abx;
      const projy = ay + tClamped * aby;
      const cross = Math.abs((px-ax)*aby - (py-ay)*abx) / Math.sqrt(ab2);
      const within = Math.hypot(px-projx, py-projy) <= tol*Math.sqrt(ab2 + tol);
      return cross <= tol && within;
    }
    const edgesByFace = new Map<number, EdgeItem[]>();
    allEdges.forEach(e => { const arr = edgesByFace.get(e.fi) || []; arr.push(e); edgesByFace.set(e.fi, arr); });
    function chooseType(scope:'interior'|'perimeter', types:string[]) {
      const interiorAllowed = new Set(['ridge','valley','hip','flashing','parapet','transition']);
      const perimeterAllowed = new Set(['eave','rake','flashing','parapet','transition']);
      const allowed = scope==='interior' ? interiorAllowed : perimeterAllowed;
      const nonUnknown = types.filter(t => t && t !== 'unknown');
      const filtered = nonUnknown.filter(t => allowed.has(t));
      const pool = filtered.length ? filtered : (nonUnknown.length ? nonUnknown : ['unknown']);
      const order = scope==='interior' ? ['ridge','valley','hip','flashing','parapet','transition','unknown'] : ['eave','rake','flashing','parapet','transition','unknown'];
      const counts = new Map<string, number>();
      for (const t of pool) counts.set(t, (counts.get(t) || 0) + 1);
      const sorted = Array.from(counts.entries()).sort((a,b)=> b[1]-a[1] || (order.indexOf(a[0]) - order.indexOf(b[0])));
      return sorted[0][0];
    }
    totalPerimeterFt = 0;
    for (const e of allEdges) {
      // find matching edge on a different face by midpoint inclusion
      const mx = (e.ax + e.bx) / 2; const my = (e.ay + e.by) / 2;
      let otherFi: number | null = null;
      let otherType: string | null = null;
      let otherSlopeMult = 1;
      for (const [fi, list] of edgesByFace.entries()) {
        if (fi === e.fi) continue;
        for (const s of list) {
          if (pointOnSeg(mx, my, s.ax, s.ay, s.bx, s.by, 0.5)) {
            otherFi = fi; otherType = s.type; otherSlopeMult = s.slopeMult; break;
          }
        }
        if (otherFi != null) break;
      }
      const shared = otherFi != null;
      // prevent double counting for shared: only count when current face index is lower
      if (shared && !(e.fi < (otherFi as number))) continue;
      if (!shared) {
        totalPerimeterFt += e.planLenFt;
        const chosen = chooseType('perimeter', [e.type]);
        const slopeAdjustedTypes = new Set<string>(['rake','valley','hip']);
        const mult = slopeAdjustedTypes.has(chosen) ? e.slopeMult : 1;
        const effLen = e.planLenFt * mult;
        edgeTotalsFt[chosen] = (edgeTotalsFt[chosen] || 0) + effLen;
      } else {
        const chosen = chooseType('interior', [e.type, otherType || 'unknown']);
        const slopeAdjustedTypes = new Set<string>(['rake','valley','hip']);
        const mult = slopeAdjustedTypes.has(chosen) ? Math.max(e.slopeMult, otherSlopeMult || 1) : 1;
        const effLen = e.planLenFt * mult;
        edgeTotalsFt[chosen] = (edgeTotalsFt[chosen] || 0) + effLen;
      }
    }

  const updatedFc = { type: 'FeatureCollection', properties: { edgeTotalsFt, accessoryTotals }, features: updatedFeatures } as any;
  const updated = await prisma.measurement.update({
      where: { id: m.id },
      data: {
        geojson: JSON.stringify(updatedFc),
        totalSquares: totalSurfaceFt2 / 100.0,
        totalPerimeterFt,
      }
    });
    return NextResponse.json(updated);
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
