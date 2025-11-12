import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getCurrentTenantId } from '@/lib/auth'
import { Role } from '@prisma/client'

const SERVER_BASE = process.env.SERVER_BASE || 'http://127.0.0.1:4000'

export async function GET(req: NextRequest) {
  // Fetch existing crews from the server JSON store
  const r = await fetch(`${SERVER_BASE}/api/crews`).catch(() => null as any)
  const serverData: any = (!r || !r.ok) ? { ok: false, items: [] } : await r.json().catch(() => ({ ok: true, items: [] }))

  // Determine tenant scope for merging in crew-role users
  const tenantId = await getCurrentTenantId(req).catch(() => null)

  // Filter server crews to this tenant if tenantId is present on records
  const serverItems: any[] = Array.isArray(serverData?.items) ? serverData.items.filter((c: any) => {
    if (!tenantId) return true
    const t = typeof c?.tenantId === 'string' && c.tenantId ? c.tenantId : null
    return t === null || t === tenantId
  }) : []

  // Pull users with role CREW from Prisma for the same tenant
  const crewUsers = tenantId
    ? await prisma.user.findMany({ where: { tenantId, role: Role.CREW }, orderBy: { name: 'asc' } })
    : []

  const userCrews = crewUsers.map((u) => ({
    id: u.id,
    name: u.name || u.email,
    ratePerSquare: Number((u as any).ratePerSquare || 0) || 0,
    members: [{ id: u.id, name: u.name || u.email }],
    docs: (Array.isArray((u as any).docs)? (u as any).docs: []),
    tenantId: u.tenantId,
    source: 'user',
  }))

  // Merge: prefer explicit server crews on id collision
  const merged = new Map<string, any>()
  userCrews.forEach((c) => merged.set(c.id, c))
  serverItems.forEach((c) => merged.set(String(c.id), { ...c, source: c.source || 'crew' }))

  return NextResponse.json({ ok: true, items: Array.from(merged.values()) })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=>({}))
  const r = await fetch(`${SERVER_BASE}/api/crews`, { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) }).catch(()=>null as any)
  if (!r) return NextResponse.json({ ok:false, error:'Server unreachable' }, { status: 502 })
  let data: any = null
  try { data = await r.json() } catch { data = null }
  if (!r.ok) {
    const err = (data && (data.error||data.message)) || `HTTP ${r.status}`
    return NextResponse.json({ ok:false, error: err }, { status: r.status })
  }
  return NextResponse.json(data || { ok:true })
}
