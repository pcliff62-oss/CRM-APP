import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantId } from "@/lib/auth";
import { Role } from "@prisma/client";

export const dynamic = 'force-dynamic';

async function normalizeUserRoles() {
  try {
    // Coerce any legacy or invalid roles (e.g., 'Owner') to ADMIN to satisfy enum decoding
    await prisma.$executeRawUnsafe(
      "UPDATE \"User\" SET role = 'ADMIN' WHERE UPPER(role) = 'OWNER' OR role NOT IN ('ADMIN','SALES','CREW','EMPLOYEE')"
    );
  } catch {}
}

export async function GET(req: NextRequest) {
  console.log('[users.GET] incoming', req.url);
  await normalizeUserRoles();
  const tenantId = await getCurrentTenantId(req);
  console.log('[users.GET] tenantId', tenantId);
  if (!tenantId) return NextResponse.json({ items: [] });
  const searchParams = req.nextUrl?.searchParams ?? new URL(req.url).searchParams;
  const roleParam = searchParams.get('role') || undefined;
  const roleFilter = roleParam && Object.values(Role).includes(roleParam as Role) ? { role: roleParam as Role } : {};
  const users = await prisma.user.findMany({ where: { tenantId, ...roleFilter }, orderBy: { name: "asc" } });
  const allowed = Object.values(Role) as unknown as string[];
  const res = NextResponse.json({ items: users.map(u => ({ id: u.id, email: u.email, name: u.name, role: allowed.includes((u as any).role) ? u.role : Role.ADMIN })) });
  res.headers.set('Cache-Control','no-store');
  return res;
}

export async function POST(req: NextRequest) {
  console.log('[users.POST] incoming');
  await normalizeUserRoles();
  const tenantId = await getCurrentTenantId(req);
  console.log('[users.POST] tenantId', tenantId);
  if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(()=>({}));
  const email = String(body.email||'').trim().toLowerCase();
  const name = String(body.name||'').trim() || email;
  const roleRaw = String(body.role||'EMPLOYEE').trim().toUpperCase();
  if (!email) return NextResponse.json({ ok:false, error:'Email required' }, { status:400 });
  const allowed = Object.values(Role);
  const role: Role = allowed.includes(roleRaw as Role) ? (roleRaw as Role) : Role.EMPLOYEE;
  try {
    const existing = await prisma.user.findFirst({ where: { email, tenantId } });
    if (existing) return NextResponse.json({ ok:false, error:'User exists' }, { status:400 });
  const user = await prisma.user.create({ data: { email, name, role, tenantId } });
    return NextResponse.json({ ok:true, item: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e: any) {
    console.error('POST /api/users failed', e);
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status: 500 });
  }
}
