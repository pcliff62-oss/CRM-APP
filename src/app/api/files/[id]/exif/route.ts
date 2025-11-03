import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';
import * as exifr from 'exifr';
import { getGcs } from '@/lib/gcs';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const file = await prisma.file.findUnique({ where: { id: params.id } });
    if (!file || file.tenantId !== tenantId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let buf: Buffer | null = null;
    if (file.path?.startsWith(`/uploads/${tenantId}/`)) {
      const abs = path.join(process.cwd(), 'public', file.path);
      buf = await fs.readFile(abs);
    } else if (process.env.GCS_BUCKET) {
      const bucket = process.env.GCS_BUCKET!;
      const publicBase = process.env.GCS_PUBLIC_BASE_URL || '';
      let key: string | null = null;
      const marker = `/${bucket}/`;
      if (file.path?.includes(marker)) key = file.path.split(marker)[1];
      else if (publicBase && file.path?.startsWith(publicBase)) key = file.path.substring(publicBase.replace(/\/$/, '').length + 1);
      if (!key) return NextResponse.json({ error: 'Unrecognized GCS path' }, { status: 400 });
      const [data] = await getGcs().bucket(bucket).file(key).download();
      buf = data as Buffer;
    } else if (file.path?.startsWith('http')) {
      const resp = await fetch(file.path);
      if (!resp.ok) return NextResponse.json({ error: 'Upstream error' }, { status: 502 });
      buf = Buffer.from(await resp.arrayBuffer());
    }
    if (!buf) return NextResponse.json({ error: 'File not readable' }, { status: 400 });

    const meta: any = await exifr.parse(buf, { gps: true, tiff: true, exif: true });
    const exif = {
      Make: meta?.Make,
      Model: meta?.Model,
      CreateDate: meta?.CreateDate?.toISOString?.() || meta?.DateTimeOriginal?.toISOString?.(),
      GPSLatitude: meta?.latitude,
      GPSLongitude: meta?.longitude,
      GPSAltitude: meta?.GPSAltitude || meta?.altitude,
      Orientation: meta?.Orientation,
      FocalLength: meta?.FocalLength,
      ExposureTime: meta?.ExposureTime,
      ISOSpeedRatings: meta?.ISO || meta?.ISOSpeedRatings,
      ImageWidth: meta?.ImageWidth,
      ImageHeight: meta?.ImageHeight,
    };
    return NextResponse.json({ id: file.id, exif });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
