import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import { getGcs, parseGcsKeyFromUrlOrPath, gcsGetSignedUrl } from '@/lib/gcs';
import { startMapwareJob } from '@/lib/providers/mapware';

// Starts a hosted photogrammetry processing job by creating a ProcessingJob and
// preparing a list of image URLs (signed if GCS) to send to an external provider (placeholder).

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const mission = await prisma.droneMission.findFirst({ where: { id: params.id, tenantId } });
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });

    // Read provider from form or JSON body; default to HOSTED
    let provider = 'HOSTED';
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        const body = await req.json();
        if (body?.provider) provider = String(body.provider).toUpperCase();
      } catch {}
    } else if (ct.includes('form')) {
      const form = await req.formData();
      const p = form.get('provider');
      if (p) provider = String(p).toUpperCase();
    }

    const photos = await prisma.file.findMany({ where: { tenantId, missionId: mission.id, category: 'photos' }, orderBy: { createdAt: 'asc' } });
    if (photos.length < 5) return NextResponse.json({ error: 'Need at least 5 photos for processing' }, { status: 400 });

    const bucket = process.env.GCS_BUCKET || '';
    const base = process.env.GCS_PUBLIC_BASE_URL || '';

    const inputs: string[] = [];
    for (const p of photos) {
      if (bucket) {
        const key = parseGcsKeyFromUrlOrPath(p.path, bucket, base);
        if (!key) continue;
        const url = await gcsGetSignedUrl(bucket, key, 60 * 60); // 1h
        inputs.push(url);
      } else {
        // Local file URL; provider would need direct upload; for now serve absolute URL via app
        const origin = process.env.PUBLIC_BASE_URL || '';
        inputs.push(`${origin}/api/files/${p.id}`);
      }
    }

    const job = await prisma.processingJob.create({
      data: {
        tenantId,
        missionId: mission.id,
        provider,
        status: 'QUEUED',
        inputJson: JSON.stringify({ images: inputs }),
      }
    });

  // If Pix4D requested, ensure configuration is present and prepare callout
    if (provider === 'PIX4D') {
      const pixApiKey = process.env.PIX4D_API_KEY || process.env.PIX4D_LICENSE_KEY; // allow either env name
      const pixBase = process.env.PIX4D_API_BASE || '';
      const callbackUrl = `${process.env.PUBLIC_BASE_URL || ''}/api/processing-jobs/${job.id}/webhook`;
      if (!pixApiKey) {
        return NextResponse.json({
          job,
          warning: 'PIX4D not configured. Set PIX4D_API_KEY (or PIX4D_LICENSE_KEY) in env to enable real submission.',
        }, { status: 201 });
      }
      // NOTE: Implement Pix4D API submission here when API details are available.
      // Example shape (pseudo): await fetch(`${pixBase}/projects`, { headers: { Authorization: `Bearer ${pixApiKey}` }, method: 'POST', body: JSON.stringify({ images: inputs, callbackUrl }) })
    }
    // If Mapware requested, ensure configuration is present and prepare callout
    if (provider === 'MAPWARE') {
      const mwApiKey = process.env.MAPWARE_API_KEY;
      const mwBase = process.env.MAPWARE_API_BASE || '';
      const callbackUrl = `${process.env.PUBLIC_BASE_URL || ''}/api/processing-jobs/${job.id}/webhook`;
      if (!mwApiKey) {
        return NextResponse.json({ job, warning: 'MAPWARE not configured. Set MAPWARE_API_KEY in env.' }, { status: 201 });
      }
      try {
        const { externalJobId } = await startMapwareJob({
          images: inputs,
          callbackUrl,
          projectName: mission.title || `Mission ${mission.id}`,
          apiKey: mwApiKey,
          apiBase: mwBase || undefined,
        });
        const updated = await prisma.processingJob.update({
          where: { id: job.id },
          data: { status: 'RUNNING', providerJobId: externalJobId, outputJson: job.outputJson },
        });
        return NextResponse.json({ job: updated, submitted: true, externalJobId }, { status: 201 });
      } catch (err: any) {
        const updated = await prisma.processingJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', errorMsg: String(err?.message || err) },
        });
        return NextResponse.json({ job: updated, error: 'Failed to submit to Mapware' }, { status: 500 });
      }
    }

    return NextResponse.json({ job }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
