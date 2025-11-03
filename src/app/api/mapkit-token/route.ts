import { NextRequest, NextResponse } from "next/server";
import { getMapkitToken } from "@/lib/mapkit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const qsOrigin = url.searchParams.get("origin");
    const referer = req.headers.get("referer");
    const origin = qsOrigin || referer || req.headers.get("origin") || undefined;
    const token = await getMapkitToken(origin);
    if (!token) return NextResponse.json({ error: "MapKit not configured" }, { status: 400 });
    return NextResponse.json({ token, keyId: process.env.MAPKIT_KEY_ID });
  } catch (e: any) {
    return NextResponse.json({ error: "token_error", message: e?.message || String(e) }, { status: 500 });
  }
}
