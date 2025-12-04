import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { mapDbToMobileAppt } from '@/lib/mapAppointment'

// Prevent Next from attempting to pre-render/collect at build for this dynamic API route
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

// GET /api/appointments/:id -> returns a single mapped appointment
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    if (!id) return NextResponse.json({ ok:false, error:'Missing id' }, { status: 400 })
    const a = await prisma.appointment.findUnique({
      where: { id },
      include: { user: true, lead: { include: { contact: true, property: true, assignee: true } }, assignees: { include: { user: true } }, crews: true, scopes: true }
    })
    if (!a) return NextResponse.json({ ok:false, error:'Not found' }, { status: 404 })
    const item = mapDbToMobileAppt(a as any)
    return NextResponse.json({ ok: true, item })
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    if (!id) return NextResponse.json({ ok:false, error: 'Missing id' }, { status: 400 })
    await prisma.appointment.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const msg = e?.code === 'P2025' ? 'Not found' : (e?.message || 'Delete failed')
    const status = e?.code === 'P2025' ? 404 : 500
    return NextResponse.json({ ok:false, error: msg }, { status })
  }
}
