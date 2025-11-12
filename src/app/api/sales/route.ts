import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ ok:true, items: [] });
  const reps = await prisma.user.findMany({ where: { tenantId, role: Role.SALES }, orderBy: { name: 'asc' } });
  const items = reps.map(r => ({
    id: r.id,
    name: r.name || r.email,
    commissionPercent: r.commissionPercent ?? null,
    basePayAmount: r.basePayAmount ?? null,
    basePayPeriod: r.basePayPeriod ?? null,
    members: [{ id: r.id, name: r.name || r.email }],
    docs: [] as any[],
    source: 'user' as const
  }));
  return NextResponse.json({ ok:true, items });
}
