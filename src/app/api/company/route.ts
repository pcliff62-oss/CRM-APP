import prisma from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getCurrentTenantId } from '@/lib/auth';
import { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

interface LicenseDTO { type: string; number: string; expires: string|null }

function serializeLicenses(raw: unknown): LicenseDTO[] {
  if (!raw) return [];
  try {
    const arr: unknown[] = Array.isArray(raw) ? raw : JSON.parse(typeof raw === 'string' ? (raw as string) : '[]');
    return arr
      .filter((l: unknown): l is Record<string, any> => !!l && typeof l === 'object')
      .map((l: Record<string, any>): LicenseDTO => ({
        type: String(l.type||'').trim(),
        number: String(l.number||'').trim(),
        expires: l.expires ? new Date(l.expires).toISOString() : null
      }));
  } catch {
    return [];
  }
}

function licensesToJson(arr: LicenseDTO[]): string { return JSON.stringify(arr); }

export async function GET(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok:false, error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return NextResponse.json({ ok:false, error: 'Tenant not found' }, { status: 404 });
  const licenses = serializeLicenses(tenant.licensesJson);
  return NextResponse.json({ ok:true, item: {
    name: tenant.name,
    phone: tenant.phone||'',
    email: tenant.email||'',
    address1: tenant.address1||'',
    address2: tenant.address2||'',
    city: tenant.city||'',
    state: tenant.state||'',
    postal: tenant.postal||'',
    logoPath: tenant.logoPath||'',
    licenses
  }});
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ ok:false, error: 'Unauthorized' }, { status: 401 });
  if (user.role !== Role.ADMIN) return NextResponse.json({ ok:false, error: 'Forbidden' }, { status: 403 });
  const tenantId = user.tenantId;
  const body = await req.json().catch(()=>({}));
  const name = String(body.name||'').trim();
  const phone = String(body.phone||'').trim();
  const email = String(body.email||'').trim().toLowerCase();
  const address1 = String(body.address1||'').trim();
  const address2 = String(body.address2||'').trim();
  const city = String(body.city||'').trim();
  const state = String(body.state||'').trim();
  const postal = String(body.postal||'').trim();
  const logoPath = String(body.logoPath||'').trim();
  const licenses = serializeLicenses(body.licenses);

  if (!name) return NextResponse.json({ ok:false, error: 'Company name required' }, { status: 400 });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok:false, error: 'Invalid email' }, { status: 400 });
  if (phone && !/^[0-9+()\-\s]{7,20}$/.test(phone)) return NextResponse.json({ ok:false, error: 'Invalid phone' }, { status: 400 });

  try {
    const updated = await prisma.tenant.update({ where: { id: tenantId }, data: {
      name,
      phone: phone || null,
      email: email || null,
      address1: address1 || null,
      address2: address2 || null,
      city: city || null,
      state: state || null,
      postal: postal || null,
      logoPath: logoPath || null,
      licensesJson: licensesToJson(licenses) || null
    }});
    return NextResponse.json({ ok:true });
  } catch (e: any) {
    console.error('PUT /api/company error', e);
    return NextResponse.json({ ok:false, error: e?.message||String(e) }, { status: 500 });
  }
}
