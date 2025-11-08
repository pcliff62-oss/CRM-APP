import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// Prevent Next from attempting to pre-render/collect at build for this dynamic API route
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

// Minimal GET so build tooling finds a handler; returns 405 hinting DELETE-only semantics
export async function GET() {
  return NextResponse.json({ ok:false, error:'Method not allowed' }, { status: 405 })
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
