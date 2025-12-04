import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantId } from '@/lib/auth';
import prisma from '@/lib/db';

// Simple proxy wrapper to reuse client weather module logic server-side without duplicating fetch code
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
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min,weathercode&forecast_days=10&timezone=auto&temperature_unit=fahrenheit`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json().catch(()=>null);
}

export async function GET(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { postal: true } });
  const zip = tenant?.postal || '';
  if (!zip) return NextResponse.json({ ok:true, postal:'', items: [] });
  const loc = await geocodeZip(zip);
  if (!loc) return NextResponse.json({ ok:true, postal: zip, items: [] });
  const data = await fetchForecast(loc.lat, loc.lon);
  const days: string[] = data?.daily?.time || [];
  const precip: number[] = data?.daily?.precipitation_probability_max || [];
  const tmax: number[] = data?.daily?.temperature_2m_max || [];
  const tmin: number[] = data?.daily?.temperature_2m_min || [];
  const codes: number[] = data?.daily?.weathercode || [];
  const items = days.map((d, i) => ({
    date: d,
    precipProb: Number(precip[i] ?? 0),
    tempMax: isFinite(Number(tmax[i])) ? Number(tmax[i]) : null,
    tempMin: isFinite(Number(tmin[i])) ? Number(tmin[i]) : null,
    code: isFinite(Number(codes[i])) ? Number(codes[i]) : null,
  }));
  return NextResponse.json({ ok:true, postal: zip, items });
}
