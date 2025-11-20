import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import { BasePayPeriod, Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return updateCommission(req, params);
}
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return updateCommission(req, params);
}

async function updateCommission(req: NextRequest, { id }: { id: string }){
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(()=>({} as any)) as { commissionPercent?: number|null; basePayAmount?: number|null; basePayPeriod?: BasePayPeriod|null };

    const user = await prisma.user.findFirst({ where: { id, tenantId, role: Role.SALES } });
    if (!user) return NextResponse.json({ ok:false, error:'Sales user not found' }, { status: 404 });

    const data: any = {};
    if (body.commissionPercent != null) {
      if (Number.isNaN(Number(body.commissionPercent))) return NextResponse.json({ ok:false, error:'Invalid commissionPercent' }, { status: 400 });
      data.commissionPercent = Math.max(0, Math.min(100, Number(body.commissionPercent)));
    }
    if (body.basePayAmount != null) {
      if (Number.isNaN(Number(body.basePayAmount))) return NextResponse.json({ ok:false, error:'Invalid basePayAmount' }, { status: 400 });
      data.basePayAmount = Math.max(0, Number(body.basePayAmount));
    }
    if (body.basePayPeriod != null) {
      const allowed: BasePayPeriod[] = [BasePayPeriod.JOB, BasePayPeriod.WEEK, BasePayPeriod.MONTH];
      if (!allowed.includes(body.basePayPeriod as BasePayPeriod)) return NextResponse.json({ ok:false, error:'Invalid basePayPeriod' }, { status: 400 });
      data.basePayPeriod = body.basePayPeriod;
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ ok:false, error:'No valid fields to update' }, { status: 400 });

    const updated = await prisma.user.update({ where: { id }, data });
    return NextResponse.json({ ok:true, item: { id: updated.id, commissionPercent: updated.commissionPercent, basePayAmount: updated.basePayAmount, basePayPeriod: updated.basePayPeriod } });
  } catch (e:any) {
    console.error('PATCH /api/sales/[id] error', e);
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status: 500 });
  }
}
