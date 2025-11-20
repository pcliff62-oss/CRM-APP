import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Placeholder route to satisfy module structure. Implement logic when job scheduling feature is ready.
export async function GET() {
	return NextResponse.json({ ok: true, items: [] })
}

// Ensure module shape for Next.js type generation
export {}
