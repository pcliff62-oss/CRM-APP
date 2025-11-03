import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const job = await prisma.processingJob.findUnique({ where: { id: params.id } });
  if (!job || job.tenantId !== tenantId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(job);
}
