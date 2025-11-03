import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentTenantId } from "@/lib/auth";
import { jwtSign, getSignSecret } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 401 });
    const body = await req.json();
    const { leadId, templateName = "HyTechProposalTemplate.docx", snapshot } = body || {};
    if (!snapshot || typeof snapshot !== "object") {
      return NextResponse.json({ error: "Missing snapshot" }, { status: 400 });
    }
    const grandTotal = Number(snapshot?.computed?.grandTotal || 0) || null;

    // Persist a Proposal row using existing columns. We store the snapshot JSON in templateBody.
    const data: any = {
      tenantId,
      leadId: leadId || null,
      templateName,
      templateBody: JSON.stringify(snapshot),
      status: "Sent",
      mergedHtml: grandTotal != null ? String(grandTotal) : null,
    };
    const proposal = await prisma.proposal.create({ data });

    // Create a stateless signing token that encodes the proposal id and expiry; no DB fields required
    const tokenPayload = { id: proposal.id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14 };
    const token = jwtSign(tokenPayload, getSignSecret());
  const signUrl = `${req.nextUrl.origin}/p/${encodeURIComponent(token)}/view`;
    return NextResponse.json({ id: proposal.id, signUrl, token, grandTotal }, { status: 201 });
  } catch (e: any) {
    console.error("create proposal error", e);
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
