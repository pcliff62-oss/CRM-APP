import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { jwtVerify, getSignSecret } from "@/lib/jwt";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;
  let payload: any;
  try { payload = jwtVerify(token, getSignSecret()); } catch (e: any) { return NextResponse.json({ error: e?.message || "Invalid token" }, { status: 400 }); }

  const proposal = await prisma.proposal.findUnique({ where: { id: String(payload.id || "") } });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { name, email, signatureDataUrl, snapshot: incomingSnapshot } = body || {};
  if (!name || !signatureDataUrl) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // Merge signature metadata into stored snapshot and set status to Accepted.
  let snapshot: any = null;
  try { snapshot = proposal.templateBody ? JSON.parse(proposal.templateBody) : {}; } catch { snapshot = {}; }
  // If caller provided an updated snapshot (e.g., toggled options), merge it first
  if (incomingSnapshot && typeof incomingSnapshot === 'object') {
    try { snapshot = { ...snapshot, ...incomingSnapshot }; } catch {}
  }
  snapshot.signature = { name, email: email || null, image: signatureDataUrl, signedAt: new Date().toISOString() };

  const updated = await prisma.proposal.update({
    where: { id: proposal.id },
    data: {
      status: "Accepted",
      templateBody: JSON.stringify(snapshot),
    },
  });
  // Trigger finalize workflow (PDF + file + lead status/total)
  try {
    const base = process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:3000`;
    const { jwtSign, getSignSecret } = await import("@/lib/jwt");
    const tokenOut = (await import("@/lib/jwt")).jwtSign({ id: updated.id, exp: Math.floor(Date.now() / 1000) + 60 * 60 }, getSignSecret());
    const res = await fetch(`${base.replace(/\/$/, '')}/api/proposals/public/${encodeURIComponent(tokenOut)}/finalize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, signatureDataUrl, snapshot }) });
    const j = await res.json().catch(()=>({}));
    return NextResponse.json({ ok: true, id: updated.id, status: updated.status, signedAt: snapshot.signature.signedAt, finalize: j || null });
  } catch {
    return NextResponse.json({ ok: true, id: updated.id, status: updated.status, signedAt: snapshot.signature.signedAt });
  }
}
