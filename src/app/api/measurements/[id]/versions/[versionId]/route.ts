import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string; versionId: string } }) {
  try {
    const { id, versionId } = params;
    // Fetch current measurement to determine contact/property scope
    const m = await prisma.measurement.findUnique({ where: { id } });
    if (!m) return new NextResponse(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    const prop = m.propertyId ? await prisma.property.findUnique({ where: { id: m.propertyId } }) : null;
    let rec: any;
    const hasDelegate = (prisma as any).measurementVersion && typeof (prisma as any).measurementVersion.findFirst === 'function';
    if (prop?.contactId) {
      if (hasDelegate) {
        rec = await (prisma as any).measurementVersion.findFirst({ where: { id: versionId, measurement: { tenantId: m.tenantId, property: { contactId: prop.contactId } } } });
      } else {
        const rows: any = await prisma.$queryRawUnsafe(
          `SELECT mv.* FROM MeasurementVersion mv
           JOIN Measurement mm ON mv.measurementId = mm.id
           JOIN Property p ON mm.propertyId = p.id
           WHERE mv.id = ? AND p.contactId = ? AND mm.tenantId = ?
           LIMIT 1`, versionId, prop.contactId, m.tenantId
        );
        rec = rows?.[0] || null;
      }
    } else if (m.propertyId) {
      if (hasDelegate) {
        rec = await (prisma as any).measurementVersion.findFirst({ where: { id: versionId, measurement: { tenantId: m.tenantId, propertyId: m.propertyId } } });
      } else {
        const rows: any = await prisma.$queryRawUnsafe(
          `SELECT mv.* FROM MeasurementVersion mv
           JOIN Measurement mm ON mv.measurementId = mm.id
           WHERE mv.id = ? AND mm.propertyId = ? AND mm.tenantId = ?
           LIMIT 1`, versionId, m.propertyId, m.tenantId
        );
        rec = rows?.[0] || null;
      }
    } else {
      if (hasDelegate) {
        rec = await (prisma as any).measurementVersion.findFirst({ where: { id: versionId, measurementId: id } });
      } else {
        const rows: any = await prisma.$queryRawUnsafe(
          `SELECT * FROM MeasurementVersion WHERE id = ? AND measurementId = ? LIMIT 1`, versionId, id
        );
        rec = rows?.[0] || null;
      }
    }
  if (!rec) return new NextResponse(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  return new NextResponse(JSON.stringify({ id: rec.id, measurementId: rec.measurementId, name: rec.name, createdAt: rec.createdAt, payload: JSON.parse(rec.payloadJson || '{}') }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (e:any) {
  return new NextResponse(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
}
