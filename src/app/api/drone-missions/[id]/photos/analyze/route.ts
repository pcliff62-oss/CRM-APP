import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';
import * as exifr from 'exifr';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const missionId = params.id;
    const mission = await prisma.droneMission.findFirst({ where: { id: missionId, tenantId } });
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });

    const photos = await prisma.file.findMany({
      where: { tenantId, missionId, category: 'photos' },
      orderBy: { createdAt: 'asc' },
    });

    const results: any[] = [];
    for (const p of photos) {
      try {
        const rel = p.path.startsWith('/') ? p.path.slice(1) : p.path;
        const fullPath = path.join(process.cwd(), 'public', rel);
        const buf = await fs.readFile(fullPath);
        const exif: any = await exifr.parse(buf, { gps: true, tiff: true, exif: true });
        results.push({
          id: p.id,
          name: p.name,
          size: p.size,
          mime: p.mime,
          path: `/api/files/${p.id}`,
          exif: {
            Make: exif?.Make,
            Model: exif?.Model,
            CreateDate: exif?.CreateDate?.toISOString?.() || exif?.DateTimeOriginal?.toISOString?.(),
            GPSLatitude: exif?.latitude,
            GPSLongitude: exif?.longitude,
            GPSAltitude: exif?.GPSAltitude || exif?.altitude,
            Orientation: exif?.Orientation,
            FocalLength: exif?.FocalLength,
            ExposureTime: exif?.ExposureTime,
            ISOSpeedRatings: exif?.ISO || exif?.ISOSpeedRatings,
          }
        });
      } catch (err: any) {
        results.push({ id: p.id, name: p.name, error: err.message });
      }
    }

    return NextResponse.json({ count: photos.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
