import prisma from '@/lib/db';

// Compute job duration (business days) from totalSquares per rules:
// Round up to the next 10 and use that many tens as days, with a minimum of 1.
// Examples: 1–10 => 1 day, 11–20 => 2 days, 21–30 => 3 days, 31–40 => 4 days, etc.
export function daysFromSquares(totalSquares?: number | null): number {
  // Rule: <=20 sq -> 1 day. For sq > 20, add 1 day per 10 sq (rounded up).
  // Examples: 5 =>1, 20 =>1, 21 =>2, 29.9 =>2, 30 =>2, 30.1 =>3, 39.9 =>3, 40 =>3, 40.1 =>4
  const sq = Number(totalSquares ?? 0);
  if (!isFinite(sq) || sq <= 0) return 1;
  if (sq <= 20) return 1;
  return 1 + Math.ceil((sq - 20) / 10);
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

export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6; // Sun=0, Sat=6
}

export function nextMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const add = day === 0 ? 1 : day === 6 ? 2 : 0;
  return add > 0 ? addDays(x, add) : x;
}

export function normalizeJobStart(d: Date): Date {
  const sod = new Date(d);
  sod.setHours(0,0,0,0);
  return isWeekend(sod) ? nextMonday(sod) : sod;
}

// Add N business days (Mon–Fri) to start date, returning exclusive end date for all-day events
export function addWeekdaysExclusive(start: Date, businessDays: number): Date {
  // businessDays >= 1, end is the morning after the last working day
  let remaining = Math.max(1, businessDays);
  let cursor = new Date(start);
  cursor.setHours(0,0,0,0);
  // Ensure start is a weekday
  if (isWeekend(cursor)) cursor = nextMonday(cursor);
  // Count working days
  while (remaining > 0) {
    if (!isWeekend(cursor)) {
      remaining -= 1;
      if (remaining === 0) break;
    }
    cursor = addDays(cursor, 1);
  }
  // cursor is the last working day; return next day 00:00 as exclusive end
  const end = addDays(cursor, 1);
  end.setHours(0,0,0,0);
  return end;
}

// Count weekdays between start (inclusive) and end (exclusive)
export function countWeekdays(startInclusive: Date, endExclusive: Date): number {
  let count = 0;
  let d = new Date(startInclusive);
  d.setHours(0,0,0,0);
  const end = new Date(endExclusive);
  end.setHours(0,0,0,0);
  while (d < end) {
    if (!isWeekend(d)) count += 1;
    d = addDays(d, 1);
  }
  return count;
}

export async function findSquaresForLead(leadId: string): Promise<number | null> {
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
  // Build a set of blocked ISO dates (weekdays only)
  const blocked = new Set<string>();
  for (const a of all) {
    const s = atStartOfDay(new Date(a.start));
    const e = atStartOfDay(new Date(a.end));
    // treat [s, e) with e exclusive typical for FullCalendar multi-day allDay
    for (let d = new Date(s); d < e; d = addDays(d, 1)) {
      if (!isWeekend(d)) blocked.add(toISODate(d));
    }
  }
  // Find first block of N consecutive unblocked weekdays
  let cursor = nextMonday(today);
  for (let i = 0; i < 120; i++) {
    // try block starting at cursor
    let ok = true;
    let counted = 0;
    let probe = new Date(cursor);
    while (counted < days) {
      if (isWeekend(probe)) { probe = nextMonday(probe); continue; }
      // If short job (<=3 days), keep it within the same Mon–Fri week
      if (days <= 3) {
        const dow = probe.getDay(); // Mon=1..Fri=5
        const lastDow = dow + (days - counted - 1);
        if (lastDow > 5) { ok = false; break; }
      }
      const iso = toISODate(probe);
      if (blocked.has(iso)) { ok = false; break; }
      counted += 1;
      probe = addDays(probe, 1);
    }
    if (ok) return cursor;
    cursor = addDays(cursor, 1);
    if (isWeekend(cursor)) cursor = nextMonday(cursor);
  }
  // fallback: today
  return nextMonday(today);
}

export async function scheduleJobForLead(leadId: string): Promise<{ created: boolean; apptId?: string; days?: number }>{
  // Look up lead & tenant
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { contact: { include: { leads: { include: { assignee: true }, orderBy: { createdAt: 'asc' } } } }, property: true, assignee: true } });
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
  // FullCalendar all-day multi-day uses start at 00:00 and end exclusive (skip weekends)
  const start = normalizeJobStart(startDate);
  const end = addWeekdaysExclusive(start, days);

  // Determine best assignee: this lead's assignee, else earliest lead's assignee for the contact
  const fallbackAssigneeId = ((): string | null => {
    const c = lead.contact as any;
    if (lead.assigneeId) return lead.assigneeId;
    if (c && Array.isArray(c.leads)) {
      const firstWithAssignee = c.leads.find((l:any)=> !!l.assigneeId);
      return firstWithAssignee?.assigneeId || null;
    }
    return null;
  })();

  const appt = await prisma.appointment.create({
    data: {
      tenantId,
      title,
      description: lead.property ? `${lead.property.address1}, ${lead.property.city} ${lead.property.state} ${lead.property.postal}` : null,
      start,
      end,
      allDay: true,
      leadId: lead.id,
      // Assign to contact-level assignee as administrative default if present
      userId: fallbackAssigneeId,
      // If the assignee is a crew member, also set crewId so crew-centric filters pick it up
      crewId: (async () => {
        if (!fallbackAssigneeId) return null;
        try {
          const crewUser = await prisma.user.findUnique({ where: { id: fallbackAssigneeId }, select: { role: true } });
          return crewUser?.role === 'CREW' ? fallbackAssigneeId : null;
        } catch { return null }
      })() as any,
    }
  });

  return { created: true, apptId: appt.id, days };
}

export default scheduleJobForLead;
