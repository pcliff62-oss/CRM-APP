import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Provider calls this to update job status and outputs. In a real setup you would verify a secret.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    // Normalize common provider payloads to our schema
    // Supported fields (any optional):
    // - status: QUEUED|RUNNING|COMPLETE|FAILED
    // - output: { orthomosaicUrl?: string, ... }
    // - error: string
    // Mapware-like fallbacks: state, results, message
    const normStatus = body.status || body.state || undefined;
    const normError = body.error || body.message || undefined;
    const normOutput = body.output || body.results || body.data || undefined;

    const job = await prisma.processingJob.update({
      where: { id: params.id },
      data: {
        status: normStatus,
        outputJson: normOutput ? JSON.stringify(normOutput) : undefined,
        errorMsg: normError,
      }
    });
    return NextResponse.json(job);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
