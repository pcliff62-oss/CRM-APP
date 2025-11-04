import prisma from '@/lib/db';

// Compute job duration (days) from totalSquares per rules:
// <=20 -> 1 day; 20-30 -> 2; 30-40 -> 3; 40-50 -> 4; etc (add 1 per +10 above 20)
export function daysFromSquares(totalSquares?: number | null): number {
  const sq = Number(totalSquares ?? 0);
  if (!isFinite(sq) || sq <= 0) return 1;
  if (sq <= 20) return 1;
  // ceil((sq-20)/10) + 1
  return Math.ceil((sq - 20) / 10) + 1;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function atStartOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

async function findSquaresForLead(leadId: string): Promise<number | null> {
  // Prefer Measurement.totalSquares, else SolarInsight.totalSquares, else null
  const m = await prisma.measurement.findFirst({ where: { leadId }, orderBy: { createdAt: 'desc' }, select: { totalSquares: true } });
  if (m?.totalSquares && isFinite(m.totalSquares)) return m.totalSquares;
  const s = await prisma.solarInsight.findFirst({ where: { leadId }, orderBy: { fetchedAt: 'desc' }, select: { totalSquares: true } });
  if (s?.totalSquares && isFinite(s.totalSquares)) return s.totalSquares;
  return null;
}

async function nextAvailableStartDate(tenantId: string, days: number): Promise<Date> {
  // naive: choose earliest upcoming weekday block with no overlapping allDay installs
  // Query next 60 days of existing all-day appointments
  const today = atStartOfDay(new Date());
  const horizonEnd = addDays(today, 90);
  const all = await prisma.appointment.findMany({
    where: { tenantId, allDay: true, start: { gte: today }, end: { lte: horizonEnd } },
    orderBy: { start: 'asc' }
  });
  // Build a set of blocked ISO dates
  const blocked = new Set<string>();
  for (const a of all) {
    const s = atStartOfDay(new Date(a.start));
    const e = atStartOfDay(new Date(a.end));
    // treat [s, e) with e exclusive typical for FullCalendar multi-day allDay
    for (let d = new Date(s); d < e; d = addDays(d, 1)) {
      blocked.add(toISODate(d));
    }
  }
  // Find first block of N consecutive unblocked days starting tomorrow (or today if free)
  let cursor = today;
  for (let i = 0; i < 120; i++) {
    // try block starting at cursor
    let ok = true;
    for (let j = 0; j < days; j++) {
      const dayIso = toISODate(addDays(cursor, j));
      if (blocked.has(dayIso)) { ok = false; break; }
    }
    if (ok) return cursor;
    cursor = addDays(cursor, 1);
  }
  // fallback: today
  return today;
}

export async function scheduleJobForLead(leadId: string): Promise<{ created: boolean; apptId?: string; days?: number }>{
  // Look up lead & tenant
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { contact: true, property: true } });
  if (!lead) return { created: false };
  const tenantId = lead.tenantId;

  // Avoid duplicate job if an all-day install appointment already exists for this lead in the future
  const existing = await prisma.appointment.findFirst({ where: { tenantId, leadId, allDay: true, start: { gte: new Date(Date.now() - 24*3600*1000) } } });
  if (existing) return { created: false, apptId: existing.id };

  // Determine squares and days
  const squares = await findSquaresForLead(leadId);
  const days = daysFromSquares(squares ?? undefined);

  // Compose title
  const title = `JOB: ${lead.title || lead.contact?.name || 'Customer'}${squares ? ` – ${squares} sq` : ''}`;

  const startDate = await nextAvailableStartDate(tenantId, days);
  // FullCalendar all-day multi-day uses start at 00:00 and end at 00:00 of day after the last day
  const start = atStartOfDay(startDate);
  const end = atStartOfDay(addDays(startDate, days));

  const appt = await prisma.appointment.create({
    data: {
      tenantId,
      title,
      description: lead.property ? `${lead.property.address1}, ${lead.property.city} ${lead.property.state} ${lead.property.postal}` : null,
      start,
      end,
      allDay: true,
      leadId: lead.id,
      userId: null,
    }
  });

  return { created: true, apptId: appt.id, days };
}

export default scheduleJobForLead;
