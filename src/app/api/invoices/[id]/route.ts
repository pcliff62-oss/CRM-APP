import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/invoices/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { lead: { include: { contact: true, property: true } }, contact: true } })
  if (!inv) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, item: inv })
}

// PATCH /api/invoices/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  let body: any = {}
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    body = await req.json().catch(()=>({}))
  } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    form.forEach((v,k)=> { body[k]=v })
  }
  const data: any = {}
  if ('status' in body) data.status = String(body.status)
  if ('depositAmount' in body) data.depositAmount = Number(body.depositAmount) || 0
  if ('extrasJson' in body) data.extrasJson = String(body.extrasJson || '')
  if ('dueDate' in body) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if ('viewedAt' in body) data.viewedAt = body.viewedAt ? new Date(body.viewedAt) : null
  if ('paidAt' in body) data.paidAt = body.paidAt ? new Date(body.paidAt) : null
  if ('emailedAt' in body) data.emailedAt = body.emailedAt ? new Date(body.emailedAt) : null

  // Extract dynamic line items from form fields item_<idx>_title, _qty, _rate
  const lineKeys = Object.keys(body).filter(k => /^item_\d+_title$/.test(k))
  if (lineKeys.length) {
    const items: any[] = []
    for (const titleKey of lineKeys) {
      const idx = titleKey.match(/^item_(\d+)_title$/)![1]
      const title = String(body[titleKey]||'').trim()
      const qty = Number(body[`item_${idx}_qty`]||1) || 0
      const rate = Number(body[`item_${idx}_rate`]||0) || 0
      const desc = String(body[`item_${idx}_desc`]||'').trim()
      if (title || rate) items.push({ title, description: desc, qty, price: rate })
    }
    data.extrasJson = JSON.stringify(items)
  }

  // Recompute totals if deposit or items/extras changed
  if ('depositAmount' in body || 'extrasJson' in body || lineKeys.length) {
    const current = await prisma.invoice.findUnique({ where: { id }, select: { contractPrice: true, type: true } })
    const extras = (() => { try { return JSON.parse(String(data.extrasJson||body.extrasJson||'[]')) } catch { return [] } })()
    const extrasTotal = extras.reduce((s:number,x:any)=> {
      const qty = Number(x?.qty||1) || 1
      const price = Number(x?.price ?? x?.rate ?? 0) || 0
      const manual = !!x?.manualAmount
      const amt = manual ? (Number(x?.amount)||0) : (qty * price)
      return s + amt
    }, 0)
    const isDeposit = String(current?.type||'').toUpperCase() === 'DEPOSIT'
    // For DEPOSIT invoices, totalDue should come solely from extrasJson (single deposit line)
    const totalDue = isDeposit ? extrasTotal : (current?.contractPrice || 0) - (Number(body?.depositAmount)||0) + extrasTotal
    data.extrasTotal = extrasTotal
    data.totalDue = totalDue
  }

  const inv = await prisma.invoice.update({ where: { id }, data })
  return NextResponse.json({ ok: true, item: inv })
}

// DELETE /api/invoices/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  try {
    await prisma.invoice.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: String(e?.message||e) }, { status: 500 })
  }
}
