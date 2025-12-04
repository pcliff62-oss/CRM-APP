import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import { Role, SalaryMode } from '@prisma/client';

export const dynamic = 'force-dynamic';


export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized', code:'UNAUTHORIZED' }, { status:401 });
  const id = params.id;
  const body = await req.json().catch(()=>({})) as any;
  const user = await prisma.user.findFirst({ where: { id, tenantId } });
  if (!user) return NextResponse.json({ ok:false, error:'User not found', code:'NOT_FOUND' }, { status:404 });

  const data: any = {};
  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ ok:false, error:'Name required', code:'VALIDATION' }, { status:400 });
    if (name !== user.name) {
      const exists = await prisma.user.findFirst({ where: { tenantId, name } });
      if (exists) return NextResponse.json({ ok:false, error:'Name exists', code:'NAME_EXISTS' }, { status:400 });
    }
    data.name = name;
  }
  if (typeof body.email === 'string') {
    const email = body.email.trim().toLowerCase();
    if (!email) return NextResponse.json({ ok:false, error:'Email required', code:'VALIDATION' }, { status:400 });
    if (email !== user.email) {
      const exists = await prisma.user.findFirst({ where: { tenantId, email } });
      if (exists) return NextResponse.json({ ok:false, error:'Email exists', code:'EMAIL_EXISTS' }, { status:400 });
    }
    data.email = email;
  }
  if (typeof body.role === 'string') {
    const roleUpper = body.role.toUpperCase();
    if ((Object.values(Role) as string[]).includes(roleUpper)) data.role = roleUpper as Role;
  }
  if (Array.isArray(body.payStructures)) {
    const arr = body.payStructures.filter((s:any)=> typeof s === 'string');
    data.payStructuresJson = arr.length ? JSON.stringify(arr) : null;
  }
  if (body.ratePerSquare != null) {
    const v = Number(body.ratePerSquare);
    if (Number.isNaN(v)) return NextResponse.json({ ok:false, error:'Invalid ratePerSquare', code:'VALIDATION' }, { status:400 });
    data.ratePerSquare = v;
  }
  if (body.commissionPercent != null) {
    const v = Number(body.commissionPercent);
    if (Number.isNaN(v)) return NextResponse.json({ ok:false, error:'Invalid commissionPercent', code:'VALIDATION' }, { status:400 });
    data.commissionPercent = Math.max(0, Math.min(100, v));
  }
  if (body.salaryRate != null) {
    const v = Number(body.salaryRate);
    if (Number.isNaN(v)) return NextResponse.json({ ok:false, error:'Invalid salaryRate', code:'VALIDATION' }, { status:400 });
    data.salaryRate = v;
  }
  if (typeof body.salaryMode === 'string') {
    const sm = body.salaryMode.toUpperCase();
    if (Object.values(SalaryMode).includes(sm as SalaryMode)) data.salaryMode = sm as SalaryMode;
  }
  if (typeof body.calendarColor === 'string') {
    const cc = body.calendarColor.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(cc)) {
      data.calendarColor = cc.startsWith('#') ? cc : ('#'+cc);
    } else if (cc === '') {
      data.calendarColor = null; // allow clearing
    }
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ ok:false, error:'No changes', code:'NO_CHANGES' }, { status:400 });
  const updated = await prisma.user.update({ where:{ id }, data });
  return NextResponse.json({ ok:true, item: { id: updated.id, calendarColor: updated.calendarColor || null } });
}


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
