import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q');
  if (!q) return NextResponse.json({ error: 'missing_q' }, { status: 400 });
  try {
    // Simple OSM Nominatim request (unauthenticated) - usage should be rate limited in production
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'hytech-crm-demo/1.0' }
    });
    if (!resp.ok) return NextResponse.json({ error: 'nominatim_error', status: resp.status }, { status: 502 });
    const data = await resp.json();
    if (!Array.isArray(data) || !data.length) return NextResponse.json({ results: [] });
    const first = data[0];
    return NextResponse.json({ results: [{ lat: parseFloat(first.lat), lng: parseFloat(first.lon) }] });
  } catch (e: any) {
    return NextResponse.json({ error: 'server_error', message: e?.message }, { status: 500 });
  }
}