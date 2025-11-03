import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { jwtVerify, getSignSecret } from "@/lib/jwt";
import path from "path";
import { promises as fs } from "fs";
import { getGcs, gcsPublicUrl } from "@/lib/gcs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

// Lazy import Playwright in a function to avoid bundling in edge
async function renderPdfFromUrl(url: string, waitUntil: "load" | "networkidle" = "networkidle") {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1440 } });
  await page.goto(url, { waitUntil });
  const pdf = await page.pdf({ format: "Letter", printBackground: true, margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" } });
  await browser.close();
  return pdf as Buffer;
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
  const pdfBuffer = await renderPdfFromUrl(url);

  // Store PDF as a File record
  const tenantId = updated.tenantId;
  const bucket = process.env.GCS_BUCKET;
  const publicBase = process.env.GCS_PUBLIC_BASE_URL;
  const hmacAccess = process.env.GCS_HMAC_ACCESS_KEY_ID;
  const hmacSecret = process.env.GCS_HMAC_SECRET_ACCESS_KEY;
  const s3Endpoint = process.env.GCS_S3_ENDPOINT || "https://storage.googleapis.com";
  const s3Region = process.env.GCS_S3_REGION || "us-east-1";
  const useS3 = Boolean(bucket && hmacAccess && hmacSecret);
  const filename = `Proposal_${updated.id}_${Date.now()}.pdf`;
  let urlOut = "";

  if (bucket) {
    const objectKey = `${tenantId}/${filename}`;
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
    const uploadDir = path.join(process.cwd(), "public", "uploads", tenantId);
    await fs.mkdir(uploadDir, { recursive: true });
    const destPath = path.join(uploadDir, filename);
    await fs.writeFile(destPath, pdfBuffer);
    urlOut = `/uploads/${tenantId}/${filename}`;
  }

  // Create File row
  await prisma.file.create({
    data: {
      tenantId,
      contactId: updated.leadId ? undefined : undefined,
      leadId: updated.leadId || undefined,
      category: "documents",
      folder: "Signed contract",
      name: filename,
      path: urlOut,
      mime: "application/pdf",
      size: pdfBuffer.length,
    }
  });

  return NextResponse.json({ ok: true, id: updated.id, pdfUrl: urlOut, status: updated.status, signedAt: signedAtIso });
}
