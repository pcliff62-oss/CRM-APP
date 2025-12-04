import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth'
import { Role } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function mapToMobile(a: any) {
  if (!a) return null
  const rawTitle = typeof a.title === 'string' ? a.title : ''
  const isJob = !!a.allDay || /^JOB:\s*/i.test(rawTitle || '') || !!a.jobStatus || !!a.squares || !!a.crewId
  const customerName = a.lead?.contact?.name || ''
  const property = a.lead?.property || null
  const addr = property ? [property.address1, property.city, [property.state, property.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''
  const workType = a.lead?.title || (isJob ? 'Job' : 'Appointment')
  let title = a.title || 'Untitled'
  if (isJob && typeof title === 'string') {
    title = title.replace(/(\d+\.\d+)(?=\s*sq\b)/gi, (m) => {
      const n = parseFloat(m); return isFinite(n) ? n.toFixed(2) : m
    })
  }
  const squares = ((): number | null => {
    const v = (a as any).squares
    if (typeof v === 'number' && isFinite(v) && v > 0) return v
    const mm = typeof a.title === 'string' ? a.title.match(/(\d+(?:\.\d+)?)\s*sq\b/i) : null
    if (mm) { const n = parseFloat(mm[1]); if (isFinite(n) && n > 0) return n }
    return null
  })()
  return {
    id: a.id,
    title,
    type: isJob ? 'install' : 'other',
    when: new Date(a.start).toISOString(),
    end: a.end ? new Date(a.end).toISOString() : undefined,
    allDay: !!a.allDay,
    location: addr,
    notes: a.description || '',
    customerId: a.leadId || '',
    contactId: a.lead?.contactId || a.lead?.contact?.id || '',
    assignedTo: a.user?.email || '',
    job: isJob,
    customerName,
    address: addr,
    workType,
    crewId: a.crewId || '',
    jobStatus: a.jobStatus || (isJob ? 'scheduled' : ''),
    materialOrdered: !!a.materialOrdered,
    squares,
    extrasJson: a.extrasJson || '[]',
    attachmentsJson: a.attachmentsJson || '[]',
    completedAt: a.completedAt ? new Date(a.completedAt).toISOString() : undefined,
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
  const tenantId = await getCurrentTenantId(req)
    if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status: 401 })
  const user = await getCurrentUser(req)
  const role = user?.role
  const canSubmit = role === Role.SALES || role === Role.ADMIN || role === Role.MANAGER
    const id = params.id
    const body = await req.json().catch(()=>({}))
    // Validate appointment exists for this tenant
    const current = await prisma.appointment.findFirst({ where: { id, tenantId }, include: { user: true, lead: { include: { contact: true, property: true } } } })
    if (!current) return NextResponse.json({ ok:false, error:'Not found' }, { status: 404 })
    // Sanitize incoming fields
  // Only SALES/ADMIN/MANAGER can mark the job card as "submitted". Crew completion should not flip the CRM card.
    const patch: any = { }
  if (canSubmit) {
      patch.jobStatus = 'submitted'
      patch.completedAt = new Date()
    } else {
      // Record completion timestamp from the field app without changing status
      patch.completedAt = new Date()
    }
    if (body && Object.prototype.hasOwnProperty.call(body, 'squares')) {
      const n = Number(body.squares); if (Number.isFinite(n)) patch.squares = n
    }
    if (body && Object.prototype.hasOwnProperty.call(body, 'extrasJson')) {
      try { const v = String(body.extrasJson ?? '[]'); JSON.parse(v); patch.extrasJson = v } catch { patch.extrasJson = '[]' }
    }
    if (body && Object.prototype.hasOwnProperty.call(body, 'attachments')) {
      try { patch.attachmentsJson = JSON.stringify(body.attachments || []) } catch { patch.attachmentsJson = '[]' }
    }
    const updated = await prisma.appointment.update({ where: { id }, data: patch })
    // If submitted by allowed roles and there is a lead, move pipeline stage to COMPLETED
    try {
      if (canSubmit && updated.leadId) {
        await prisma.lead.update({ where: { id: updated.leadId }, data: { stage: 'COMPLETED' } })
      }
    } catch {}
    const full = await prisma.appointment.findUnique({ where: { id: updated.id }, include: { user: true, lead: { include: { contact: true, property: true } } } })
    return NextResponse.json({ ok:true, item: mapToMobile(full) })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: String(e?.message||e) }, { status: 500 })
  }
}
