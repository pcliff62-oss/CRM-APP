import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import crypto from 'crypto';
import { getCurrentTenantId } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// List versions or create a new version snapshot
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    // Fetch the measurement to determine scope (contact -> property -> measurement)
    const m = await prisma.measurement.findUnique({ where: { id } });
    if (!m) return new NextResponse(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    // Try contact-level scoping first (customer contact card)
    let versions: any[] = [];
    const prop = m.propertyId ? await prisma.property.findUnique({ where: { id: m.propertyId } }) : null;
    const hasDelegate = (prisma as any).measurementVersion && typeof (prisma as any).measurementVersion.findMany === 'function';
    if (prop?.contactId) {
      if (hasDelegate) {
        versions = await (prisma as any).measurementVersion.findMany({
          where: { measurement: { tenantId: m.tenantId, property: { contactId: prop.contactId } } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, createdAt: true },
        });
      } else {
        versions = await prisma.$queryRawUnsafe(
          `SELECT mv.id as id, mv.name as name, mv.createdAt as createdAt
           FROM MeasurementVersion mv
           JOIN Measurement mm ON mv.measurementId = mm.id
           JOIN Property p ON mm.propertyId = p.id
           WHERE p.contactId = ? AND mm.tenantId = ?
           ORDER BY mv.createdAt DESC`,
           prop.contactId, m.tenantId
        );
      }
    } else if (m.propertyId) {
      if (hasDelegate) {
        versions = await (prisma as any).measurementVersion.findMany({
          where: { measurement: { tenantId: m.tenantId, propertyId: m.propertyId } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, createdAt: true },
        });
      } else {
        versions = await prisma.$queryRawUnsafe(
          `SELECT mv.id as id, mv.name as name, mv.createdAt as createdAt
           FROM MeasurementVersion mv
           JOIN Measurement mm ON mv.measurementId = mm.id
           WHERE mm.propertyId = ? AND mm.tenantId = ?
           ORDER BY mv.createdAt DESC`,
           m.propertyId, m.tenantId
        );
      }
    } else {
      if (hasDelegate) {
        versions = await (prisma as any).measurementVersion.findMany({
          where: { measurementId: id },
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, createdAt: true },
        });
      } else {
        versions = await prisma.$queryRawUnsafe(
          `SELECT mv.id as id, mv.name as name, mv.createdAt as createdAt
           FROM MeasurementVersion mv
           WHERE mv.measurementId = ?
           ORDER BY mv.createdAt DESC`,
           id
        );
      }
    }
    return new NextResponse(JSON.stringify({ versions }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (e:any) {
  return new NextResponse(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
  let tenantId: string | null = null;
  try { tenantId = await getCurrentTenantId(req); } catch {}
  const id = params?.id;
    if (!id) {
      return new NextResponse(JSON.stringify({ error: 'measurement id missing' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    const body = await req.json();
    const { features, angleDeg, name } = body || {};
    if (!Array.isArray(features)) return new NextResponse(JSON.stringify({ error: 'features required (array)' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (features.length > 0 && typeof features[0] !== 'object') return new NextResponse(JSON.stringify({ error: 'features items must be objects' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const m = await prisma.measurement.findUnique({ where: { id } });
  if (!m) return new NextResponse(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  // Always use the measurement's tenant to avoid auth-context mismatches
  tenantId = m.tenantId;
    const payload = { features, angleDeg: typeof angleDeg === 'number' ? angleDeg : undefined };
    const hasDelegate = (prisma as any).measurementVersion && typeof (prisma as any).measurementVersion.create === 'function';
    if (hasDelegate) {
      const rec = await (prisma as any).measurementVersion.create({
        data: {
          tenantId: tenantId!,
          measurementId: id,
          name: (typeof name === 'string' && name.trim()) ? name.trim() : null,
          payloadJson: JSON.stringify(payload),
        }
      });
      return new NextResponse(JSON.stringify({ ok: true, id: rec.id, createdAt: rec.createdAt }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    } else {
      const genId = 'mv_' + crypto.randomUUID();
      const createdAt = new Date().toISOString();
      await prisma.$executeRawUnsafe(
        `INSERT INTO MeasurementVersion (id, tenantId, measurementId, name, payloadJson, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
         genId, tenantId!, id, ((typeof name === 'string' && name.trim()) ? name.trim() : null), JSON.stringify(payload), createdAt
      );
      return new NextResponse(JSON.stringify({ ok: true, id: genId, createdAt }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
  } catch (e:any) {
    return new NextResponse(JSON.stringify({ error: e.message || 'unknown error' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
}
