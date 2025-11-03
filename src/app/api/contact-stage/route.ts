import prisma from '@/lib/db';
import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';

// Accepts { contactId, stage } and ensures there is a lead associated to the contact, updating/creating as needed.
// Stages: LEAD, PROSPECT, APPROVED, COMPLETED, INVOICED, ARCHIVE
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { contactId, stage } = body || {};
  if (!contactId || !stage) return new Response('Missing contactId or stage', { status: 400 });

  const contact = await prisma.contact.findUnique({ where: { id: contactId }, include: { leads: true } });
  if (!contact) return new Response('Contact not found', { status: 404 });

  // Choose most recent lead or create new one.
  let lead = contact.leads[0];
  if (!lead) {
    lead = await prisma.lead.create({ data: { tenantId: contact.tenantId, contactId: contact.id, title: contact.name, stage } });
  } else {
    if (lead.stage !== stage) {
      lead = await prisma.lead.update({ where: { id: lead.id }, data: { stage } });
    }
  }

  // Revalidate relevant paths
  revalidatePath('/leads');
  revalidatePath('/customers');
  revalidatePath(`/customers/${contact.id}`);

  return Response.json({ ok: true, leadId: lead.id, stage: lead.stage });
}
