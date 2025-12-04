// Weather service utilities: zipcode -> forecast
// Uses open-meteo.com (no key) and zippopotam.us for geocoding
// Fallback: if geocode fails, returns empty array.

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  precipProb: number; // % chance of precipitation (rain)
  tempMax?: number;
  tempMin?: number;
  code?: number; // weather code
}

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

export async function fetch10DayForecast(zip: string): Promise<DailyForecast[]> {
  const loc = await geocodeZip(zip);
  if (!loc) return [];
  try {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min,weathercode&forecast_days=10&timezone=auto&temperature_unit=fahrenheit`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json().catch(()=>null);
    const days: string[] = data?.daily?.time || [];
    const precip: number[] = data?.daily?.precipitation_probability_max || [];
    const tmax: number[] = data?.daily?.temperature_2m_max || [];
    const tmin: number[] = data?.daily?.temperature_2m_min || [];
    const codes: number[] = data?.daily?.weathercode || [];
    return days.map((d, i) => ({
      date: d,
      precipProb: Number(precip[i] ?? 0),
      tempMax: isFinite(Number(tmax[i])) ? Number(tmax[i]) : undefined,
      tempMin: isFinite(Number(tmin[i])) ? Number(tmin[i]) : undefined,
      code: isFinite(Number(codes[i])) ? Number(codes[i]) : undefined,
    }));
  } catch {
    return [];
  }
}

export function isRainRiskDay(f: DailyForecast, threshold: number = 70): boolean {
  return (f?.precipProb ?? 0) >= threshold;
}
