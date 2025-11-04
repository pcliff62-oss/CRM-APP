import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
	// Placeholder: return empty list of views for now.
	return NextResponse.json({ ok: true, views: [] });
}

