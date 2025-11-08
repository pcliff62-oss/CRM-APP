import prisma from '@/lib/db';
import { scheduleJobForLead } from '@/lib/jobs';
import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';

// POST { leadId, stage }
export async function POST(req: NextRequest) {
  const { leadId, stage } = await req.json();
  if (!leadId || !stage) return new Response('Missing leadId or stage', { status: 400 });
  let lead;
  try {
    lead = await prisma.lead.update({ where: { id: leadId }, data: { stage }, include: { contact: true } });
  } catch (e: any) {
    if (e?.code === 'P2025') {
      return new Response('Lead not found', { status: 404 });
    }
    return new Response('Failed to update lead', { status: 500 });
  }

  // If moved into APPROVED, auto-schedule a job as all-day block on next available days
  let jobInfo: any = undefined;
  if (lead.stage === 'APPROVED') {
    try { jobInfo = await scheduleJobForLead(lead.id); } catch (e) { /* ignore */ }
  }

  revalidatePath('/leads');
  if (lead.contactId) {
    revalidatePath('/customers');
    revalidatePath(`/customers/${lead.contactId}`);
  }
  return Response.json({ ok: true, leadId: lead.id, contactId: lead.contactId, stage: lead.stage, job: jobInfo });
}
