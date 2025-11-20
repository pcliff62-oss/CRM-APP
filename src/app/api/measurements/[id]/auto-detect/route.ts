import { NextRequest, NextResponse } from 'next/server';

// POST /api/measurements/:id/auto-detect
// Body: { angleDeg?: number, imageSrc: string }
// Supports imageSrc as: data URL (base64) OR http/https URL accessible from server.
// For remote URLs, downloads bytes then forwards to worker /measure.
// Env: AI_WORKER_URL (e.g. http://localhost:8089)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const measurementId = params.id;
  try {
    const { angleDeg, imageSrc } = await req.json();
    if (!imageSrc || typeof imageSrc !== 'string') {
      return NextResponse.json({ error: 'imageSrc missing' }, { status: 400 });
    }
  let worker = process.env.AI_WORKER_URL;
    if (!worker) {
      return NextResponse.json({ error: 'AI_WORKER_URL not configured' }, { status: 500 });
    }
  // Normalize: remove any trailing '/measure' and slashes
  worker = worker.replace(/\/?measure\/?$/, '').replace(/\/$/, '');
    // Acquire image bytes
    let imgBytes: ArrayBuffer | null = null;
    if (imageSrc.startsWith('data:image')) {
      const b64 = imageSrc.substring(imageSrc.indexOf(',')+1);
      const bin = Buffer.from(b64, 'base64');
      const arr = new Uint8Array(bin); // ensure standard ArrayBuffer
      imgBytes = arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength);
    } else if (/^https?:\/\//i.test(imageSrc)) {
      const fetchRes = await fetch(imageSrc);
      if (!fetchRes.ok) {
        return NextResponse.json({ error: 'Failed to download image' }, { status: 502 });
      }
      const arrBuf = await fetchRes.arrayBuffer();
      imgBytes = arrBuf;
    } else {
      // Treat as relative or same-origin path
      try {
        const absUrl = new URL(imageSrc, req.nextUrl.origin).toString();
        const fetchRes = await fetch(absUrl, {
          headers: {
            // Forward cookies for protected routes
            cookie: req.headers.get('cookie') || ''
          }
        });
        if (!fetchRes.ok) {
          return NextResponse.json({ error: `Failed to fetch relative image (${fetchRes.status})` }, { status: 502 });
        }
        imgBytes = await fetchRes.arrayBuffer();
      } catch {
        return NextResponse.json({ error: 'Unsupported imageSrc format' }, { status: 400 });
      }
    }
    if (!imgBytes) return NextResponse.json({ error: 'Image bytes unavailable' }, { status: 400 });

  // Construct multipart form for worker /measure
    const form = new FormData();
    const blob = new Blob([imgBytes]);
    form.append('file', blob, 'roof.jpg');
    form.append('default_pitch_in12', '6');
  // Encourage multi-plane splitting by default
  form.append('split', 'aggressive');
    // Angle currently unused by worker but kept for future orientation normalization
    if (typeof angleDeg === 'number') form.append('angleDeg', String(angleDeg));

  const workerUrl = worker + '/measure';
    let res: Response;
    try {
      res = await fetch(workerUrl, { method: 'POST', body: form });
    } catch (e: any) {
      return NextResponse.json({ error: 'AI worker unreachable', workerUrl, detail: e?.message || 'fetch failed' }, { status: 503 });
    }
    if (!res.ok) {
      let err = 'Worker error';
      try { const j = await res.json(); if (j?.error) err = j.error; } catch {}
      return NextResponse.json({ error: err, workerUrl, status: res.status }, { status: 502 });
    }
  const data = await res.json();
    const planes = Array.isArray(data?.planes) ? data.planes : [];
    const features = planes.map((p: any, idx: number) => ({
      type: 'Feature',
      properties: {
        id: p.id || `AI${idx+1}`,
        pitch: typeof p.pitch === 'number' ? p.pitch : 6,
        edges: Array.isArray(p.edges) ? p.edges.map((e: any) => ({ i: e.i, type: (e.type || 'unknown') })) : [],
        source: 'ai'
      },
      geometry: { type: 'Polygon', coordinates: [Array.isArray(p.polygon) ? p.polygon.map((pt: any) => [pt[0], pt[1]]) : []] }
    }));
  const angleDegSuggested = typeof data?.angleDeg === 'number' ? data.angleDeg : undefined;
  return NextResponse.json({ features, raw: data, measurementId, angleDegSuggested });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'error' }, { status: 500 });
  }
}
