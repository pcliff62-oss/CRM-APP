import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const missionId = params.id;
    const mission = await prisma.droneMission.findFirst({ where: { id: missionId, tenantId }, select: { id: true } });
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });

    const form = await req.formData();
    const file = form.get('file') as unknown as File | null;
    if (!file) return NextResponse.json({ error: 'Missing file field' }, { status: 400 });
    const sequence = form.get('sequence');
    const checksum = form.get('checksum');

    const arrayBuffer = await (file as any).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', tenantId);
    await fs.mkdir(uploadDir, { recursive: true });
    const filename = `${Date.now()}_${sequence || 'seq'}_${(file as any).name || 'photo.jpg'}`;
    const destPath = path.join(uploadDir, filename);
  // Cast buffer to any to satisfy TS type expectations for writeFile across environments
  await fs.writeFile(destPath, buffer as any);
    const url = `/uploads/${tenantId}/${filename}`;

    const rec = await prisma.file.create({
      data: {
        tenantId,
        missionId,
        category: 'photos',
        folder: 'Mission Photos',
        name: filename,
        path: url,
        mime: (file as any).type || null,
        size: (file as any).size || null
      }
    });

    // Store event for photo receipt (optional)
    await prisma.missionEvent.create({ data: { missionId, type: 'PHOTO', meta: JSON.stringify({ fileId: rec.id, sequence, checksum }) } });

  // Prefer proxy path for display in the web app
  return NextResponse.json({ file: { ...rec, proxyPath: `/api/files/${rec.id}` } }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
