import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantId } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { weatherShiftPendingJson: true, weatherShiftPendingStatus: true } });
  if (!tenant?.weatherShiftPendingJson || tenant.weatherShiftPendingStatus !== 'pending') {
    return NextResponse.json({ ok:true, pending:false });
  }
  let data: any = {};
  try { data = JSON.parse(tenant.weatherShiftPendingJson); } catch {}
  return NextResponse.json({ ok:true, pending:true, data });
}
