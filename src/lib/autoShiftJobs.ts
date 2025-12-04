// Auto-shift job appointments (allDay jobs) forward if their start day has high rain probability.
// Rule: For any job whose start day precipProb >= 70, move the entire span forward by 1 day repeatedly
// until its new start day is < 70% or beyond available forecast horizon. Skip appointments that are not jobs.
// An appointment qualifies as a job if allDay=true and title starts with 'JOB:' or jobStatus not null.

import prisma from '@/lib/db';

interface ForecastDay { date: string; precipProb: number; }

function toISODate(d: Date): string { return d.toISOString().slice(0,10); }
function atStart(d: Date): Date { const x=new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number): Date { const x=new Date(d); x.setDate(x.getDate()+n); return x; }

export async function autoShiftJobs(tenantId: string, forecast: ForecastDay[], threshold: number = 70, utcOffsetSeconds?: number) {
  // Find the earliest rainy day (>= threshold) at or after today (respect forecast timezone offset if provided)
  let todayIso: string;
  if (typeof utcOffsetSeconds === 'number' && isFinite(utcOffsetSeconds)) {
    const now = new Date();
    // Convert current UTC to forecast local: local = utc + offset_seconds
    const localMs = now.getTime() + utcOffsetSeconds * 1000;
    const local = new Date(localMs);
    todayIso = toISODate(atStart(local));
  } else {
    todayIso = toISODate(atStart(new Date()));
  }
  const risky = forecast
    .filter(f => f.precipProb >= threshold && f.date >= todayIso)
    .map(f => f.date)
    .sort();
  if (risky.length === 0) return { processed: 0, shifted: 0 };
  const firstRainIso = risky[0];
  // Determine consecutive rainy-day run length starting at firstRainIso
  let shiftDays = 1;
  const startIdx = forecast.findIndex(f => f.date === firstRainIso);
  if (startIdx >= 0) {
    shiftDays = 0;
    for (let i = startIdx; i < forecast.length; i++) {
      const f = forecast[i];
      if ((f?.precipProb ?? 0) >= threshold) shiftDays += 1; else break;
    }
    if (shiftDays < 1) shiftDays = 1;
  }
  // Load upcoming all-day jobs (broader range) and filter by local date string
  // Compute UTC threshold for the local rainy day's start using forecast timezone offset (if provided).
  const [y, m, d] = firstRainIso.split('-').map(s => Number(s));
  const offset = Number(utcOffsetSeconds || 0);
  // offset seconds: local = utc + offset_seconds
  const firstRainStartUTCms = Date.UTC(y, (m-1), d, 0, 0, 0) - (offset * 1000); // retained for possible future use

  // Load upcoming all-day jobs from today
  const jobs = await prisma.appointment.findMany({
    where: { tenantId, allDay: true, start: { gte: atStart(new Date()) } },
    orderBy: { start: 'asc' },
    select: { id: true, start: true, end: true, title: true, jobStatus: true }
  });

  // Filter to real jobs (not timed appointments) and include those on/after the rainy day using UTC date compare
  const jobOnly = jobs.filter(j => (
    j.jobStatus !== null || (j.title || '').toUpperCase().startsWith('JOB')
  ));
  if (jobOnly.length === 0) return { processed: 0, shifted: 0 };

  // Compare each job's local date (forecast tz) to the rainy day
  // Convert UTC -> local (forecast tz): local = utc + offset_seconds
  const toLocalIso = (d: Date) => toISODate(new Date(d.getTime() + offset * 1000));
  // Only shift jobs starting on or after the first rainy day (not the previous day)
  const tail = jobOnly.filter(j => toLocalIso(new Date(j.start)) >= firstRainIso);
  if (tail.length === 0) return { processed: 0, shifted: 0 };

  // Shift entire tail by +1 day to keep sequence together
  const updates = tail.map(j => (
    prisma.appointment.update({
      where: { id: j.id },
      data: {
        start: addDays(new Date(j.start), shiftDays),
        end: addDays(new Date(j.end), shiftDays),
      }
    })
  ));
  const updated = await Promise.all(updates);
  const jobIds = updated.map(u => u.id);
  return { processed: tail.length, shifted: tail.length, firstRain: firstRainIso, shiftDays, jobIds } as any;
}
