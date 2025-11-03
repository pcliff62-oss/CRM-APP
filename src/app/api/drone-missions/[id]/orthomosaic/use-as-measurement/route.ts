import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const mission = await prisma.droneMission.findFirst({ where: { id: params.id, tenantId } });
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });

    // Prefer the latest LOCAL-MOSAIC completion, else any completed job that has an orthomosaicUrl
    let job = await prisma.processingJob.findFirst({ where: { missionId: mission.id, status: 'COMPLETE', provider: 'LOCAL-MOSAIC' }, orderBy: { createdAt: 'desc' } });
    if (!job) {
      job = await prisma.processingJob.findFirst({ where: { missionId: mission.id, status: 'COMPLETE' }, orderBy: { createdAt: 'desc' } });
    }
    if (!job?.outputJson) return NextResponse.json({ error: 'No completed mosaic job' }, { status: 400 });
    const output = JSON.parse(job.outputJson);
    const orthoUrl = output?.orthomosaicUrl as string | undefined;
    if (!orthoUrl) return NextResponse.json({ error: 'No orthomosaicUrl in job output' }, { status: 400 });

    const fc = { type: 'FeatureCollection', features: [] };
    const m = await prisma.measurement.create({
      data: {
        tenantId,
        leadId: mission.leadId || null,
        propertyId: mission.propertyId || null,
        geojson: JSON.stringify(fc),
        sourceImagePath: orthoUrl,
        gsdMPerPx: null,
        totalSquares: null,
        totalPerimeterFt: null,
        notes: 'Created from orthomosaic'
      }
    });
    return NextResponse.json({ measurementId: m.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error' }, { status: 500 });
  }
}
