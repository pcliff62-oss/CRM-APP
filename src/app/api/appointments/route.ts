import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentTenantId, getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json([], { status: 200 });
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId") || undefined;
  const userId = searchParams.get("userId") || undefined;
  const items = await prisma.appointment.findMany({
    where: { tenantId, leadId, userId },
    include: { lead: { include: { contact: true, property: true, assignee: true } }, user: true },
    orderBy: { start: "asc" }
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  const user = await getCurrentUser(req);
  if (!tenantId || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json();
  const created = await prisma.appointment.create({ data: { title: data.title, description: data.description ?? null, start: new Date(data.start), end: new Date(data.end), allDay: !!data.allDay, leadId: data.leadId ?? null, userId: data.userId ?? user.id, tenantId } });
  return NextResponse.json(created, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json();
  if (!data.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const updated = await prisma.appointment.update({ where: { id: data.id }, data: { title: data.title, description: data.description ?? null, start: new Date(data.start), end: new Date(data.end), allDay: !!data.allDay, leadId: data.leadId ?? null, userId: data.userId ?? null, tenantId } });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await prisma.appointment.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
