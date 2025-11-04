import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentTenantId, getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok: true, items: [] }, { status: 200 });
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId") || undefined;
  const userId = searchParams.get("userId") || undefined;
  const assignedTo = (searchParams.get("assignedTo") || "").trim(); // email convention from field app
  let appts = await prisma.appointment.findMany({
    where: { tenantId, leadId, userId },
    include: { lead: { include: { contact: true, property: true, assignee: true } }, user: true },
    orderBy: { start: "asc" }
  });
  if (assignedTo) {
    const current = await getCurrentUser(req).catch(()=>null as any);
    const currentEmail = (current?.email || '').toLowerCase();
    const needle = assignedTo.toLowerCase();
    appts = appts.filter(a => {
      const email = (a.user?.email || '').toLowerCase();
      return email === needle || (currentEmail && email === currentEmail) || email === '';
    });
  }
  const items = appts.map(mapDbToMobileAppt);
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  const user = await getCurrentUser(req);
  if (!tenantId || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const data = await req.json();
  // Field app sends: { id?, title, type, when(ISO), location, notes, customerId, assignedTo(email) }
  const when = data.when ? new Date(data.when) : new Date();
  // Resolve assigned user by email if provided
  let userId: string | null = user.id;
  if (data.assignedTo && typeof data.assignedTo === 'string') {
    const u = await prisma.user.findUnique({ where: { email: data.assignedTo } }).catch(()=>null);
    if (u) userId = u.id;
  }
  const base = { title: data.title || 'Untitled', description: data.notes || null, start: when, end: new Date(when.getTime() + 60*60*1000), allDay: false, leadId: data.customerId || null, userId, tenantId } as const;
  const record = data.id
    ? await prisma.appointment.update({ where: { id: data.id }, data: base })
    : await prisma.appointment.create({ data: base });
  const full = await prisma.appointment.findUnique({ where: { id: record.id }, include: { user: true, lead: { include: { contact: true, property: true } } } });
  return NextResponse.json({ ok: true, item: mapDbToMobileAppt(full!) }, { status: 200 });
}

export async function PUT(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const data = await req.json();
  if (!data.id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  const when = data.when ? new Date(data.when) : (data.start ? new Date(data.start) : new Date());
  // Resolve user by email (assignedTo) or accept provided userId
  let userId: string | null = data.userId || null;
  if (data.assignedTo && typeof data.assignedTo === 'string') {
    const u = await prisma.user.findUnique({ where: { email: data.assignedTo } }).catch(()=>null);
    if (u) userId = u.id;
  }
  const updated = await prisma.appointment.update({ where: { id: data.id }, data: { title: data.title, description: data.notes ?? data.description ?? null, start: when, end: new Date(when.getTime()+60*60*1000), allDay: !!data.allDay, leadId: data.customerId ?? data.leadId ?? null, userId, tenantId } });
  const full = await prisma.appointment.findUnique({ where: { id: updated.id }, include: { user: true, lead: { include: { contact: true, property: true } } } });
  return NextResponse.json({ ok: true, item: mapDbToMobileAppt(full!) });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await prisma.appointment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

function mapDbToMobileAppt(a: any) {
  const isJob = !!a.allDay || (typeof a.title === 'string' && a.title.toUpperCase().startsWith('JOB:'));
  const customerName = a.lead?.contact?.name || '';
  const property = a.lead?.property || null;
  const addr = property ? [property.address1, property.city, [property.state, property.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
  const workType = a.lead?.title || (isJob ? 'Job' : 'Appointment');
  let title = a.title || 'Untitled';
  if (isJob && typeof title === 'string') {
    // Normalize any "XX.xxxxx sq" to two decimals
    title = title.replace(/(\d+\.\d+)(?=\s*sq\b)/gi, (m) => {
      const n = parseFloat(m);
      if (!isFinite(n)) return m;
      return n.toFixed(2);
    });
  }
  return {
    id: a.id,
    title,
    type: isJob ? 'install' : 'other',
    when: new Date(a.start).toISOString(),
    location: addr,
    notes: a.description || '',
    customerId: a.leadId || '',
    assignedTo: a.user?.email || '',
    job: isJob,
    customerName,
    address: addr,
    workType,
  };
}
