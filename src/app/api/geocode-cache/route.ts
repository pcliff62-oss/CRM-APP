import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { id, lat, lng } = await req.json();
    if (!id || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }
    // Only set if not already present
    const updated = await prisma.property.update({
      where: { id },
      data: { lat, lng }
    });
    return NextResponse.json({ ok: true, id: updated.id });
  } catch (e: any) {
    return NextResponse.json({ error: 'server_error', message: e?.message }, { status: 500 });
  }
}