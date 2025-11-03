import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const form = await req.formData();
    const file = form.get('file') as any as File | null;
    const leadId = (form.get('leadId') as string) || null;
    const propertyId = (form.get('propertyId') as string) || null;
    const defaultPitch = Number(form.get('defaultPitch') || 6);
    if (!file) return NextResponse.json({ error: 'missing file' }, { status: 400 });

  // Persist the original photo under tenant uploads for later manual correction
  const arrayBuffer = await (file as any).arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', tenantId);
  await fs.mkdir(uploadDir, { recursive: true });
  const origName = (file as any).name || `photo_${Date.now()}.jpg`;
  const origPathFs = path.join(uploadDir, `naive_src_${Date.now()}_${origName}`);
  await fs.writeFile(origPathFs, new Uint8Array(buffer));
  const sourceImagePath = `/uploads/${tenantId}/${path.basename(origPathFs)}`;

  const base = process.env.AI_WORKER_URL || 'http://127.0.0.1:8089';
  const aiUrl = base.match(/\/(measure|stitch)\/?$/) ? base.replace(/\/$/, '') : `${base.replace(/\/$/, '')}/measure`;
  const fd = new FormData();
  // Use File for correct multipart in Node/Next runtime; ensure plain ArrayBuffer
  const tmp = new Uint8Array(buffer.byteLength);
  tmp.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  fd.append('file', new File([tmp.buffer], origName, { type: (file as any).type || 'image/jpeg' }) as any);
    // forward to worker
    const res = await fetch(aiUrl, { method: 'POST', body: fd as any });
    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ error: 'AI worker error', details: txt }, { status: 502 });
    }
    const data = await res.json();

    // Persist overlay image if present
    let overlayPath: string | null = null;
    const overlayB64 = data?.overlay as string | undefined;
    if (overlayB64 && overlayB64.startsWith('data:image/png;base64,')) {
      const b64 = overlayB64.split(',')[1];
      const buf = Buffer.from(b64, 'base64');
      const destDir = path.join(process.cwd(), 'public', 'uploads', tenantId);
      await fs.mkdir(destDir, { recursive: true });
      const filename = `naive_overlay_${Date.now()}.png`;
      const dest = path.join(destDir, filename);
  await fs.writeFile(dest, new Uint8Array(buf));
      overlayPath = `/uploads/${tenantId}/${filename}`;
    }

  // Persist Measurement (geojson: simple FeatureCollection of polygons with plane props)
    const planes = (data?.planes as any[]) || [];
    const features = planes.map(p => ({
      type: 'Feature',
      properties: { id: p.id, pitch: p.pitch, planAreaFt2: p.planAreaFt2, surfaceAreaFt2: p.surfaceAreaFt2, edges: p.edges || [] },
      geometry: {
        type: 'Polygon',
        coordinates: [ (p.polygon || []).map((xy: number[]) => [xy[0], xy[1]]) ] // image pixel coords as a local frame
      }
    }));
    const fc = { type: 'FeatureCollection', features };

  const measurement = await prisma.measurement.create({
      data: {
        tenantId,
        leadId,
        propertyId,
        geojson: JSON.stringify(fc),
    sourceImagePath,
    gsdMPerPx: typeof data?.gsd_m_per_px === 'number' ? data.gsd_m_per_px : null,
        totalSquares: data?.totals?.surfaceAreaFt2 ? (data.totals.surfaceAreaFt2 / 100.0) : null,
        totalPerimeterFt: data?.totals?.perimeterFt || null,
        notes: overlayPath ? `Overlay: ${overlayPath}` : undefined,
      }
    });

  return NextResponse.json({ measurement, overlayPath, worker: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
