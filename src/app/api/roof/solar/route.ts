import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

// POST body: { lat: number, lng: number, minQuality?: 'LOW'|'MEDIUM'|'HIGH', propertyId?: string }
export async function POST(req: Request) {
  try {
    const { lat, lng, minQuality = 'HIGH', propertyId, leadId } = await req.json();
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
    }
    if (!['LOW','MEDIUM','HIGH'].includes(minQuality)) {
      return NextResponse.json({ error: 'minQuality must be LOW | MEDIUM | HIGH' }, { status: 400 });
    }
    const tenantId = 'demo-tenant'; // TODO: derive from auth context
    // Attempt cache lookup if propertyId provided
    if (propertyId) {
    // @ts-ignore prisma client may not yet have solarInsight type in generated d.ts in running dev
    const cached = await (prisma as any).solarInsight.findFirst({
        where: { propertyId, quality: minQuality }, orderBy: { fetchedAt: 'desc' }
      });
      if (cached) {
        return NextResponse.json({
          cached: true,
          squares: cached.totalSquares,
          totalM2: cached.totalM2,
      segments: JSON.parse(cached.segmentsJson),
          raw: JSON.parse(cached.rawJson)
        });
      }
    }
    const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return NextResponse.json({ error: 'Missing GOOGLE_MAPS_API_KEY' }, { status: 400 });
    const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=${encodeURIComponent(minQuality)}&key=${key}`;
    let data: any;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) {
        let bodyText: string | undefined;
        let parsed: any = null;
        try {
          bodyText = await r.text();
          parsed = bodyText ? JSON.parse(bodyText) : null;
        } catch {}
        const payload = parsed || { error: bodyText || 'Upstream error' };
        // Propagate upstream status if it's a known client-side issue (404, 400, 403)
        const forwardStatus = [400,403,404].includes(r.status) ? r.status : 502;
        return NextResponse.json({ upstreamStatus: r.status, ...payload }, { status: forwardStatus });
      }
      data = await r.json();
    } catch (err: any) {
      return NextResponse.json({ error: 'Network error contacting Google Solar', detail: err?.message }, { status: 502 });
    }
  const wholeRoofAreaM2 = data?.solarPotential?.wholeRoofStats?.areaMeters2 || 0;
  const segments = (data?.solarPotential?.roofSegmentStats || []).map((seg: any) => {
      const usable = seg?.stats?.usableRoofAreaMeters2;
      const area = seg?.stats?.areaMeters2 || seg?.stats?.groundAreaMeters2 || 0;
      return {
        id: seg.segmentIndex ?? seg.index ?? Math.random().toString(36).slice(2),
        usableAreaM2: typeof usable === 'number' && usable > 0 ? usable : 0,
        areaM2: area,
        pitchDegrees: seg?.segmentStats?.pitchDegrees ?? seg?.pitchDegrees ?? seg?.stats?.pitchDegrees ?? null,
        azimuthDegrees: seg?.segmentStats?.azimuthDegrees ?? seg?.azimuthDegrees ?? seg?.stats?.azimuthDegrees ?? null
      };
    });
    // If every usableAreaM2 is zero, fall back to total actual area
  const anyUsable = segments.some((s:any)=> (s.usableAreaM2 || 0) > 0);
  let totalFrom: 'whole' | 'usable' | 'segments' = 'segments';
  let totalM2: number;
  if (wholeRoofAreaM2 > 0) { totalM2 = wholeRoofAreaM2; totalFrom = 'whole'; }
  else { totalM2 = segments.reduce((s: number, sgm: any) => s + (sgm.areaM2 || 0), 0); totalFrom = 'segments'; }
    const squares = totalM2 / 9.290304; // 1 square = 100 ft² = 9.290304 m²
    // Persist if property or lead provided
    if (propertyId || leadId) {
      try {
  // @ts-ignore
  await (prisma as any).solarInsight.create({
          data: {
            tenantId,
            propertyId: propertyId || null,
            leadId: leadId || null,
            quality: minQuality,
            totalM2,
            totalSquares: squares,
            segmentsJson: JSON.stringify(segments),
            rawJson: JSON.stringify(data)
          }
        });
      } catch (e) {
        console.warn('SolarInsight persist failed', e);
      }
    }
  return NextResponse.json({ squares, totalM2, totalFrom, segments, raw: data, cached: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error', stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined }, { status: 500 });
  }
}
