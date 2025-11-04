import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/customers?assignedTo=
export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url);
	const assignedTo = (searchParams.get('assignedTo') || '').trim();
	const current = await getCurrentUser(req).catch(()=>null as any);
	const currentEmail = (current?.email || '').toLowerCase();
	const contacts = await prisma.contact.findMany({
		include: {
			leads: { include: { property: true, assignee: true } },
		},
		orderBy: { createdAt: 'desc' },
	});
	let items = contacts
		.map((c) => {
			const lead = c.leads[0];
			const property = lead?.property || null;
			return {
				id: c.id,
				name: c.name,
				email: c.email || '',
				phone: c.phone || '',
				town: property?.city || '',
				status: lead?.stage ? prettyStage(lead.stage) : '',
				address: property?.address1 || '',
				// Prefer email to match field app "user.id" convention; fall back to internal id
				assignedTo: (lead?.assignee?.email || lead?.assignee?.id || ''),
				notes: lead?.notes || '',
			};
		})
	// If a filter is provided, include items that match OR are unassigned so techs also see unassigned records
	if (assignedTo) {
		const needle = assignedTo.toLowerCase();
		items = items.filter((it) => {
			const at = String(it.assignedTo || '').toLowerCase();
			// match asked-for user, or current backend user, or unassigned
			return at === needle || (currentEmail && at === currentEmail) || at === '';
		});
	}
	return NextResponse.json({ ok: true, items });
}

// POST /api/customers  { id? , name, ... }
export async function POST(req: NextRequest) {
	const body = await req.json().catch(() => ({}));
	const id: string | undefined = body?.id || undefined;
	const name: string = String(body?.name || '').trim();
	if (!name) return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 });

	// Upsert Contact
	const contact = id
		? await prisma.contact.update({ where: { id }, data: { name, email: body?.email || null, phone: body?.phone || null } })
		: await prisma.contact.create({ data: { tenantId: await tenantIdFromAny(), name, email: body?.email || null, phone: body?.phone || null } });

	// Ensure a Lead linkage and update simple fields
	let lead = (await prisma.lead.findFirst({ where: { contactId: contact.id } })) || null;
	if (!lead) {
		lead = await prisma.lead.create({ data: { tenantId: contact.tenantId, contactId: contact.id, title: contact.name, stage: 'LEAD' } });
	}
	const stage = body?.status ? normalizeStage(body.status) : undefined;
	const propertyAddress = String(body?.address || '').trim();
	if (propertyAddress) {
		// upsert property
		const existingProp = lead.propertyId ? await prisma.property.findUnique({ where: { id: lead.propertyId } }) : null;
		const nextCity = String(body?.town || '').trim();
		const parts = { address1: propertyAddress, city: nextCity || (existingProp?.city || ''), state: existingProp?.state || '', postal: existingProp?.postal || '' };
		const prop = existingProp
			? await prisma.property.update({ where: { id: existingProp.id }, data: parts })
			: await prisma.property.create({ data: { tenantId: contact.tenantId, contactId: contact.id, ...parts } });
		if (!lead.propertyId) {
			await prisma.lead.update({ where: { id: lead.id }, data: { propertyId: prop.id } });
			lead = { ...lead, propertyId: prop.id } as any;
		}
	}
		if (lead) {
			await prisma.lead.update({ where: { id: lead.id }, data: { notes: body?.notes || null, assigneeId: body?.assignedTo || null, stage: stage || undefined } });
		}

	try { revalidatePath('/customers'); if (contact?.id) revalidatePath(`/customers/${contact.id}`); } catch {}

	return NextResponse.json({ ok: true, item: { id: contact.id, name: contact.name, email: contact.email || '', phone: contact.phone || '', address: propertyAddress || '', status: stage ? prettyStage(stage) : body?.status || '', assignedTo: body?.assignedTo || '' } });
}

// DELETE via query param: /api/customers?id=...
export async function DELETE(req: NextRequest) {
	const { searchParams } = new URL(req.url);
	const id = searchParams.get('id');
	if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
	await prisma.contact.delete({ where: { id } });
	try { revalidatePath('/customers'); } catch {}
	return NextResponse.json({ ok: true });
}

function prettyStage(s: string) {
	const map: Record<string, string> = { LEAD: 'Lead', PROSPECT: 'Prospect', APPROVED: 'Approved', COMPLETED: 'Complete', INVOICED: 'Invoiced', ARCHIVE: 'Archived' };
	return map[s] || s;
}
function normalizeStage(s: string) {
	const t = s.toLowerCase();
	if (t.startsWith('lead')) return 'LEAD';
	if (t.startsWith('prospect')) return 'PROSPECT';
	if (t.startsWith('approve')) return 'APPROVED';
	if (t.startsWith('complete')) return 'COMPLETED';
	if (t.startsWith('invoice')) return 'INVOICED';
	if (t.startsWith('arch')) return 'ARCHIVE';
	return 'LEAD';
}
async function tenantIdFromAny() {
	// Minimal fallback: pick first tenant for now. In a multi-user setup, wire actual auth.
	const t = await prisma.tenant.findFirst();
	if (t) return t.id;
	// If no tenant exists, create a default
	const fresh = await prisma.tenant.create({ data: { name: 'Default' } });
	return fresh.id;
}


