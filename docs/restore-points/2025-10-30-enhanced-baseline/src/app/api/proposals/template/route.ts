import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import builtinTemplate from "@/templates/hytech/web-proposal";

export const dynamic = "force-dynamic";

export async function GET() {
  // Preferred override path under public so users can drop in exact HTML
  const pubPath = path.join(process.cwd(), "public", "templates", "hytech", "proposal.html");
  try {
    const buf = await fs.readFile(pubPath);
    return new NextResponse(buf, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {}

  // Fallback: return built-in template string
  return new NextResponse(builtinTemplate, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
