import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status: 401 });
  const id = String(params.id||'').trim();
  if (!id) return NextResponse.json({ ok:false, error:'Missing id' }, { status: 400 });
  try {
    // Null out assignee on leads
    await prisma.lead.updateMany({ where: { tenantId, assigneeId: id }, data: { assigneeId: null } });
    // Remove appointment assignees
    await prisma.appointmentAssignee.deleteMany({ where: { tenantId, userId: id } });
    // Finally delete user (scoped to tenant)
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok:true });
  } catch (e:any) {
    console.error('DELETE /api/users/[id] failed', e);
    return NextResponse.json({ ok:false, error: e?.message||String(e) }, { status: 500 });
  }
}
