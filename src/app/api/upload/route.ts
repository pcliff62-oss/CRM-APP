import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
	// Placeholder upload endpoint.
	return NextResponse.json({ ok: true, message: "upload stub" });
}

