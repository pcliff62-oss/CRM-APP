import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentTenantId, getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  // Auth helpers now auto-provision a demo tenant/user if missing.
  const tenantId = await getCurrentTenantId(req);
  const user = await getCurrentUser(req);
  if (!tenantId || !user) {
    return NextResponse.json({ error: "Auth fallback failed to provision demo user" }, { status: 500 });
  }

  const body = await req.json();
  // Create or find contact
  const contact = await prisma.contact.create({
    data: { tenantId, name: body.name, email: body.email, phone: body.phone }
  });

  // Create property (single-line address stored in address1 for now)
  const property = await prisma.property.create({
    data: { tenantId, contactId: contact.id, address1: body.address, city: body.city || "", state: body.state || "", postal: body.postal || "" }
  });

  // Create lead always starting in initial pipeline column "LEAD"
  const lead = await prisma.lead.create({
    data: {
      tenantId,
      contactId: contact.id,
      propertyId: property.id,
      title: body.category ? `${body.category} for ${contact.name}` : `Lead for ${contact.name}`,
      stage: "LEAD", // force initial stage
      notes: body.notes ?? null,
      category: body.category ?? null,
      customScope: body.customScope ?? null,
      assigneeId: body.userId || user.id
    }
  });

  // Create appointment (1 hour block already computed by client)
  await prisma.appointment.create({
    data: {
      tenantId,
      title: `Appt: ${contact.name}`,
      description: body.notes ?? null,
      start: new Date(body.start),
      end: new Date(body.end),
      allDay: false,
      leadId: lead.id,
      userId: body.userId || user.id
    }
  });

  // Ensure leads board reflects the new lead in LEAD column
  revalidatePath('/leads');
  return NextResponse.json({ id: lead.id }, { status: 201 });
}
