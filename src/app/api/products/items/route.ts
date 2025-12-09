import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Placeholder endpoint for product items; replace with actual data source.
export async function GET() {
	try {
		const items: Array<{ id: string; name: string; price?: number }> = [];
		return NextResponse.json(items, { status: 200 });
	} catch (e) {
		return NextResponse.json({ error: "Failed to load product items" }, { status: 500 });
	}
}

