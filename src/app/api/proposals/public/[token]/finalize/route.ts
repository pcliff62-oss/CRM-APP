import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { scheduleJobForLead } from "@/lib/jobs";
import { jwtVerify, getSignSecret } from "@/lib/jwt";
import path from "path";
import { promises as fs } from "fs";
import { getGcs, gcsPublicUrl } from "@/lib/gcs";
import { revalidatePath } from "next/cache";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

// Lazy import Playwright in a function to avoid bundling in edge
// Returns both the PDF buffer and any text content found in #final-total-investment
async function renderPdfFromUrl(url: string, waitUntil: "load" | "networkidle" = "networkidle") {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1440 } });
  await page.goto(url, { waitUntil });
  // Attempt to extract the visible final investment total from the rendered document
  let finalTotalText: string | null = null;
  try {
    await page.waitForSelector('#final-total-investment', { timeout: 2000 }).catch(() => {});
    finalTotalText = await page.$eval('#final-total-investment', (el: any) => (el && (el.textContent || el.innerText || '')).trim()).catch(() => null);
  } catch {}
  const pdf = await page.pdf({ format: "Letter", printBackground: true, margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" } });
  await browser.close();
  return { pdf: pdf as Buffer, finalTotalText };
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;
  let payload: any;
  try { payload = jwtVerify(token, getSignSecret()); } catch (e: any) { return NextResponse.json({ error: e?.message || "Invalid token" }, { status: 400 }); }

  const proposal = await prisma.proposal.findUnique({ where: { id: String(payload.id || "") } });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { name, email, signatureDataUrl, snapshot: incomingSnapshot } = body || {};
  if (!name || !signatureDataUrl) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // Merge snapshot with signature
  let snapshot: any = {};
  try { snapshot = proposal.templateBody ? JSON.parse(proposal.templateBody) : {}; } catch {}
  if (incomingSnapshot && typeof incomingSnapshot === "object") {
    try { snapshot = { ...snapshot, ...incomingSnapshot }; } catch {}
  }
  const signedAtIso = new Date().toISOString();
  snapshot.signature = { name, email: email || null, image: signatureDataUrl, signedAt: signedAtIso };

  // Persist proposal as Accepted
  const updated = await prisma.proposal.update({
    where: { id: proposal.id },
    data: { status: "Accepted", templateBody: JSON.stringify(snapshot) },
  });

  // Render print page to PDF
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:3000`;
  const url = `${baseUrl.replace(/\/$/, "")}/p/${encodeURIComponent(token)}/print`;
  const { pdf: pdfBuffer, finalTotalText } = await renderPdfFromUrl(url);

  // Store PDF as a File record
  const tenantId = updated.tenantId;
  const bucket = process.env.GCS_BUCKET;
  const publicBase = process.env.GCS_PUBLIC_BASE_URL;
  const hmacAccess = process.env.GCS_HMAC_ACCESS_KEY_ID;
  const hmacSecret = process.env.GCS_HMAC_SECRET_ACCESS_KEY;
  const s3Endpoint = process.env.GCS_S3_ENDPOINT || "https://storage.googleapis.com";
  const s3Region = process.env.GCS_S3_REGION || "us-east-1";
  const useS3 = Boolean(bucket && hmacAccess && hmacSecret);
  const yr = new Date().getFullYear();
  const filename = `Proposal_${updated.id}_${Date.now()}.pdf`;
  let urlOut = "";

  if (bucket) {
  const objectKey = `${tenantId}/${yr}/${filename}`;
    if (useS3) {
      const s3 = new S3Client({ region: s3Region, endpoint: s3Endpoint, forcePathStyle: false, credentials: { accessKeyId: hmacAccess!, secretAccessKey: hmacSecret! } });
      try {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: pdfBuffer, ContentType: "application/pdf", ACL: "public-read" }));
      } catch {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: pdfBuffer, ContentType: "application/pdf" }));
      }
      urlOut = gcsPublicUrl(bucket, objectKey, publicBase);
    } else {
      const storage = getGcs();
      const fileRef = storage.bucket(bucket).file(objectKey);
      await fileRef.save(pdfBuffer, { contentType: "application/pdf", resumable: false });
      try { await fileRef.makePublic(); } catch {}
      urlOut = gcsPublicUrl(bucket, objectKey, publicBase);
    }
  } else {
  const uploadDir = path.join(process.cwd(), "public", "uploads", tenantId, String(yr));
    await fs.mkdir(uploadDir, { recursive: true });
    const destPath = path.join(uploadDir, filename);
  await fs.writeFile(destPath, new Uint8Array(pdfBuffer));
    urlOut = `/uploads/${tenantId}/${filename}`;
  }

  // Create File row
  await prisma.file.create({
    data: {
      tenantId,
      contactId: updated.leadId ? undefined : undefined,
      leadId: updated.leadId || undefined,
      category: "documents",
      folder: `Signed contract/${yr}`,
      name: filename,
      path: urlOut,
      mime: "application/pdf",
      size: pdfBuffer.length,
    }
  });

  // Move lead to APPROVED and add to contractPrice total if linked
  if (updated.leadId) {
    try {
      const lead = await prisma.lead.findUnique({ where: { id: updated.leadId } });
      const cur = Number(lead?.contractPrice || 0);
      // Prefer the value visible in the signed contract (#final-total-investment), fallback to computed totals
      const parsedFromDom = ((): number => {
        if (!finalTotalText) return 0;
        const n = Number((finalTotalText || '').replace(/[^\d.\-]/g, ''));
        return isFinite(n) ? n : 0;
      })();
      const add = parsedFromDom || Number((snapshot?.computed?.grandTotal) || (proposal.grandTotal ?? 0) || 0) || 0;
  const moved = await prisma.lead.update({ where: { id: updated.leadId }, data: { stage: "APPROVED", contractPrice: cur + add } });
  try { await scheduleJobForLead(moved.id); } catch {}
  try {
    revalidatePath('/leads');
    revalidatePath('/customers');
    if (lead?.contactId) revalidatePath(`/customers/${lead.contactId}`);
  } catch {}
    } catch {}
  }

  return NextResponse.json({ ok: true, id: updated.id, pdfUrl: urlOut, status: updated.status, signedAt: signedAtIso });
}
