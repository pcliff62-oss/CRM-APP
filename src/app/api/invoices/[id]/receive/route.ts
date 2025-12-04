import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  const contentType = req.headers.get('content-type') || ''
  let body: any = {}
  try {
    if (contentType.includes('application/json')) body = await req.json()
    else if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData(); form.forEach((v,k)=> (body[k]=v))
    }
  } catch {}

  const amount = Number(body.amount || 0)
  const method = String(body.method || '').toUpperCase() || 'CHECK'
  const ref = String(body.ref || body.checkNumber || '')
  if (!isFinite(amount) || amount <= 0) return NextResponse.json({ ok: false, error: 'Invalid amount' }, { status: 400 })

  const inv = await prisma.invoice.findUnique({ where: { id } })
  if (!inv) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

  // For DEPOSIT invoices: record payment details but set status to PENDING (moves into Pending queue)
  const isDeposit = String(inv.type||'').toUpperCase() === 'DEPOSIT'
  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      paidAt: new Date(),
      paidAmount: amount,
      paymentMethod: method,
      paymentRef: ref || null,
      // Transition deposit invoice from DEPOSIT -> PENDING; regular invoices -> PAID
      status: isDeposit ? 'PENDING' : 'PAID',
    }
  })

  // If this was a DEPOSIT invoice, accumulate onto contact.depositReceived (display-only for now)
  if (isDeposit && updated.contactId) {
    try {
      const contact = await prisma.contact.findUnique({ where: { id: updated.contactId }, select: { depositReceived: true } })
      const prev = Number(contact?.depositReceived || 0) || 0
      const next = prev + amount
      await prisma.contact.update({ where: { id: updated.contactId }, data: { depositReceived: next } })
  try { revalidatePath('/customers'); revalidatePath(`/customers/${updated.contactId}`) } catch {}
    } catch {/* non-blocking */}
  }

  return NextResponse.json({ ok: true, item: updated })
}
