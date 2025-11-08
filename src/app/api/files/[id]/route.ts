import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';
import { getGcs, parseGcsKeyFromUrlOrPath } from '@/lib/gcs';

export const runtime = 'nodejs';

function parseGcsBucketAndKeyFromUrl(filePath: string): { bucket: string; key: string } | null {
  try {
    const u = new URL(filePath);
    // Path-style: https://storage.googleapis.com/<bucket>/<key>
    if (u.hostname === 'storage.googleapis.com') {
      const parts = u.pathname.replace(/^\//, '').split('/');
      const bucket = parts.shift() || '';
      const key = parts.join('/');
      if (bucket && key) return { bucket, key };
    }
    // Virtual-host-style: https://<bucket>.storage.googleapis.com/<key>
    const m = u.hostname.match(/^(.+)\.storage\.googleapis\.com$/);
    if (m) {
      const bucket = m[1];
      const key = u.pathname.replace(/^\//, '');
      if (bucket && key) return { bucket, key };
    }
    // Generic path-style fallback for custom CDN/base: https://<host>/<bucket>/<key>
    const parts = u.pathname.replace(/^\//, '').split('/');
    if (parts.length >= 2) {
      const bucket = parts.shift() as string;
      const key = parts.join('/');
      if (bucket && key) return { bucket, key };
    }
  } catch {}
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
  const tenantId = await getCurrentTenantId(req);
  const isDev = process.env.NODE_ENV !== 'production';
  if (!tenantId && !isDev) return new NextResponse('Unauthorized', { status: 401 });
  const file = await prisma.file.findUnique({ where: { id: params.id } });
  if (!file) return new NextResponse('Not found', { status: 404 });
  if (!isDev && file.tenantId !== tenantId) return new NextResponse('Not found', { status: 404 });

    const contentType = file.mime || 'application/octet-stream';
  const bucket = process.env.GCS_BUCKET;
  const publicBase = process.env.GCS_PUBLIC_BASE_URL;
    const asAttachment = (() => {
      const q = req.nextUrl.searchParams.get('download');
      return q === '1' || q === 'true' || q === 'yes';
    })();
    const safeFileName = (file.name || 'download').replace(/[\r\n";]/g, '_');
    const baseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=60',
    };
    if (asAttachment) baseHeaders['Content-Disposition'] = `attachment; filename="${safeFileName}"`;

  // Serve local files (dev allows any tenant; prod requires tenant check above)
  if (file.path?.startsWith(`/uploads/`)) {
      const abs = path.join(process.cwd(), 'public', file.path);
  const buf = await fs.readFile(abs);
  return new NextResponse(new Uint8Array(buf), { status: 200, headers: baseHeaders });
    }

    // Serve from GCS (private) by proxying
    if (file.path) {
      // Prefer using configured bucket/key mapping
      if (bucket) {
        const key = parseGcsKeyFromUrlOrPath(file.path, bucket, publicBase || undefined);
        if (key) {
          const storage = getGcs();
          const [buf] = await storage.bucket(bucket).file(key).download();
          return new NextResponse(new Uint8Array(buf), { status: 200, headers: baseHeaders });
        }
      }
      // If bucket env isn't set or key couldn't be parsed, try deriving bucket+key from URL
      if (file.path.startsWith('http')) {
        const parsed = parseGcsBucketAndKeyFromUrl(file.path);
        if (parsed) {
          const storage = getGcs();
          const [buf] = await storage.bucket(parsed.bucket).file(parsed.key).download();
          return new NextResponse(new Uint8Array(buf), { status: 200, headers: baseHeaders });
        }
      }
    }

    // Fallback: if URL remains but not parseable, refuse to fetch anonymously to avoid leaking access errors
    if (file.path?.startsWith('http')) {
      return new NextResponse('Unsupported external URL for proxy', { status: 400 });
    }

    return new NextResponse('File path not recognized', { status: 400 });
  } catch (e: any) {
    return new NextResponse(e.message || 'Error', { status: 500 });
  }
}
