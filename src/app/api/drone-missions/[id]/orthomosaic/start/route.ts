import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import path from 'path';
import { promises as fs } from 'fs';
import { getGcs } from '@/lib/gcs';

export const runtime = 'nodejs';

async function loadFileBuffer(file: { id: string; path: string | null; mime: string | null }, tenantId: string): Promise<Buffer | null> {
  const p = file.path || '';
  try {
    // Local public uploads
    if (p.startsWith(`/uploads/${tenantId}/`)) {
      const abs = path.join(process.cwd(), 'public', p);
      return await fs.readFile(abs);
    }
    // GCS (private) via direct SDK
    const bucket = process.env.GCS_BUCKET;
    const publicBase = process.env.GCS_PUBLIC_BASE_URL;
    if (bucket) {
      const marker = `/${bucket}/`;
      let key: string | null = null;
      if (p.includes(marker)) key = p.split(marker)[1];
      if (!key && publicBase && p.startsWith(publicBase)) key = p.substring(publicBase.replace(/\/$/, '').length + 1);
      if (key) {
        const storage = getGcs();
  const [buf] = await storage.bucket(bucket).file(key).download();
  // buf is already a Node Buffer
  return buf as unknown as Buffer;
      }
    }
    // Public absolute URL fallback
    if (p.startsWith('http')) {
      const r = await fetch(p);
      if (!r.ok) return null;
      const ab = await r.arrayBuffer();
      return Buffer.from(ab);
    }
  } catch {}
  return null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const mission = await prisma.droneMission.findFirst({ where: { id: params.id, tenantId } });
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });

    // Create job record in RUNNING
    const job = await prisma.processingJob.create({
      data: {
        tenantId,
        missionId: mission.id,
        provider: 'LOCAL-MOSAIC',
        status: 'RUNNING',
        inputJson: JSON.stringify({ type: 'ORTHOMOSAIC', missionId: mission.id }),
      }
    });

    // Load mission photos
    const photos = await prisma.file.findMany({ where: { missionId: mission.id, category: 'photos' }, orderBy: { createdAt: 'asc' } });
    if (!photos.length) {
      await prisma.processingJob.update({ where: { id: job.id }, data: { status: 'FAILED', errorMsg: 'No mission photos found' } });
      return NextResponse.json({ error: 'No photos' }, { status: 400 });
    }

  // Load buffers and build simple grid collage (square tiles)
    const tile = 512; const gap = 8;
    const bufs: Buffer[] = [];
    for (const f of photos) {
      const b = await loadFileBuffer(f, tenantId);
      if (b) bufs.push(b);
    }
    if (!bufs.length) {
      await prisma.processingJob.update({ where: { id: job.id }, data: { status: 'FAILED', errorMsg: 'Unable to load photo buffers' } });
      return NextResponse.json({ error: 'Load failed' }, { status: 400 });
    }

    // Try AI worker orthomosaic stitch first
  let outBuf: Buffer | null = null;
  let mode: 'stitched' | 'grid' = 'grid';
  let stitchErr: string | null = null;
    try {
      const form = new FormData();
      bufs.forEach((b, i) => {
        // Ensure a clean ArrayBuffer and use File for proper multipart encoding
        const tmp = new Uint8Array(b.byteLength);
        tmp.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
        const filePart = new File([tmp.buffer], `img_${i}.jpg`, { type: 'image/jpeg' });
        form.append('files', filePart);
      });
      const base = (process.env.AI_WORKER_URL || 'http://127.0.0.1:8089').replace(/\/$/, '');
      let workerUrl = base;
      if (base.endsWith('/stitch')) {
        workerUrl = base;
      } else if (base.endsWith('/measure')) {
        workerUrl = base.replace(/\/measure$/, '/stitch');
      } else {
        workerUrl = `${base}/stitch`;
      }
      const resp = await fetch(workerUrl, { method: 'POST', body: form as any });
      if (resp.ok) {
        const j = await resp.json();
        const imgB64 = j?.image as string | undefined;
        if (imgB64?.startsWith('data:image/')) {
          const base64 = imgB64.split(',')[1];
          outBuf = Buffer.from(base64, 'base64');
          mode = 'stitched';
        } else {
          stitchErr = 'Worker returned no image';
        }
      } else {
        const txt = await resp.text().catch(() => '');
        stitchErr = `Worker HTTP ${resp.status}${txt ? `: ${txt.substring(0, 160)}` : ''}`;
      }
    } catch (e) {
      stitchErr = (e as any)?.message || 'stitch error';
    }

    // Fallback to simple grid collage if stitching fails
  if (!outBuf) {
      const sharpMod = await import('sharp');
      const sharp: any = (sharpMod as any).default || sharpMod;
  const tiles: Buffer[] = await Promise.all(bufs.map(async (b) => {
        try {
          return await sharp(b).rotate().resize(tile, tile, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
        } catch { return await sharp({ create: { width: tile, height: tile, channels: 3, background: '#cccccc' } }).jpeg().toBuffer(); }
      }));
      const n = tiles.length;
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const width = cols * tile + (cols - 1) * gap;
      const height = rows * tile + (rows - 1) * gap;
  const composite: any[] = [];
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        composite.push({ input: tiles[i], top: r * (tile + gap), left: c * (tile + gap) });
      }
  const canvas = sharp({ create: { width, height, channels: 3, background: '#ffffff' } });
  outBuf = await canvas.composite(composite).jpeg({ quality: 85 }).toBuffer();
  mode = 'grid';
    }

    // Persist mosaic to public uploads
    const dir = path.join(process.cwd(), 'public', 'uploads', tenantId, 'missions', mission.id);
    await fs.mkdir(dir, { recursive: true });
    const filename = `mosaic_${Date.now()}.jpg`;
    const abs = path.join(dir, filename);
    if (!outBuf) {
      await prisma.processingJob.update({ where: { id: job.id }, data: { status: 'FAILED', errorMsg: 'Orthomosaic output empty' } });
      return NextResponse.json({ error: 'Stitching failed' }, { status: 500 });
    }
  // fs.writeFile prefers Node ArrayBufferView; wrap in Uint8Array
  await fs.writeFile(abs, new Uint8Array(outBuf));
    const publicUrl = `/uploads/${tenantId}/missions/${mission.id}/${filename}`;

  await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETE',
    outputJson: JSON.stringify({ orthomosaicUrl: publicUrl, mode, stitchErr })
      }
    });

    return NextResponse.json({ jobId: job.id, orthomosaicUrl: publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error' }, { status: 500 });
  }
}
