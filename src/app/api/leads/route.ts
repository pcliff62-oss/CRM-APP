import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { scheduleJobForLead } from '@/lib/jobs'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/leads?assignedTo=<email>
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const assignedTo = (searchParams.get('assignedTo') || '').trim().toLowerCase()
  const current = await getCurrentUser(req).catch(()=>null as any)
  const currentEmail = (current?.email||'').toLowerCase()
  const role = (current as any)?.role || 'ADMIN'
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
  if (role === 'SALES') {
    // Strict: only leads whose assignee matches the current user
    leads = leads.filter(l => (l.assignee?.email||'').toLowerCase() === currentEmail)
  } else if (assignedTo) {
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

// POST /api/leads { id, stage }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body?.id || '').trim()
    const stage = String(body?.stage || '').trim().toUpperCase()
    if (!id || !stage) return NextResponse.json({ ok: false, error: 'Missing id or stage' }, { status: 400 })
    const allowed = ['LEAD','PROSPECT','APPROVED','COMPLETED','INVOICED','ARCHIVE']
    if (!allowed.includes(stage)) return NextResponse.json({ ok: false, error: 'Invalid stage' }, { status: 400 })
    const updated = await prisma.lead.update({ where: { id }, data: { stage: stage as any }, include: { contact: true, assignee: true } }).catch(()=>null)
    if (!updated) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    // Auto-create job if moved to APPROVED (align with /api/lead-stage behavior)
    let job: any = null
    if (updated.stage === 'APPROVED') {
      try {
        job = await scheduleJobForLead(updated.id)
        // If lead has assignee, set appointment.userId so calendar filters pick it up
        if (job?.apptId && updated.assigneeId) {
          await prisma.appointment.update({ where: { id: job.apptId }, data: { userId: updated.assigneeId } }).catch(()=>null)
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, item: { id: updated.id, stage: updated.stage }, job })
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: String(e?.message||e) }, { status: 500 })
  }
}
