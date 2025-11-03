import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';

// Basic validation helper
function require(v: any, name: string) {
  if (v === undefined || v === null || v === '') throw new Error(`${name} is required`);
}

export async function GET(req: NextRequest) {
  try {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get('leadId') || undefined;
    const propertyId = searchParams.get('propertyId') || undefined;
    const contactId = searchParams.get('contactId') || undefined;

    const where: any = { tenantId };
    if (leadId) where.leadId = leadId;
    if (propertyId) where.propertyId = propertyId;
    if (contactId) where.contactId = contactId;

    const missions = await prisma.droneMission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { waypoints: true },
    });
    return NextResponse.json({ missions });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();

    require(body.title, 'title');
    require(body.pathGeoJson, 'pathGeoJson');

    const mission = await prisma.droneMission.create({
      data: {
        tenantId,
        title: body.title,
        leadId: body.leadId || null,
        propertyId: body.propertyId || null,
        contactId: body.contactId || null,
        altitudeFt: body.altitudeFt || null,
        frontOverlap: body.frontOverlap ?? null,
        sideOverlap: body.sideOverlap ?? null,
        captureMode: body.captureMode || null,
        pitchDeg: body.pitchDeg ?? null,
        pathGeoJson: body.pathGeoJson,
        photoCountEst: body.photoCountEst ?? null,
        notes: body.notes || null,
        waypoints: body.waypoints?.length ? {
          create: body.waypoints.map((w: any, idx: number) => ({
            order: idx,
            lat: w.lat,
            lng: w.lng,
            altitudeFt: w.altitudeFt || null,
            action: w.action || null,
            gimbalPitch: w.gimbalPitch || null,
            gimbalYaw: w.gimbalYaw || null,
          })),
        } : undefined,
      },
      include: { waypoints: true },
    });
    return NextResponse.json({ mission });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
