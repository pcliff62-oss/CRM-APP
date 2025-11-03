import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json([]);
  const users = await prisma.user.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
  return NextResponse.json(users);
}
