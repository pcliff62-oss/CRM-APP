import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DIST_ROOT = path.join(process.cwd(), "packages", "proposal-app-launched", "dist");

export async function GET() {
  try {
    const p = path.join(DIST_ROOT, "HyTechProposalTemplate.docx");
    const buf = await fs.readFile(p);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

export const dynamic = "force-dynamic";
