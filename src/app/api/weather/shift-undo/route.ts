import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantId } from '@/lib/auth';
import prisma from '@/lib/db';

function addDays(d: Date, n: number): Date { const x=new Date(d); x.setDate(x.getDate()+n); return x; }

export async function POST(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { weatherShiftPendingJson: true, weatherShiftPendingStatus: true } });
  if (!tenant?.weatherShiftPendingJson || tenant.weatherShiftPendingStatus !== 'pending') {
    return NextResponse.json({ ok:false, error:'Nothing to undo' }, { status:400 });
  }
  let data: any = {};
  try { data = JSON.parse(tenant.weatherShiftPendingJson); } catch {}
  const shiftDays = Number(data.shiftDays || 0);
  const jobIds: string[] = Array.isArray(data.jobIds) ? data.jobIds : [];
  if (!shiftDays || jobIds.length === 0) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { weatherShiftPendingStatus: 'undone', weatherShiftPendingJson: null } });
    return NextResponse.json({ ok:true, undone:0 });
  }
  const jobs = await prisma.appointment.findMany({ where: { id: { in: jobIds }, tenantId }, select: { id:true, start:true, end:true } });
  const updates = jobs.map(j => prisma.appointment.update({ where: { id: j.id }, data: { start: addDays(new Date(j.start), -shiftDays), end: addDays(new Date(j.end), -shiftDays) } }));
  await Promise.all(updates);
  await prisma.tenant.update({ where: { id: tenantId }, data: { weatherShiftPendingStatus: 'undone', weatherShiftPendingJson: null } });
  return NextResponse.json({ ok:true, undone: jobs.length });
}
