import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantId } from '@/lib/auth';
import prisma from '@/lib/db';
import { autoShiftJobs } from '@/lib/autoShiftJobs';

async function geocodeZip(zip: string): Promise<{ lat: number; lon: number } | null> {
  if (!zip) return null;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
    if (!res.ok) return null;
    const data = await res.json().catch(()=>null);
    const place = Array.isArray(data?.places) ? data.places[0] : null;
    const lat = place ? Number(place.latitude) : NaN;
    const lon = place ? Number(place.longitude) : NaN;
    if (!isFinite(lat) || !isFinite(lon)) return null;
    return { lat, lon };
  } catch { return null; }
}
async function fetchForecast(lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_probability_max&forecast_days=10&timezone=auto&temperature_unit=fahrenheit`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json().catch(()=>null);
}

export async function POST(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { postal: true } });
  const zip = tenant?.postal || '';
  if (!zip) return NextResponse.json({ ok:false, error:'ZIP not set' }, { status:400 });
  const loc = await geocodeZip(zip);
  if (!loc) return NextResponse.json({ ok:false, error:'Geocode failed' }, { status:400 });
  const data = await fetchForecast(loc.lat, loc.lon);
  const days: string[] = data?.daily?.time || [];
  const precip: number[] = data?.daily?.precipitation_probability_max || [];
  const offset: number | undefined = typeof data?.utc_offset_seconds === 'number' ? data.utc_offset_seconds : undefined;
  const forecast = days.map((d,i)=> ({ date:d, precipProb: Number(precip[i]??0) }));
  const result = await autoShiftJobs(tenantId, forecast, 70, offset);
  return NextResponse.json({ ok:true, zip, ...result });
}
