import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentTenantId } from "@/lib/auth";
import { promises as fs } from "fs";
import path from "path";
import { getGcs, gcsPublicUrl } from "@/lib/gcs";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json([], { status: 200 });
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId") || undefined;
  const leadId = searchParams.get("leadId") || undefined;
  const items = await prisma.file.findMany({ where: { tenantId, contactId, leadId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const files = form.getAll("file") as any[];
  const fileSingle = (form.get("file") as unknown as File | null) || null;
  const fileList: File[] = (files && files.length ? files : (fileSingle ? [fileSingle] : [])) as unknown as File[];
  if (!fileList.length) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  const category = (form.get("category") as string) || "documents"; // photos | documents
  const folder = (form.get("folder") as string) || "Docs"; // Measurements | Proposals | Signed contract | Docs
  const contactId = (form.get("contactId") as string) || null;
  const leadId = (form.get("leadId") as string) || null;

  const bucket = process.env.GCS_BUCKET;
  const publicBase = process.env.GCS_PUBLIC_BASE_URL;
  const uploadDir = path.join(process.cwd(), "public", "uploads", tenantId);
  if (!bucket) {
    await fs.mkdir(uploadDir, { recursive: true });
  }
  const hmacAccess = process.env.GCS_HMAC_ACCESS_KEY_ID;
  const hmacSecret = process.env.GCS_HMAC_SECRET_ACCESS_KEY;
  const s3Endpoint = process.env.GCS_S3_ENDPOINT || "https://storage.googleapis.com";
  const s3Region = process.env.GCS_S3_REGION || "us-east-1"; // GCS ignores, but AWS SDK requires a value
  const useS3 = Boolean(bucket && hmacAccess && hmacSecret);
  const s3 = useS3
    ? new S3Client({
        region: s3Region,
        endpoint: s3Endpoint,
        forcePathStyle: false,
        credentials: { accessKeyId: hmacAccess!, secretAccessKey: hmacSecret! }
      })
    : null;
  const created: any[] = [];
  for (const f of fileList) {
    const arrayBuffer = await (f as any).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = `${Date.now()}_${(f as any).name || "upload"}`;
    let url: string;
    if (bucket) {
      // Upload to GCS
      const objectKey = `${tenantId}/${filename}`;
      if (useS3 && s3) {
        // Use S3-compatible API with HMAC keys
        try {
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: objectKey,
              Body: buffer,
              ContentType: (f as any).type || undefined,
              ACL: "public-read" // may fail if bucket has Uniform access (ACLs disabled)
            })
          );
        } catch (err) {
          // Retry without ACL if server rejects ACLs
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: objectKey,
              Body: buffer,
              ContentType: (f as any).type || undefined
            })
          );
        }
        url = gcsPublicUrl(bucket, objectKey, publicBase);
      } else {
        const storage = getGcs();
        const fileRef = storage.bucket(bucket).file(objectKey);
        await fileRef.save(buffer, { contentType: (f as any).type || undefined, resumable: false });
        try { await fileRef.makePublic(); } catch {}
        url = gcsPublicUrl(bucket, objectKey, publicBase);
      }
    } else {
      const destPath = path.join(uploadDir, filename);
      await fs.writeFile(destPath, buffer as any);
      url = `/uploads/${tenantId}/${filename}`;
    }
    const rec = await prisma.file.create({
      data: {
        tenantId,
        contactId: contactId || undefined,
        leadId: leadId || undefined,
        category,
        folder,
        name: filename,
        path: url,
        mime: (f as any).type || null,
        size: (f as any).size || null
      }
    });
    created.push(rec);
  }

  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bucket = process.env.GCS_BUCKET;
  const publicBase = process.env.GCS_PUBLIC_BASE_URL;
  const hmacAccess = process.env.GCS_HMAC_ACCESS_KEY_ID;
  const hmacSecret = process.env.GCS_HMAC_SECRET_ACCESS_KEY;
  const s3Endpoint = process.env.GCS_S3_ENDPOINT || "https://storage.googleapis.com";
  const s3Region = process.env.GCS_S3_REGION || "us-east-1";
  const useS3 = Boolean(bucket && hmacAccess && hmacSecret);
  const s3 = useS3
    ? new S3Client({
        region: s3Region,
        endpoint: s3Endpoint,
        forcePathStyle: false,
        credentials: { accessKeyId: hmacAccess!, secretAccessKey: hmacSecret! }
      })
    : null;
  if (bucket && file.path) {
    let key: string | null = null;
    const marker = `/${bucket}/`;
    if (file.path.includes(marker)) {
      key = file.path.split(marker)[1];
    } else if (publicBase && file.path.startsWith(publicBase)) {
      key = file.path.substring(publicBase.replace(/\/$/, "").length + 1);
    }
    if (key) {
      try {
        if (useS3 && s3) {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        } else {
          await getGcs().bucket(bucket).file(key).delete();
        }
      } catch {}
    }
  }
  // Best-effort local delete
  if (file.path?.startsWith(`/uploads/${tenantId}/`)) {
    const p = path.join(process.cwd(), "public", file.path);
    try { await fs.unlink(p); } catch {}
  }
  await prisma.file.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { id, folder } = body || {};
  if (!id || !folder) return NextResponse.json({ error: "Missing id or folder" }, { status: 400 });
  const updated = await prisma.file.update({ where: { id }, data: { folder } });
  return NextResponse.json(updated);
}
