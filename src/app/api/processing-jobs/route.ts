import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const jobs = await prisma.processingJob.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ jobs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const job = await prisma.processingJob.create({
      data: {
        tenantId,
        missionId: body.missionId || null,
        provider: 'GENERIC',
        status: 'QUEUED',
        inputJson: JSON.stringify(body || {}),
      }
    });
    // In a real implementation enqueue background worker here
    return NextResponse.json({ job });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
