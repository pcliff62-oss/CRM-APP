import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantId } from "@/lib/auth";
import { Role, SalaryMode } from "@prisma/client";

export const dynamic = 'force-dynamic';

// Removed legacy normalization to avoid unintentionally elevating MANAGER to ADMIN.
async function normalizeUserRoles() { /* no-op now */ }

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
  const resPayload = users.map(u => {
    let docsArr: any[] = [];
    try { docsArr = u.docsJson ? JSON.parse(u.docsJson) : []; } catch {}
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      payStructures: u.payStructuresJson ? JSON.parse(u.payStructuresJson) : [],
      ratePerSquare: u.ratePerSquare,
      commissionPercent: u.commissionPercent,
      salaryRate: u.salaryRate,
      salaryMode: u.salaryMode,
      docs: docsArr,
  calendarColor: u.calendarColor || null,
    };
  });
  const res = NextResponse.json({ items: resPayload });
  try {
    for (const u of users) {
      let types: string[] = [];
      try { types = u.docsJson ? (JSON.parse(u.docsJson)||[]).map((d:any)=>d.type) : []; } catch {}
      console.log('[users.GET] user', u.id, u.name, 'docTypes:', types.join(',')||'(none)');
    }
  } catch {}
  res.headers.set('Cache-Control','no-store');
  return res;
}

export async function POST(req: NextRequest) {
  console.log('[users.POST] incoming');
  await normalizeUserRoles();
  const tenantId = await getCurrentTenantId(req);
  console.log('[users.POST] tenantId', tenantId);
  if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized', code:'UNAUTHORIZED' }, { status: 401 });
  const body = await req.json().catch(()=>({}));
  const email = String(body.email||'').trim().toLowerCase();
  const name = String(body.name||'').trim();
  const roleRaw = String(body.role||'EMPLOYEE').trim().toUpperCase();
  if (!email) return NextResponse.json({ ok:false, error:'Email required', code:'VALIDATION' }, { status:400 });
  if (!name) return NextResponse.json({ ok:false, error:'Name required', code:'VALIDATION' }, { status:400 });
  const allowed = Object.values(Role);
  const role: Role = allowed.includes(roleRaw as Role) ? (roleRaw as Role) : Role.EMPLOYEE;
  console.log('[users.POST] requested roleRaw', roleRaw, 'mapped role', role);
  try {
    // Enforce uniqueness on email and name within tenant
    const existingEmail = await prisma.user.findFirst({ where: { email, tenantId } });
  if (existingEmail) return NextResponse.json({ ok:false, error:'User with this email exists', code:'EMAIL_EXISTS' }, { status:400 });
    const existingName = await prisma.user.findFirst({ where: { name, tenantId } });
  if (existingName) return NextResponse.json({ ok:false, error:'User with this name exists', code:'NAME_EXISTS' }, { status:400 });
  // Extract new pay fields
  const payStructures: string[] = Array.isArray(body.payStructures) ? body.payStructures.filter((s: any) => typeof s === 'string') : [];
  const ratePerSquareRaw = body.ratePerSquare;
  const commissionPercentRaw = body.commissionPercent;
  const salaryRateRaw = body.salaryRate;
  const salaryModeRaw = body.salaryMode;
  const data: any = { email, name, role, tenantId };
  // calendarColor: expect dark hex (#0b1d2e etc) if provided
  if (typeof body.calendarColor === 'string') {
    const cc = body.calendarColor.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(cc)) {
      data.calendarColor = cc.startsWith('#') ? cc : ('#'+cc);
    }
  }
  if (payStructures.length) data.payStructuresJson = JSON.stringify(payStructures);
  if (typeof ratePerSquareRaw === 'number' && !Number.isNaN(ratePerSquareRaw)) data.ratePerSquare = ratePerSquareRaw;
  if (typeof commissionPercentRaw === 'number' && !Number.isNaN(commissionPercentRaw)) data.commissionPercent = commissionPercentRaw;
  if (typeof salaryRateRaw === 'number' && !Number.isNaN(salaryRateRaw)) data.salaryRate = salaryRateRaw;
  if (typeof salaryModeRaw === 'string') {
    const sm = salaryModeRaw.toUpperCase();
    if (Object.values(SalaryMode).includes(sm as SalaryMode)) data.salaryMode = sm as SalaryMode;
  }
  const user = await prisma.user.create({ data });
  return NextResponse.json({ ok:true, item: { id: user.id, email: user.email, name: user.name, role: user.role, payStructures: payStructures, ratePerSquare: user.ratePerSquare, commissionPercent: user.commissionPercent, salaryRate: user.salaryRate, salaryMode: user.salaryMode, docs: user.docsJson ? JSON.parse(user.docsJson) : [], calendarColor: user.calendarColor || null } });
  } catch (e: any) {
    console.error('POST /api/users failed', e);
  return NextResponse.json({ ok:false, error: e?.message || String(e), code:'SERVER_ERROR' }, { status: 500 });
  }
}
