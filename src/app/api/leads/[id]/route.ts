import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/leads/:id => detailed lead including contractPrice and assignee commissionPercent
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })
  try {
    const current = await getCurrentUser(req).catch(()=>null as any)
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        assignee: true,
        contact: true,
        property: true,
      }
    })
    if (!lead) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
    // Basic role-based visibility: sales only see their own lead
    if (current?.role === 'SALES' && lead.assigneeId && lead.assignee?.email !== current.email) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    }
    const contractPrice = typeof lead.contractPrice === 'number' && isFinite(lead.contractPrice) ? lead.contractPrice : null
    const commissionPercent = typeof lead.assignee?.commissionPercent === 'number' && isFinite(lead.assignee.commissionPercent) ? lead.assignee.commissionPercent : null
    return NextResponse.json({ ok: true, lead: {
      id: lead.id,
      stage: lead.stage,
      contractPrice,
      address: lead.property ? [lead.property.address1, lead.property.city, [lead.property.state, lead.property.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '',
      assignee: lead.assignee ? { id: lead.assignee.id, email: lead.assignee.email, name: lead.assignee.name, commissionPercent } : null,
    } })
  } catch(e:any) {
    return NextResponse.json({ ok: false, error: String(e?.message||e) }, { status: 500 })
  }
}

// Ensure module shape
export {}
