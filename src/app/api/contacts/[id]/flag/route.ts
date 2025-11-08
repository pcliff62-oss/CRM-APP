import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';

// PATCH /api/contacts/[id]/flag  body: { color: 'red'|'yellow'|'green'|null }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const { id } = params;
  let color: string | null = null;
  try {
    const data = await req.json().catch(() => ({}));
    const raw = typeof data.color === 'string' ? data.color.trim().toLowerCase() : '';
    if (['red','yellow','green'].includes(raw)) color = raw;
    if (raw === '' || raw === 'none' || raw === 'clear' || raw === 'null') color = null;
  } catch {}
  const updated = await prisma.contact.update({ where: { id }, data: { flagColor: color } }).catch(()=>null);
  if (!updated) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, item: { id: updated.id, flagColor: updated.flagColor } });
}
