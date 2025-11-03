import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { jwtVerify, getSignSecret } from "@/lib/jwt";

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;
  let payload: any;
  try { payload = jwtVerify(token, getSignSecret()); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 400 }); }
  const proposal = await prisma.proposal.findUnique({ where: { id: String(payload.id || "") } });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let snapshot: any = null;
  try { snapshot = proposal.templateBody ? JSON.parse(proposal.templateBody) : null; } catch {}
  const merged = proposal.mergedHtml;
  const grandTotal = merged != null ? Number(merged) : (snapshot?.computed?.grandTotal ?? null);
  return NextResponse.json({
    id: proposal.id,
    status: proposal.status,
    signerName: null,
    signerEmail: null,
    signedAt: null,
    grandTotal,
    snapshot,
  });
}
