import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { lead: { include: { contact: true } }, contact: true } })
  if (!inv) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  let toPrimary = inv.contact?.email || (inv as any).lead?.contact?.email || ''
  let recipients: string[] = []
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      const body = await req.json().catch(()=> ({}))
      const raw = body.recipients as string | undefined
      if (raw) {
        recipients = raw.split(',').map(s=> s.trim()).filter(Boolean)
      }
    } else if (req.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData()
      const raw = form.get('recipients') as string | null
      if (raw) recipients = raw.split(',').map(s=> s.trim()).filter(Boolean)
    }
  } catch {}
  if (recipients.length === 0 && toPrimary) recipients = [toPrimary]
  if (recipients.length === 0) return NextResponse.json({ ok: false, error: 'No recipient emails' }, { status: 400 })

  const subject = `Invoice ${inv.number || ''}`.trim()
  const total = inv.totalDue || 0
  const body = `Dear customer,\n\nPlease find your invoice ${inv.number || ''}. Total due: $${total.toFixed(2)}.\n\nThank you.`
  for (const to of recipients) {
    await sendEmail(to, subject, body)
  }

  const updated = await prisma.invoice.update({ where: { id }, data: { status: 'SENT', emailedAt: new Date() } })
  return NextResponse.json({ ok: true, item: updated, recipients })
}
