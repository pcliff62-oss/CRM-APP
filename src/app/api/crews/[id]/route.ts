import { NextResponse } from 'next/server'
const SERVER_BASE = process.env.SERVER_BASE || 'http://127.0.0.1:4000'
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const r = await fetch(`${SERVER_BASE}/api/crews/${encodeURIComponent(params.id)}`, { method:'DELETE' }).catch(()=>null as any)
  if (!r || !r.ok) return NextResponse.json({ ok:false, error:'Failed' }, { status: 400 })
  return NextResponse.json({ ok:true })
}
