import { NextRequest, NextResponse } from 'next/server'
const SERVER_BASE = process.env.SERVER_BASE || 'http://127.0.0.1:4000'
export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=>({}))
  const r = await fetch(`${SERVER_BASE}/api/appointments`, { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) }).catch(()=>null as any)
  if (!r || !r.ok) return NextResponse.json({ ok:false, error:'Failed' }, { status: 400 })
  const data = await r.json().catch(()=>({ ok:false }))
  return NextResponse.json(data)
}
