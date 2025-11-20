import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/leads/:id/extras  body: { extrasJson }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  if (!id) return NextResponse.json({ ok:false, error:'Missing id' }, { status:400 })
  const body = await req.json().catch(()=>({}))
  if (!Object.prototype.hasOwnProperty.call(body,'extrasJson')) {
    return NextResponse.json({ ok:false, error:'extrasJson required' }, { status:400 })
  }
  let value = '[]'
  try {
    value = String(body.extrasJson ?? '[]')
    JSON.parse(value)
  } catch { value = '[]' }
  const updated = await prisma.lead.update({ where:{ id }, data:{ extrasJson: value } })
  return NextResponse.json({ ok:true, item:{ id: updated.id, contractPrice: updated.contractPrice ?? null, extrasJson: updated.extrasJson || '[]' } })
}
