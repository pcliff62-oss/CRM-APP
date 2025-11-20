import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Placeholder: returns minimal lead brief; extend with actual fields later.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
	const id = params.id
	return NextResponse.json({ ok: true, lead: { id, brief: null } })
}

// Ensure module shape for Next.js type generation
export {}
