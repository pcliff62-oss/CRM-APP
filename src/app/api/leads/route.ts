import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/leads?assignedTo=<email>
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const assignedTo = (searchParams.get('assignedTo') || '').trim().toLowerCase()
  let leads = await prisma.lead.findMany({
    where: {},
    include: {
      contact: true,
      property: true,
      assignee: true,
      files: { select: { id: true, name: true, category: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 },
      measurements: { select: { id: true }, orderBy: { createdAt: 'desc' } },
    },
    orderBy: { createdAt: 'desc' }
  })
  if (assignedTo) {
    leads = leads.filter(l => {
      const email = (l.assignee?.email || '').toLowerCase()
      return email === assignedTo || email === ''
    })
  }
  const items = leads.map(l => {
    const p = l.property
    const addr = p ? [p.address1, p.city, [p.state, p.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''
    return {
      id: l.id,
      contactId: l.contactId,
      name: l.contact?.name || l.title,
      status: l.stage,
      address: addr,
      notes: l.notes || '',
      files: l.files.map(f => ({ id: f.id, name: f.name, category: f.category })),
      measurementsCount: l.measurements.length,
    }
  })
  return NextResponse.json({ ok: true, items })
}
