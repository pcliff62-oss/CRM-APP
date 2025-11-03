import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import path from 'path';
import { promises as fs } from 'fs';

export const runtime = 'nodejs';

function getMissionCenter(m: { pathGeoJson: string }): { lat: number; lng: number } | null {
  try {
    const fc = JSON.parse(m.pathGeoJson);
    const coords: [number, number][] = [];
    for (const f of fc.features || []) {
      const g = f.geometry;
      if (!g) continue;
      if (g.type === 'Point') coords.push(g.coordinates as [number, number]);
      if (g.type === 'LineString') coords.push(...(g.coordinates as [number, number][]));
      if (g.type === 'Polygon') coords.push(...(g.coordinates?.[0] || []));
      if (g.type === 'MultiPolygon') {
        for (const ring of g.coordinates || []) coords.push(...(ring?.[0] || []));
      }
    }
    if (!coords.length) return null;
    let sx = 0, sy = 0;
    coords.forEach(([x,y])=>{ sx += x; sy += y; });
    const lng = sx / coords.length; const lat = sy / coords.length;
    return { lat, lng };
  } catch { return null; }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const mission = await prisma.droneMission.findFirst({ where: { id: params.id, tenantId }, include: { property: true } });
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });

    const center = (mission.property?.lat && mission.property?.lng) ? { lat: mission.property.lat, lng: mission.property.lng } : getMissionCenter(mission) || null;
    if (!center) return NextResponse.json({ error: 'No center coordinates for mission/property' }, { status: 400 });

    // Build Google Static Maps URL (satellite)
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Missing GOOGLE_MAPS_API_KEY/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY' }, { status: 400 });
    // 1280x1280 max free; scale=2 yields 2560x2560 (paid higher). Use 1024*2 for safety.
    const size = '1024x1024';
    const scale = 2;
    const zoom = 20; // high detail near property
    const maptype = 'satellite';
    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=${zoom}&size=${size}&scale=${scale}&maptype=${maptype}&key=${apiKey}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      const txt = await resp.text().catch(()=> '');
      return NextResponse.json({ error: 'Static Maps fetch failed', status: resp.status, details: txt?.slice(0,200) }, { status: 502 });
    }
    const ab = await resp.arrayBuffer();
    const buf = Buffer.from(ab);

    // Save under public uploads
    const dir = path.join(process.cwd(), 'public', 'uploads', tenantId, 'missions', mission.id);
    await fs.mkdir(dir, { recursive: true });
    const filename = `satellite_${Date.now()}.jpg`;
    const abs = path.join(dir, filename);
    await fs.writeFile(abs, new Uint8Array(buf));
    const publicUrl = `/uploads/${tenantId}/missions/${mission.id}/${filename}`;

    // Create minimal FeatureCollection placeholder
    const fc = { type: 'FeatureCollection', features: [] as any[] };
  // Approximate GSD (meters per pixel) at given zoom and latitude for Google Web Mercator tiles
  // Base formula: metersPerPixel = cos(lat) * 156543.03392 / 2^zoom
  // Google Static Maps 'scale' increases pixel density (e.g., scale=2 doubles pixels, halving meters-per-pixel)
  const metersPerPixel = (Math.cos(center.lat * Math.PI/180) * 156543.03392) / (Math.pow(2, zoom) * scale);

    const m = await prisma.measurement.create({
      data: {
        tenantId,
        leadId: mission.leadId || null,
        propertyId: mission.propertyId || null,
        geojson: JSON.stringify(fc),
        sourceImagePath: publicUrl,
        gsdMPerPx: metersPerPixel,
        notes: 'Created from Google Static Maps (satellite)'
      }
    });

    return NextResponse.json({ measurementId: m.id, sourceImagePath: publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error' }, { status: 500 });
  }
}
