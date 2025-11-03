import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import area from '@turf/area';
import length from '@turf/length';

// Computes a Measurement from the mission's polygon (first Polygon in pathGeoJson)
// Converts area m^2 -> squares (1 square = 100 ft^2)
// Stores perimeter in feet and total squares.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const mission = await prisma.droneMission.findFirst({ where: { id: params.id, tenantId } });
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });

    const fc = JSON.parse(mission.pathGeoJson);
    const poly = fc.features?.find((f: any) => f.geometry?.type === 'Polygon');
    if (!poly) return NextResponse.json({ error: 'No Polygon feature in mission path' }, { status: 400 });

    const missionAreaM2 = area(poly); // square meters
    const missionPerimeterKm = length(poly, { units: 'kilometers' });

    const SQFT_PER_M2 = 10.76391041671;
    const sqft = missionAreaM2 * SQFT_PER_M2;
    const squares = sqft / 100.0;
    const perimeterFt = missionPerimeterKm * 3280.839895; // km -> ft

    // Create measurement record
    const measurement = await prisma.measurement.create({
      data: {
        tenantId,
        leadId: mission.leadId || undefined,
        propertyId: mission.propertyId || undefined,
        geojson: JSON.stringify(poly),
        totalSquares: Number(squares.toFixed(2)),
        totalPerimeterFt: Number(perimeterFt.toFixed(2)),
        notes: 'Derived from mission polygon (auto)'
      }
    });

    return NextResponse.json({ measurement }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
