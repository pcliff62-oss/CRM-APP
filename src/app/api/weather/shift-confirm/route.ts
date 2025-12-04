import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantId } from '@/lib/auth';
import prisma from '@/lib/db';

export async function POST(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 });
  await prisma.tenant.update({ where: { id: tenantId }, data: { weatherShiftPendingStatus: 'confirmed', weatherShiftPendingJson: null } });
  return NextResponse.json({ ok:true });
}
