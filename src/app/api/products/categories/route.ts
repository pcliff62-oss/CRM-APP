import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Minimal placeholder to satisfy module export and unblock builds.
// If the app expects real categories, wire this to your data source.
export async function GET() {
	try {
		// TODO: Replace with real categories fetch
		const categories: Array<{ id: string; name: string }> = [];
		return NextResponse.json(categories, { status: 200 });
	} catch (e) {
		return NextResponse.json({ error: "Failed to load categories" }, { status: 500 });
	}
}

