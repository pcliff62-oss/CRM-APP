import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentTenantId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json([], { status: 200 });
  const items = await prisma.proposal.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = await req.json();
    const { templateName, templateBody, leadId, mergedHtml } = data || {};
    if (!templateName || !templateBody) return NextResponse.json({ error: "templateName and templateBody required" }, { status: 400 });
    const created = await prisma.proposal.create({ data: { tenantId, leadId: leadId || null, templateName, templateBody, mergedHtml: mergedHtml || null } });
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
