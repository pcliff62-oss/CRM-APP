import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// POST /api/measurements/:id/ai-feedback
// Body: { feedback: [{ aiFeatureId, geometryChanged, edgeDiff: [...], updatedFeature: Feature }] }
// Persist corrections for later training. MVP stores in memory (replace with DB).

// Simple in-memory store (dev only). Replace with DB table.
const FEEDBACK_STORE: any[] = [];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const measurementId = params.id;
  try {
    const { feedback } = await req.json();
    if (!Array.isArray(feedback) || feedback.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }
  const m = await prisma.measurement.findUnique({ where: { id: measurementId } });
  const sourceImagePath = m?.sourceImagePath || null;
  const records = feedback.map(f => ({ measurementId, ts: Date.now(), ...f }));
  const entry: any = { measurementId, receivedAt: new Date().toISOString(), feedback };
  if (sourceImagePath) entry.sourceImagePath = sourceImagePath;
    FEEDBACK_STORE.push(entry);
    // Forward to worker if configured
    let worker = process.env.AI_WORKER_URL;
    if (worker) {
      worker = worker.replace(/\/?measure\/?$/, '').replace(/\/$/, '');
      try {
        await fetch(worker + '/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
      } catch {}
    }
    return NextResponse.json({ ok: true, count: records.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'error' }, { status: 500 });
  }
}

export async function GET() {
  // Debug endpoint to view collected feedback (not for production)
  return NextResponse.json({ feedback: FEEDBACK_STORE });
}
