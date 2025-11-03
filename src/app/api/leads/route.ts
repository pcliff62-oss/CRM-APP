import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (id) {
    const lead = await prisma.lead.findUnique({ where: { id }, include: { contact: true, property: true } });
    return NextResponse.json(lead);
  }
  const leads = await prisma.lead.findMany({ include: { contact: true, property: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(leads);
}
