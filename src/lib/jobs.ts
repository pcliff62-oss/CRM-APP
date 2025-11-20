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

// New rule: schedule strictly after the last existing all-day job (lead or any job) for the tenant.
// This ensures jobs never overlap or start during the span of an earlier job; they are sequential.
async function nextStartAfterLastJob(tenantId: string): Promise<Date> {
  const today = atStartOfDay(new Date());
  // Find all future/present all-day appointments (jobs) to compute the max end
  const existing = await prisma.appointment.findMany({
    where: { tenantId, allDay: true, start: { gte: addDays(today, -30) } }, // small lookback to catch ongoing spans
    select: { start: true, end: true },
    orderBy: { start: 'asc' }
  });
  let latestEnd: Date | null = null;
  for (const a of existing) {
    const e = new Date(a.end);
    if (!latestEnd || e > latestEnd) latestEnd = e;
  }
  const base = latestEnd && latestEnd > today ? latestEnd : today;
  // Normalize and skip weekends
  const start = normalizeJobStart(base);
  return isWeekend(start) ? nextMonday(start) : start;
}

export async function scheduleJobForLead(leadId: string): Promise<{ created: boolean; apptId?: string; days?: number }>{
  // 1. Load lead with minimal related data needed for assignment logic
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      contact: { include: { leads: { select: { id: true, assigneeId: true }, orderBy: { createdAt: 'asc' } } } },
      property: true,
      assignee: true
    }
  });
  if (!lead) return { created: false };
  const tenantId = lead.tenantId;

  // 2. Duplicate prevention: any future (>= today) all-day appointment for this lead counts as existing job
  const today = atStartOfDay(new Date());
  const existing = await prisma.appointment.findFirst({
    where: {
      tenantId,
      leadId: lead.id,
      allDay: true,
      start: { gte: today }
    },
    orderBy: { start: 'asc' }
  });
  if (existing) return { created: false, apptId: existing.id };

  // 3. Determine squares and compute duration days; cache squares on appointment for downstream invoicing
  const squares = await findSquaresForLead(leadId);
  const days = daysFromSquares(squares ?? undefined);

  // 4. Pick earliest slot
  // Sequential scheduling: always place after last existing job, then apply weekday block length by simply counting forward business days.
  const startDate = await nextStartAfterLastJob(tenantId);
  const start = normalizeJobStart(startDate);
  const end = addWeekdaysExclusive(start, days);
  // Safety: ensure we got positive weekday count; if mismatch, bail
  if (countWeekdays(start, end) < 1) return { created: false };

  // 5. Title & description
  const title = `JOB: ${lead.title || lead.contact?.name || 'Customer'}${squares ? ` – ${squares} sq` : ''}`;
  const description = lead.property ? `${lead.property.address1}, ${lead.property.city} ${lead.property.state} ${lead.property.postal}` : null;

  // 6. Determine default assignee (lead.assigneeId else first contact lead with assignee)
  const fallbackAssigneeId = (() => {
    if (lead.assigneeId) return lead.assigneeId;
    const c: any = lead.contact;
    if (c?.leads?.length) {
      const firstWithAssignee = c.leads.find((l: any) => !!l.assigneeId);
      return firstWithAssignee?.assigneeId || null;
    }
    return null;
  })();

  // 7. Crew role detection (synchronous after fetch)
  let crewId: string | null = null;
  if (fallbackAssigneeId) {
    try {
      const crewUser = await prisma.user.findUnique({ where: { id: fallbackAssigneeId }, select: { role: true } });
      if (crewUser?.role === 'CREW') crewId = fallbackAssigneeId;
    } catch {/* ignore */}
  }

  // 8. Persist appointment
  const appt = await prisma.appointment.create({
    data: {
      tenantId,
      title,
      description,
      start,
      end,
      allDay: true,
      leadId: lead.id,
      userId: fallbackAssigneeId,
      crewId,
      squares: squares ?? undefined,
      jobStatus: 'scheduled'
    }
  });
  // Note: userId holds the SALES (lead assignee) for lifecycle ownership; crewId is set separately
  // so that sales users continue to see the customer/job in their app while crews act on it.

  return { created: true, apptId: appt.id, days };
}

export default scheduleJobForLead;

// Check if a lead already has an existing (past or future) all-day job appointment (any start date)
export async function hasExistingJobAppointment(leadId: string): Promise<boolean> {
  const appt = await prisma.appointment.findFirst({ where: { leadId, allDay: true } });
  return !!appt;
}

// Ensure a job appointment exists for an APPROVED lead; if missing, schedule one.
export async function ensureJobForApprovedLead(leadId: string): Promise<{ created: boolean; apptId?: string; days?: number }>{
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { stage: true } });
  if (!lead || lead.stage !== 'APPROVED') return { created: false };
  const exists = await hasExistingJobAppointment(leadId);
  if (exists) return { created: false };
  return scheduleJobForLead(leadId);
}

// Bulk helper to backfill jobs for a set of leads already in APPROVED stage.
export async function backfillApprovedJobs(leadIds: string[]): Promise<{ processed: number; created: number }>{
  let created = 0;
  for (const id of leadIds) {
    try {
      const result = await ensureJobForApprovedLead(id);
      if (result.created) created += 1;
    } catch {/* ignore individual failures */}
  }
  return { processed: leadIds.length, created };
}

// Pricing aggregation for a lead: base approved contract price + any extras from:
// 1) lead.extrasJson (sales-managed pre-job extras)
// 2) latest job appointment extrasJson (crew-added extras during job)
// Returns structured breakdown for UI.
export async function pricingBreakdownForLead(leadId: string): Promise<{
  contractPrice: number | null;
  extras: { title?: string; price?: number; [k: string]: any }[];
  extrasTotal: number;
  grandTotal: number | null;
  source: 'none' | 'lead' | 'appointment' | 'both';
}> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { contractPrice: true, extrasJson: true, tenantId: true } });
  if (!lead) return { contractPrice: null, extras: [], extrasTotal: 0, grandTotal: null, source: 'none' };
  // Latest all-day job appointment (could have crew extras)
  const appt = await prisma.appointment.findFirst({ where: { leadId, allDay: true }, orderBy: { start: 'desc' }, select: { extrasJson: true, id: true } });
  const parse = (raw: string | null | undefined): any[] => {
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  };
  const leadExtras = parse(lead.extrasJson).filter((x:any)=> x && typeof x === 'object');
  const apptExtras = parse(appt?.extrasJson || null).filter((x:any)=> x && typeof x === 'object');
  // Merge by simple concatenation; duplicates are allowed (distinct crew vs sales items)
  const extras = [...leadExtras, ...apptExtras];
  const extrasTotal = extras.reduce((sum:number,x:any)=> sum + (isFinite(Number(x.price)) ? Number(x.price) : 0), 0);
  const contractPrice = typeof lead.contractPrice === 'number' && isFinite(lead.contractPrice) ? lead.contractPrice : null;
  const grandTotal = contractPrice !== null ? contractPrice + extrasTotal : null;
  const source: 'none' | 'lead' | 'appointment' | 'both' = (() => {
    const hasLead = leadExtras.length > 0;
    const hasAppt = apptExtras.length > 0;
    if (hasLead && hasAppt) return 'both';
    if (hasLead) return 'lead';
    if (hasAppt) return 'appointment';
    return 'none';
  })();
  return { contractPrice, extras, extrasTotal, grandTotal, source };
}
