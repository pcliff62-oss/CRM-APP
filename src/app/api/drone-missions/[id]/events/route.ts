import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';

const VALID_TYPES = new Set(['START','PAUSE','RESUME','ABORT','COMPLETE','ERROR','RTH']);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const missionId = params.id;
    const mission = await prisma.droneMission.findFirst({ where: { id: missionId, tenantId }, select: { id: true, status: true } });
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });

    const body = await req.json();
    const type: string = body.type;
    if (!VALID_TYPES.has(type)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    const meta = body.meta ? JSON.stringify(body.meta) : null;
    const ts = body.ts ? new Date(body.ts) : new Date();

    const event = await prisma.missionEvent.create({ data: { missionId, type, ts, meta } });

    // Update mission status for specific events
    if (type === 'START') await prisma.droneMission.update({ where: { id: missionId }, data: { status: 'IN_PROGRESS' } });
    if (type === 'COMPLETE') await prisma.droneMission.update({ where: { id: missionId }, data: { status: 'COMPLETE' } });
    if (type === 'ABORT' || type === 'ERROR') await prisma.droneMission.update({ where: { id: missionId }, data: { status: type === 'ABORT' ? 'FAILED' : 'FAILED' } });

    return NextResponse.json({ event });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
