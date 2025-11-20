import { NextResponse } from 'next/server';

export async function GET() {
  let worker = process.env.AI_WORKER_URL || '';
  // Normalize env to base worker URL (not /measure)
  worker = worker.replace(/\/?measure\/?$/, '').replace(/\/$/, '');
  if (!worker) return NextResponse.json({ ok: false, error: 'AI_WORKER_URL not configured' }, { status: 500 });
  try {
    const res = await fetch(worker + '/health', { cache: 'no-store' });
    const j = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok && (j?.ok === true || j?.status === 'ok'), worker, raw: j }, { status: res.ok ? 200 : 502 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, worker, error: e?.message || 'fetch failed' }, { status: 503 });
  }
}
