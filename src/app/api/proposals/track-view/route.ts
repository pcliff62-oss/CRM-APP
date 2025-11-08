import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Minimal stub to satisfy type checks. Extend later to track proposal views.
export async function POST(req: NextRequest) {
	try {
		const data = await req.json().catch(() => ({}));
		return NextResponse.json({ ok: true, received: data ?? null });
	} catch (e: any) {
		return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
	}
}

