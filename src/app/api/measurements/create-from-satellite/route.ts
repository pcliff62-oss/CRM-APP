import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';

export const runtime = 'nodejs';

async function geocodeAddress(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const loc = j?.results?.[0]?.geometry?.location;
    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') return { lat: loc.lat, lng: loc.lng };
    return null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { leadId, address } = body as { leadId?: string; address?: string };
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Missing GOOGLE_MAPS_API_KEY/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY' }, { status: 400 });

    let latlng: { lat: number; lng: number } | null = null;
    let propertyId: string | null = null;
    if (leadId) {
      const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId }, include: { property: true } });
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      if (lead.property?.lat != null && lead.property?.lng != null) {
        latlng = { lat: lead.property.lat!, lng: lead.property.lng! };
        propertyId = lead.property.id;
      } else if (lead.property?.address1) {
        latlng = await geocodeAddress(
          [lead.property.address1, lead.property.city, [lead.property.state, lead.property.postal].filter(Boolean).join(' ')].filter(Boolean).join(', '),
          apiKey
        );
        propertyId = lead.property.id;
      }
    } else if (address) {
      latlng = await geocodeAddress(address, apiKey);
    }
    if (!latlng) return NextResponse.json({ error: 'No coordinates available' }, { status: 400 });

    const size = '1024x1024';
    const scale = 2;
    const zoom = 20;
    const maptype = 'satellite';
    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${latlng.lat},${latlng.lng}&zoom=${zoom}&size=${size}&scale=${scale}&maptype=${maptype}&key=${apiKey}`;

    // Try to fetch Google Static Maps; if network fails or blocked, fall back to a generated placeholder
    let buf: Buffer;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        const txt = await resp.text().catch(()=> '');
        // Attempt graceful fallback instead of hard error
        buf = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: { r: 232, g: 232, b: 232 } } })
          .jpeg({ quality: 85 })
          .toBuffer();
      } else {
        const ab = await resp.arrayBuffer();
        buf = Buffer.from(ab);
      }
    } catch (err) {
      // Network or DNS failure - produce a blank image so the editor can still open
      buf = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: { r: 232, g: 232, b: 232 } } })
        .jpeg({ quality: 85 })
        .toBuffer();
    }

    const dir = path.join(process.cwd(), 'public', 'uploads', tenantId, 'measurements');
    await fs.mkdir(dir, { recursive: true });
    const filename = `satellite_${Date.now()}.jpg`;
    const abs = path.join(dir, filename);
    await fs.writeFile(abs, new Uint8Array(buf));
    const publicUrl = `/uploads/${tenantId}/measurements/${filename}`;

    const metersPerPixel = (Math.cos(latlng.lat * Math.PI/180) * 156543.03392) / (Math.pow(2, zoom) * scale);
    // Build address snapshot fallback (if no property relation will supply later)
    let addressSnapshot: string | undefined = undefined;
    if (propertyId) {
      try {
        const prop = await prisma.property.findUnique({ where: { id: propertyId } });
        if (prop) {
          const line1 = [prop.address1, prop.address2].filter(Boolean).join(' ').trim();
          const cityStatePostal = [prop.city, [prop.state, prop.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ');
          addressSnapshot = [line1, cityStatePostal].filter(Boolean).join(', ');
        }
      } catch {}
    } else if (address) {
      // Raw address provided directly
      addressSnapshot = address.trim();
    }

    const m = await prisma.measurement.create({
      data: {
        tenantId,
        leadId: leadId || null,
        propertyId,
        addressSnapshot,
        geojson: JSON.stringify({ type: 'FeatureCollection', features: [] }),
        sourceImagePath: publicUrl,
        gsdMPerPx: metersPerPixel,
        notes: 'Created from Google Static Maps (satellite)'
      }
    });

  return NextResponse.json({ measurementId: m.id, sourceImagePath: publicUrl, gsdMPerPx: metersPerPixel });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error' }, { status: 500 });
  }
}
