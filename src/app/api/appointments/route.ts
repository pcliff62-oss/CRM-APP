import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { daysFromSquares, findSquaresForLead, addWeekdaysExclusive, normalizeJobStart } from "@/lib/jobs";
import { mapDbToMobileAppt } from "@/lib/mapAppointment";
import { getCurrentTenantId, getCurrentUser } from "@/lib/auth";
import { Role } from "@prisma/client";
import { autoShiftJobs } from '@/lib/autoShiftJobs';
import { fetch10DayForecast } from '@/lib/weather';

async function fetchOffsetAndForecast(zip: string) {
  // Reuse existing geocode via weather.ts? Simplicity: call zippopotam.us inline.
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
    if (!res.ok) return null;
    const data = await res.json().catch(()=>null);
    const place = Array.isArray(data?.places) ? data.places[0] : null;
    const lat = place ? Number(place.latitude) : NaN;
    const lon = place ? Number(place.longitude) : NaN;
    if (!isFinite(lat) || !isFinite(lon)) return null;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_probability_max&forecast_days=10&timezone=auto`;
    const w = await fetch(url);
    if (!w.ok) return null;
    const json = await w.json().catch(()=>null);
    return json;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok: true, items: [] }, { status: 200 });
  // Weather auto-shift: run once per UTC day to avoid manual button.
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { postal: true, lastWeatherShiftAt: true, lastWeatherShiftDay: true, weatherShiftPendingStatus: true } });
    const zip = tenant?.postal || '';
    if (zip) {
      const now = new Date();
      const todayIso = now.toISOString().slice(0,10);
      const lastDay = tenant?.lastWeatherShiftAt ? tenant.lastWeatherShiftAt.toISOString().slice(0,10) : null;
      if (lastDay !== todayIso) {
        const raw = await fetchOffsetAndForecast(zip);
        const days: string[] = raw?.daily?.time || [];
        const precip: number[] = raw?.daily?.precipitation_probability_max || [];
        const offset: number | undefined = typeof raw?.utc_offset_seconds === 'number' ? raw.utc_offset_seconds : undefined;
        const forecast = days.map((d,i)=> ({ date:d, precipProb: Number(precip[i]??0) }));
        if (forecast.length) {
          const result = await autoShiftJobs(tenantId, forecast, 70, offset);
          const payload = { ...result, createdAt: new Date().toISOString() };
          await prisma.tenant.update({ where: { id: tenantId }, data: {
            lastWeatherShiftAt: new Date(),
            lastWeatherShiftDay: (result as any)?.firstRain || null,
            lastWeatherShiftResultJson: JSON.stringify(result),
            weatherShiftPendingJson: JSON.stringify(payload),
            weatherShiftPendingStatus: 'pending'
          } });
        }
      }
    }
  } catch {}
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId") || undefined;
  const userId = searchParams.get("userId") || undefined;
  const assignedTo = (searchParams.get("assignedTo") || "").trim(); // email convention from field app
  const crewId = searchParams.get("crewId") || undefined;
  const jobOnlyRaw = searchParams.get("jobOnly");
  const jobOnly = jobOnlyRaw === '1' || jobOnlyRaw === 'true' ? true : jobOnlyRaw === '0' || jobOnlyRaw === 'false' ? false : undefined;
  let appts = await prisma.appointment.findMany({
    where: { tenantId, leadId, userId },
    include: {
      lead: { include: { contact: true, property: true, assignee: true } },
      user: true,
      assignees: { include: { user: true } },
      crews: true,
      scopes: true,
    },
    orderBy: { start: "asc" }
  });
  if (crewId) {
    const needle = crewId.toLowerCase();
    appts = appts.filter(a => {
      const cid = (a.crewId || '').toLowerCase(); // stored crew assignment id on appointment
      const uid = (a.userId || '').toLowerCase(); // fallback: userId matches crew
      const uemail = (a.user?.email || '').toLowerCase(); // fallback: email provided as crew identifier
      return cid === needle || uid === needle || (uemail && uemail === needle);
    });
  }
  if (assignedTo) {
    const current = await getCurrentUser(req).catch(()=>null as any);
    const currentEmail = (current?.email || '').toLowerCase();
    const role = (current as any)?.role || 'ADMIN';
    const needle = assignedTo.toLowerCase();
    // Try to resolve the assignedTo (email or id) to a user id for crew/user matching
    let needleUserId: string | null = null;
    try {
      const u = await prisma.user.findUnique({ where: { email: assignedTo } });
      if (u) needleUserId = u.id;
    } catch {}
    appts = appts.filter(a => {
      const email = (a.user?.email || '').toLowerCase();
      const leadAssigneeEmail = (a.lead?.assignee?.email || '').toLowerCase();
      const uid = (a.userId || '').toLowerCase();
      const cid = (a.crewId || '').toLowerCase();
      // SALES: strict to current user, but include orphaned jobs (no user) if lead assignee matches current user
      if (role === 'SALES') {
        return (
          email === currentEmail ||
          uid === current?.id?.toLowerCase?.() ||
          cid === current?.id?.toLowerCase?.() ||
          (email === '' && leadAssigneeEmail === currentEmail)
        );
      }
      // Others: match explicit needle or current user, and include orphaned jobs if lead assignee matches
      return (
        email === needle ||
        uid === needleUserId?.toLowerCase?.() ||
        cid === needleUserId?.toLowerCase?.() ||
        (currentEmail && (email === currentEmail || uid === current?.id?.toLowerCase?.() || cid === current?.id?.toLowerCase?.())) ||
        (email === '' && (leadAssigneeEmail === needle || (currentEmail && leadAssigneeEmail === currentEmail)))
      );
    });
  }
  if (jobOnly !== undefined) {
    appts = appts.filter(a => {
      const isJob = !!a.allDay || /^JOB:\s*/i.test(a.title || '') || !!a.jobStatus || !!a.squares || !!a.crewId;
      return jobOnly ? isJob : !isJob;
    });
  }
  const items = appts.map(mapDbToMobileAppt);
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  const user = await getCurrentUser(req);
  if (!tenantId || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const data = await req.json();
  // Field app sends: { id?, title, type, when(ISO), location, notes, customerId, assignedTo(email), allDay?, end? }
  const when = data.when ? new Date(data.when) : (data.start ? new Date(data.start) : new Date());
  // Resolve assigned user by email if provided
  let userId: string | null = user.id;
  if (data.assignedTo && typeof data.assignedTo === 'string') {
    const u = await prisma.user.findUnique({ where: { email: data.assignedTo } }).catch(()=>null);
    if (u) userId = u.id;
  }
  // Determine if this is a job (allDay multi-day) and compute duration from squares
  const titleStr: string = data.title || '';
  const forceAllDay: boolean = !!data.allDay || /^JOB:\s*/i.test(titleStr) || !!data.job;
  // Keep a computed squares hint if we can infer it (used for create defaults)
  let computedSquares: number | null = null;
  // DO NOT override userId when a crew is assigned; sales owner remains userId for visibility persistence.
  let start = new Date(when);
  let end = data.end ? new Date(data.end) : new Date(when.getTime() + 60*60*1000);
  let allDay = false;
  if (forceAllDay) {
    allDay = true;
    // Normalize to weekday start-of-day
    const sod = normalizeJobStart(start);
    start = sod;
    if (data.end) {
      end = new Date(data.end);
    } else {
      // try parse squares from title, else look up by leadId
      const m = titleStr.match(/(\d+(?:\.\d+)?)\s*sq\b/i);
      if (m) {
        computedSquares = parseFloat(m[1]);
      } else if (data.customerId) {
        computedSquares = await findSquaresForLead(String(data.customerId)).catch(()=>null);
      }
      const days = daysFromSquares(computedSquares ?? undefined);
      // Schedule after any existing jobs to avoid overlap
      try {
        const lastJob = await prisma.appointment.findFirst({
          where: { tenantId, allDay: true, NOT: { end: null as any } },
          orderBy: { end: 'desc' },
          select: { end: true }
        });
        if (lastJob?.end) {
          // end is exclusive: new job can begin on lastJob.end without overlap
          const candidate = normalizeJobStart(new Date(lastJob.end));
          if (candidate.getTime() > start.getTime()) {
            start = candidate;
          }
        }
      } catch {}
      end = addWeekdaysExclusive(start, days); // exclusive, skips weekends
    }
  }
  const base = {
    title: titleStr || 'Untitled',
    description: data.notes || null,
    start,
    end,
    allDay,
    leadId: data.customerId || null,
    userId,
    tenantId,
    crewId: data.crewId || null,
    jobStatus: data.jobStatus || (forceAllDay ? 'scheduled' : null),
    materialOrdered: !!data.materialOrdered || false,
    squares: (data.squares !== undefined ? data.squares : (computedSquares ?? null)),
    extrasJson: typeof data.extrasJson === 'string' ? data.extrasJson : null,
    attachmentsJson: typeof data.attachmentsJson === 'string' ? data.attachmentsJson : null,
  } as const;
  let record;
  if (data.id) {
    // On update via POST (legacy path), update ONLY fields explicitly provided
    const updateData: any = {
      tenantId,
    };
    if (Object.prototype.hasOwnProperty.call(data, 'title')) updateData.title = data.title;
    if (Object.prototype.hasOwnProperty.call(data, 'notes')) updateData.description = data.notes;
    if (Object.prototype.hasOwnProperty.call(data, 'customerId')) updateData.leadId = data.customerId;
    if (Object.prototype.hasOwnProperty.call(data, 'assignedTo') || Object.prototype.hasOwnProperty.call(data, 'userId')) {
      updateData.userId = userId;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'crewId')) {
      updateData.crewId = data.crewId; // crew assignment separate from sales owner
    }
    if (Object.prototype.hasOwnProperty.call(data, 'jobStatus')) {
      const desired = String(data.jobStatus || '');
      // Only SALES may mark a job as 'submitted'
      if (desired.toLowerCase() === 'submitted') {
        if (user.role === Role.SALES) updateData.jobStatus = 'submitted';
      } else {
        updateData.jobStatus = desired;
      }
    }
    if (Object.prototype.hasOwnProperty.call(data, 'materialOrdered')) updateData.materialOrdered = !!data.materialOrdered;
    if (Object.prototype.hasOwnProperty.call(data, 'squares')) updateData.squares = data.squares;
    if (Object.prototype.hasOwnProperty.call(data, 'extrasJson')) updateData.extrasJson = typeof data.extrasJson === 'string' ? data.extrasJson : JSON.stringify(data.extrasJson || []);
    if (Object.prototype.hasOwnProperty.call(data, 'attachmentsJson')) updateData.attachmentsJson = typeof data.attachmentsJson === 'string' ? data.attachmentsJson : JSON.stringify(data.attachmentsJson || []);
    // Time computations only when provided
    if (Object.prototype.hasOwnProperty.call(data, 'when') || Object.prototype.hasOwnProperty.call(data, 'start')) {
      updateData.start = new Date(data.when || data.start);
      if (Object.prototype.hasOwnProperty.call(data, 'end')) {
        updateData.end = new Date(data.end);
      }
      if (Object.prototype.hasOwnProperty.call(data, 'allDay')) updateData.allDay = !!data.allDay;
    }
    record = await prisma.appointment.update({ where: { id: data.id }, data: updateData });
  } else {
    // Idempotency: prevent duplicate job creations (same tenant, lead, start day, allDay)
    const existing = await prisma.appointment.findFirst({ where: { tenantId, leadId: base.leadId, start: base.start, allDay: base.allDay } }).catch(()=>null);
    if (existing) {
      const updateData: any = {
        title: base.title,
        description: base.description,
        start: base.start,
        end: base.end,
        allDay: base.allDay,
        leadId: base.leadId,
        userId: base.userId,
        tenantId: base.tenantId,
        crewId: base.crewId,
        jobStatus: base.jobStatus,
        materialOrdered: base.materialOrdered,
        // Preserve squares unless an explicit value is provided,
        // but if existing has no squares and we computed one, set it.
        squares: (data.squares !== undefined ? data.squares : (existing.squares == null && computedSquares != null ? computedSquares : undefined)),
        extrasJson: base.extrasJson,
        attachmentsJson: base.attachmentsJson,
      };
      record = await prisma.appointment.update({ where: { id: existing.id }, data: updateData });
    } else {
      record = await prisma.appointment.create({ data: base });
    }
  }
  const full = await prisma.appointment.findUnique({ where: { id: record.id }, include: { user: true, lead: { include: { contact: true, property: true } } } });
  return NextResponse.json({ ok: true, item: mapDbToMobileAppt(full!) }, { status: 200 });
}

export async function PUT(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const user = await getCurrentUser(req).catch(()=>null as any);
  const data = await req.json();
  if (!data.id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  // Load current to preserve fields not explicitly provided
  const current = await prisma.appointment.findUnique({ where: { id: data.id }, include: { user: true, lead: true } });
  if (!current) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Resolve user by email (assignedTo) or accept provided userId
  let userId: string | null = (data.userId ?? undefined) as string | null | undefined || null;
  if (data.assignedTo && typeof data.assignedTo === 'string') {
    const u = await prisma.user.findUnique({ where: { email: data.assignedTo } }).catch(()=>null);
    if (u) userId = u.id;
  }
  // Preserve existing sales user; crewId does not take ownership

  // Prepare selective update object
  const patch: any = { tenantId };
  if (Object.prototype.hasOwnProperty.call(data, 'title')) patch.title = String(data.title || '');
  if (Object.prototype.hasOwnProperty.call(data, 'notes') || Object.prototype.hasOwnProperty.call(data, 'description')) {
    patch.description = (data.notes ?? data.description ?? '') || null;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'customerId') || Object.prototype.hasOwnProperty.call(data, 'leadId')) {
    patch.leadId = data.customerId ?? data.leadId ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'assignedTo') || Object.prototype.hasOwnProperty.call(data, 'userId')) {
    patch.userId = userId ?? current.userId;
  }
  // crewId updated independently
  if (Object.prototype.hasOwnProperty.call(data, 'crewId')) patch.crewId = data.crewId || null;
  if (Object.prototype.hasOwnProperty.call(data, 'jobStatus')) {
    const desired = String(data.jobStatus || '');
    if (desired.toLowerCase() === 'submitted') {
      if ((user as any)?.role === Role.SALES) patch.jobStatus = 'submitted';
    } else {
      patch.jobStatus = desired;
    }
  }
  if (Object.prototype.hasOwnProperty.call(data, 'materialOrdered')) patch.materialOrdered = !!data.materialOrdered;
  if (Object.prototype.hasOwnProperty.call(data, 'squares')) patch.squares = data.squares;
  if (Object.prototype.hasOwnProperty.call(data, 'extrasJson')) patch.extrasJson = typeof data.extrasJson === 'string' ? data.extrasJson : JSON.stringify(data.extrasJson || []);
  if (Object.prototype.hasOwnProperty.call(data, 'attachmentsJson')) patch.attachmentsJson = typeof data.attachmentsJson === 'string' ? data.attachmentsJson : JSON.stringify(data.attachmentsJson || []);
  if (Object.prototype.hasOwnProperty.call(data, 'completedAt')) patch.completedAt = data.completedAt ? new Date(data.completedAt) : null;

  // Time fields: only update if provided; if marking job-ish with allDay true without explicit end, compute end
  let start: Date | undefined;
  let end: Date | undefined;
  let allDay: boolean | undefined;
  if (Object.prototype.hasOwnProperty.call(data, 'when') || Object.prototype.hasOwnProperty.call(data, 'start')) {
    start = new Date(data.when || data.start);
    patch.start = start;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'end')) {
    end = new Date(data.end);
    patch.end = end;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'allDay')) {
    allDay = !!data.allDay;
    patch.allDay = allDay;
  }
  // If caller explicitly indicates a job (allDay true or title starting with JOB: or data.job true) and did not provide end, compute it
  const rawTitle = Object.prototype.hasOwnProperty.call(data, 'title') ? String(data.title || '') : String(current.title || '');
  const indicatesJob = (Object.prototype.hasOwnProperty.call(data, 'allDay') && !!data.allDay) || /^JOB:\s*/i.test(rawTitle) || !!data.job;
  if (indicatesJob) {
    const s = start ?? new Date(current.start);
    const sod = normalizeJobStart(s);
    patch.allDay = true;
    patch.start = sod;
    if (!end && !Object.prototype.hasOwnProperty.call(data, 'end')) {
      let sq: number | null = null;
      const m = rawTitle.match(/(\d+(?:\.\d+)?)\s*sq\b/i);
      if (m) sq = parseFloat(m[1]);
      else if (Object.prototype.hasOwnProperty.call(data, 'customerId') || Object.prototype.hasOwnProperty.call(data, 'leadId') || current.leadId) {
        const id = String(data.customerId || data.leadId || current.leadId);
        sq = await findSquaresForLead(id).catch(()=>null);
      }
      const days = daysFromSquares(sq ?? undefined);
      patch.end = addWeekdaysExclusive(sod, days);
    }
    if (!Object.prototype.hasOwnProperty.call(data, 'jobStatus')) patch.jobStatus = current.jobStatus || 'scheduled';
  }

  const updated = await prisma.appointment.update({ where: { id: data.id }, data: patch });
  // If appointment notes updated, sync to lead.notes for field app contact card
  try {
    if ((Object.prototype.hasOwnProperty.call(data, 'notes') || Object.prototype.hasOwnProperty.call(data, 'description')) && (current.leadId || updated.leadId)) {
      const nextNotes = (data.notes ?? data.description ?? '') || null;
      if (nextNotes !== null) {
        await prisma.lead.update({ where: { id: (current.leadId || updated.leadId)! }, data: { notes: String(nextNotes) } });
      }
    }
  } catch {}
  const full = await prisma.appointment.findUnique({ where: { id: updated.id }, include: { user: true, lead: { include: { contact: true, property: true } } } });
  return NextResponse.json({ ok: true, item: mapDbToMobileAppt(full!) });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await prisma.appointment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
// mapping moved to src/lib/mapAppointment
