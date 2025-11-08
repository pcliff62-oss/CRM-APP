import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/customers/:id
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      leads: {
        include: {
          property: true,
          assignee: true,
          files: {
            select: { id: true, name: true, category: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!contact) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  const lead = contact.leads[0]
  const property = lead?.property || null
  const docs = (lead?.files || []).filter(f => f.category === 'documents').map(f => ({ id: f.id, name: f.name, category: f.category }))
  const photos = (lead?.files || []).filter(f => f.category === 'photos').map(f => ({ id: f.id, name: f.name, category: f.category }))
  const item = {
    id: contact.id,
    name: contact.name,
    email: contact.email || '',
    phone: contact.phone || '',
  flagColor: (contact as any).flagColor || null,
    town: property?.city || '',
    status: lead?.stage ? prettyStage(lead.stage) : '',
    address: property?.address1 || '',
    assignedTo: (lead?.assignee?.email || lead?.assignee?.id || ''),
    notes: lead?.notes || '',
    contractPrice: lead?.contractPrice || null,
    documents: docs,
    photos: photos,
  }
  return NextResponse.json({ ok: true, item })
}

// DELETE /api/customers/:id
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })
  await prisma.contact.delete({ where: { id } })
  try { revalidatePath('/customers') } catch {}
  return NextResponse.json({ ok: true })
}

function prettyStage(s: string) {
  const map: Record<string, string> = { LEAD: 'Lead', PROSPECT: 'Prospect', APPROVED: 'Approved', COMPLETED: 'Complete', INVOICED: 'Invoiced', ARCHIVE: 'Archived' };
  return map[s] || s;
}
