import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const missionId = params.id;
    const mission = await prisma.droneMission.findFirst({ where: { id: missionId, tenantId }, select: { id: true } });
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    const body = await req.json();
    const points = Array.isArray(body.points) ? body.points : [];
    if (!points.length) return NextResponse.json({ error: 'No points' }, { status: 400 });

    // Sanitize & map
  const data = points.slice(0, 500).map((p: any) => ({
      missionId,
      ts: p.ts ? new Date(p.ts) : new Date(),
      lat: Number(p.lat),
      lng: Number(p.lng),
      altAGL: p.altAGL == null ? null : Number(p.altAGL),
      altMSL: p.altMSL == null ? null : Number(p.altMSL),
      heading: p.heading == null ? null : Number(p.heading),
      gimbalPitch: p.gimbalPitch == null ? null : Number(p.gimbalPitch),
      speedMS: p.speed == null ? null : Number(p.speed),
      batteryPct: p.batteryPct == null ? null : Number(p.batteryPct)
  })).filter((r: any) => isFinite(r.lat) && isFinite(r.lng));

    if (!data.length) return NextResponse.json({ error: 'No valid points' }, { status: 400 });

  await prisma.missionTelemetry.createMany({ data });

    return NextResponse.json({ inserted: data.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
