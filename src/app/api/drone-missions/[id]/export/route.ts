import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const mission = await prisma.droneMission.findFirst({
      where: { id: params.id, tenantId },
      include: { waypoints: { orderBy: { order: 'asc' } } }
    });
    if (!mission) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const exportPayload = {
      id: mission.id,
      title: mission.title,
      altitudeFt: mission.altitudeFt,
      frontOverlap: mission.frontOverlap,
      sideOverlap: mission.sideOverlap,
      captureMode: mission.captureMode,
      pitchDeg: mission.pitchDeg,
      pathGeoJson: JSON.parse(mission.pathGeoJson || '{}'),
      waypoints: mission.waypoints.map(w => ({ lat: w.lat, lng: w.lng, altitudeFt: w.altitudeFt, action: w.action, gimbalPitch: w.gimbalPitch, gimbalYaw: w.gimbalYaw })),
      generatedAt: new Date().toISOString(),
      platform: 'phantom4pro',
      version: 1
    };
    return NextResponse.json(exportPayload);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}