"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import interactionPlugin from "@fullcalendar/interaction";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import CalendarEditor from "./scheduler";
import NewLeadInline from "./NewLeadInline";
import './calendar.css';

const FullCalendar = dynamic(() => import("@fullcalendar/react"), { ssr: false });

type Appt = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description?: string | null;
  leadId?: string | null;
  userId?: string | null;
  contactId?: string | null;
  customerName?: string | null;
  workType?: string | null;
  address?: string | null;
  lead?: { id: string; title: string; stage: string; contractPrice?: number | null; property?: { id: string; address1: string; city: string; state: string; postal: string; lat?: number | null; lng?: number | null; }; contact?: { id: string; name: string; email?: string | null; phone?: string | null; }; assignee?: { id: string; name: string | null; email: string; }; } | null;
};

export default function CalendarPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Appt[]>([]);
  const [selected, setSelected] = useState<Partial<Appt> | null>(null);
  const calendarApiRef = useRef<any>(null);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Helpers (client-side fallbacks for legacy data without end/allDay)
  function isWeekend(d: Date) { const day = d.getDay(); return day === 0 || day === 6; }
  function toStartOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function nextMonday(d: Date) {
    const x = toStartOfDay(d);
    const day = x.getDay();
    if (day === 6) { x.setDate(x.getDate()+2); return x; }
    if (day === 0) { x.setDate(x.getDate()+1); return x; }
    return x;
  }
  function addBusinessDaysExclusive(start: Date, days: number) {
    let remaining = Math.max(1, days);
    let cur = nextMonday(start);
    while (remaining > 0) {
      if (!isWeekend(cur)) {
        remaining -= 1;
        if (remaining === 0) break;
      }
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()+1);
    }
    return new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()+1); // exclusive
  }
  function daysFromSquaresClient(sq?: number | null) {
    const n = Number(sq ?? 0);
    if (!isFinite(n) || n <= 0) return 1;
    if (n <= 20) return 1;
    return 1 + Math.ceil((n - 20) / 10);
  }
  function parseSquaresFromTitle(title?: string | null): number | null {
    if (!title) return null;
    const m = title.match(/(\d+(?:\.\d+)?)\s*sq\b/i);
    return m ? parseFloat(m[1]) : null;
  }

  const load = useCallback(async () => {
    const res = await fetch("/api/appointments");
    const data = await res.json();
    // Support both legacy array payloads and mobile-shaped { ok, items } payloads
    if (Array.isArray(data)) {
      setEvents(data as Appt[]);
    } else if (data && Array.isArray(data.items)) {
      const mapped: Appt[] = (data.items as any[]).map((a: any) => {
        const startIso: string = a.when || a.start || new Date().toISOString();
        let start = new Date(startIso);
        let isAllDay = !!a.job || !!a.allDay;
        let end = a.end ? new Date(a.end) : null;
        if (isAllDay && !end) {
          // Legacy job with missing end: infer from squares and skip weekends
          start = nextMonday(toStartOfDay(start));
          const sq = parseSquaresFromTitle(a.title);
          const days = daysFromSquaresClient(sq);
          end = addBusinessDaysExclusive(start, days);
        }
        if (!end) end = new Date(start.getTime() + 60 * 60 * 1000);
        return {
          id: String(a.id ?? ""),
          title: a.title || a.workType || "Appointment",
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: isAllDay,
          description: a.notes || a.description || null,
          leadId: a.customerId || a.leadId || null,
          userId: a.userId || null,
          contactId: a.contactId || a.lead?.contactId || a.lead?.contact?.id || null,
          customerName: a.customerName || a.lead?.contact?.name || null,
          workType: a.workType || a.lead?.title || null,
          address: a.address || (a.lead?.property?.city ? `${a.lead?.property?.city}` : a.lead?.property?.address1 || null),
          // Pass through lead details if provided
          lead: a.lead || null,
        } as Appt;
      });
      setEvents(mapped);
    } else {
      setEvents([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Listen for cross-page appointment mutations (delete/create/update) and window focus
  useEffect(() => {
    const onChanged = () => { load(); };
    const onFocus = () => { load(); };
    window.addEventListener('appointments:changed', onChanged as EventListener);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('appointments:changed', onChanged as EventListener);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const [slotDate, setSlotDate] = useState<string>(() => new Date().toISOString().slice(0,10));
  const [slotTime, setSlotTime] = useState<string>('07:00');
  const [showNewLead, setShowNewLead] = useState(false);
  const lastClickRef = useRef<{ ts: number; key: string } | null>(null);

  // Double-click handler for timed slots
  const onDateClick = useCallback((info: any) => {
    const d: Date = info.date; // FullCalendar passes `date`
    const isoDate = d.toISOString().slice(0,10);
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = d.getMinutes() < 30 ? '00' : '30';
    const key = `${isoDate}T${hh}:${mm}`;
    const now = Date.now();
    const last = lastClickRef.current;
    setSlotDate(isoDate);
    setSlotTime(`${hh}:${mm}`);
    if (last && last.key === key && (now - last.ts) < 500) {
      // consider as double-click
      setShowNewLead(true);
      lastClickRef.current = null;
    } else {
      lastClickRef.current = { ts: now, key };
    }
  }, []);
  const onDateSelect = useCallback((info: any) => {
    // info.start is a Date for the selected slot
    const d = info.start as Date;
    const isoDate = d.toISOString().slice(0,10);
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = d.getMinutes() < 30 ? '00' : '30'; // snap to our increments
    setSlotDate(isoDate);
    setSlotTime(`${hh}:${mm}`);
  }, []);

  const onEventClick = useCallback((clickInfo: any) => {
    const ev = events.find(e => e.id === clickInfo.event.id);
    if (!ev) return;
    const contactId = (clickInfo.event.extendedProps as any)?.contactId || ev.contactId || ev.lead?.contact?.id;
    if (contactId) {
      router.push(`/customers/${contactId}`);
    } else if (ev.leadId) {
      // Fallback: navigate to customers page for manual selection
      router.push('/customers');
    }
  }, [events, router]);

  // Drag & drop: persist new start/end
  const onEventDrop = useCallback(async (dropInfo: any) => {
    try {
      const ev = dropInfo.event as any;
      // Fallback: if no end provided by calendar, assume 1h duration
      const start: Date | null = ev.start;
      const end: Date | null = ev.end || (start ? new Date(start.getTime() + 60 * 60 * 1000) : null);
      if (!start || !end) { dropInfo.revert(); return; }
      const payload = {
        id: ev.id,
        title: ev.title,
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: !!ev.allDay,
        description: ev.extendedProps?.description ?? null,
        leadId: ev.extendedProps?.leadId ?? null,
        userId: ev.extendedProps?.userId ?? null,
      };
      const res = await fetch('/api/appointments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { dropInfo.revert(); return; }
      // Optimistic local update
      setEvents(prev => prev.map(e => e.id === payload.id ? { ...e, start: payload.start, end: payload.end, allDay: payload.allDay } as any : e));
    } catch {
      dropInfo.revert();
    }
  }, []);

  // Resize: persist new end
  const onEventResize = useCallback(async (resizeInfo: any) => {
    try {
      const ev = resizeInfo.event as any;
      const start: Date | null = ev.start;
      const end: Date | null = ev.end;
      if (!start || !end) { resizeInfo.revert(); return; }
      const payload = {
        id: ev.id,
        title: ev.title,
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: !!ev.allDay,
        description: ev.extendedProps?.description ?? null,
        leadId: ev.extendedProps?.leadId ?? null,
        userId: ev.extendedProps?.userId ?? null,
      };
      const res = await fetch('/api/appointments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { resizeInfo.revert(); return; }
      setEvents(prev => prev.map(e => e.id === payload.id ? { ...e, start: payload.start, end: payload.end, allDay: payload.allDay } as any : e));
    } catch {
      resizeInfo.revert();
    }
  }, []);

  const onClose = useCallback(() => setSelected(null), []);
  const onSaved = useCallback(() => { setSelected(null); load(); }, [load]);
  const onCreated = useCallback(() => { setShowNewLead(false); load(); }, [load]);

  // Calendars filter derived from events
  type CalendarUser = { id: string; label: string; colorClass: string };
  const users: CalendarUser[] = useMemo(() => {
    const seen = new Map<string, CalendarUser>();
    const colorForUser = (uid: string) => {
      const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-fuchsia-500", "bg-cyan-500"];
      const idx = uid.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
      return colors[idx];
    };
    for (const e of events) {
      const uid = e.userId || "unassigned";
      if (!seen.has(uid)) {
        const label = e.lead?.assignee?.name || e.lead?.assignee?.email || (uid === "unassigned" ? "Unassigned" : uid);
        seen.set(uid, { id: uid, label, colorClass: colorForUser(uid) });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [events]);

  const [showJobs, setShowJobs] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const allSelected = selectedUserIds.length === 0 || selectedUserIds.length === users.length;
  const toggleAll = useCallback(() => {
    setSelectedUserIds(prev => (prev.length ? [] : users.map(u => u.id)));
  }, [users]);
  const toggleUser = useCallback((id: string) => {
    setSelectedUserIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const isJob = !!e.allDay || /^JOB:\s*/i.test(e.title || "");
      if (!showJobs && isJob) return false;
      if (allSelected) return true;
      const uid = e.userId || "unassigned";
      return selectedUserIds.includes(uid);
    });
  }, [events, showJobs, allSelected, selectedUserIds]);

  // Mini month helpers
  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const startOfWeek = (d: Date) => {
    const x = new Date(d);
    const day = x.getDay(); // 0 Sun..6 Sat
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const miniMonth = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart);
    const days: { date: Date; inMonth: boolean; dots: string[] }[] = [];
    const colorForUser = (uid: string) => {
      const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-fuchsia-500", "bg-cyan-500"];
      const idx = uid.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
      return colors[idx];
    };
    // Build map of day -> colors
    const map = new Map<string, Set<string>>();
    for (const e of filteredEvents) {
      const s = new Date(e.start);
      const en = new Date(e.end);
      const uid = e.userId || "unassigned";
      let cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      while (cur <= en) {
        const key = cur.toISOString().slice(0, 10);
        if (!map.has(key)) map.set(key, new Set());
        map.get(key)!.add(e.allDay ? "bg-green-600" : colorForUser(uid));
        cur = addDays(cur, 1);
      }
    }
    for (let i = 0; i < 42; i++) {
      const date = addDays(gridStart, i);
      const key = date.toISOString().slice(0, 10);
      const dots = Array.from(map.get(key) ?? []);
      days.push({ date, inMonth: date >= monthStart && date <= monthEnd, dots });
    }
    return days;
  }, [currentDate, filteredEvents]);

  const onMiniPrev = useCallback(() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)), []);
  const onMiniNext = useCallback(() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)), []);
  const onMiniToday = useCallback(() => setCurrentDate(new Date()), []);
  const gotoDate = useCallback((d: Date) => {
    const api = calendarApiRef.current || calendarApiRef.current?.getApi?.();
    if (api) {
      api.gotoDate(d);
      api.changeView("timeGridDay");
    }
  }, []);

  const onDatesSet = useCallback((arg: any) => {
    // Keep mini month in sync with main calendar current date
    const center = arg.view?.currentStart || arg.start || new Date();
    // Capture FullCalendar API for programmatic navigation
    if (arg?.view?.calendar) {
      calendarApiRef.current = arg.view.calendar;
    }
    setCurrentDate(new Date(center));
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 -ml-4 pr-4">
      {/* Left sidebar: mini month + calendars filter */}
      <Card className="hidden lg:block lg:col-span-1">
        <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-xl">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold text-white">{currentDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={onMiniPrev} aria-label="Previous Month" className="text-white hover:bg-white/20">‹</Button>
              <Button variant="ghost" size="sm" onClick={onMiniToday} className="text-white hover:bg-white/20">Today</Button>
              <Button variant="ghost" size="sm" onClick={onMiniNext} aria-label="Next Month" className="text-white hover:bg-white/20">›</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 text-[11px] text-slate-500 mb-1">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <div key={d} className="text-center">{d}</div>
            ))}
          </div>
          {/* 6x7 grid */}
          <div className="grid grid-cols-7 gap-1">
            {miniMonth.map((cell, idx) => {
              const isToday = sameDay(cell.date, new Date());
              const isCurrent = sameDay(cell.date, currentDate);
              return (
                <button
                  key={idx}
                  onClick={() => gotoDate(cell.date)}
                  className={[
                    "aspect-square rounded-md p-1 flex flex-col items-center justify-between",
                    cell.inMonth ? "bg-white hover:bg-slate-50" : "bg-slate-50 text-slate-400",
                    isCurrent ? "ring-2 ring-blue-500" : "",
                  ].join(" ")}
                >
                  <div className={["text-[12px]", isToday ? "font-bold text-blue-600" : ""].join(" ")}>{cell.date.getDate()}</div>
                  <div className="flex gap-0.5 self-center">
                    {cell.dots.slice(0,3).map((c, i) => (
                      <span key={i} className={["w-1.5 h-1.5 rounded-full", c].join(" ")}></span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          {/* Calendars filter */}
          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Calendars</div>
            <label className="flex items-center gap-2 text-sm mb-1">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              <span>All</span>
            </label>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" checked={showJobs} onChange={e => setShowJobs(e.target.checked)} />
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-600"></span>Jobs</span>
            </label>
            <div className="max-h-40 overflow-auto pr-1 space-y-1">
              {users.map(u => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={allSelected ? true : selectedUserIds.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                  />
                  <span className="flex items-center gap-1">
                    <span className={["w-2 h-2 rounded-full", u.colorClass].join(" ")}></span>
                    {u.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

  <Card className="lg:col-span-3">
        <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-xl">
          <div className="flex items-center justify-between">
            <CardTitle className="font-bold text-white">Calendar</CardTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={async ()=>{ await fetch('/api/jobs/shift', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ days: 1 }) }); load(); }}
                className="h-8 px-3 rounded-md bg-white/15 hover:bg-white/25 text-white text-xs border border-white/20"
              >Shift Jobs +1d</button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            selectable
            select={onDateSelect}
            dateClick={onDateClick}
            eventClick={onEventClick}
            editable
            eventStartEditable
            eventDurationEditable
            eventDrop={onEventDrop}
            eventResize={onEventResize}
            events={filteredEvents as any}
            datesSet={onDatesSet}
      height="78vh"
      headerToolbar={{ left: "today prev,next", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
            allDaySlot
            allDayText="Jobs"
            slotMinTime="07:00:00"
            slotMaxTime="18:00:00"
            slotDuration="00:30:00"
            slotLabelFormat={{ hour: 'numeric', minute: '2-digit', hour12: true }}
            eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: true, hour12: true }}
            dayHeaderFormat={{ weekday: 'short', month: 'numeric', day: 'numeric' }}
            eventContent={(arg) => {
              // Build clean content: Bold customer name (header) + small line with work type and town
              const raw = arg.event.title || '';
              const title = raw.replace(/^\s*(Appt:|Appointment:|JOB:)\s*/i, '').trim();
              const ep: any = arg.event.extendedProps || {};
              const name = (ep.lead?.contact?.name) || ep.customerName || '';
              // Work: prefer explicit, else derive from title and remove name/town fragments
              let work = (ep.workType || '').toString().trim();
              const city = (ep.lead?.property?.city) || (ep.address ? String(ep.address).split(',')[1]?.trim() : '') || '';
              if (!work) {
                work = title;
              }
              if (name && work) {
                const rx = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
                work = work.replace(rx, '').replace(/\bfor\s+$/i, '').replace(/\s{2,}/g, ' ').trim();
                work = work.replace(/\s*-\s*$/,'').trim();
              }
              if (city) {
                const rxCity = new RegExp(`\\b${escapeRegExp(city)}\\b`, 'i');
                work = work.replace(rxCity, '').replace(/\s{2,}/g, ' ').trim();
              }
              // If this is a job (all-day or title starts with JOB:), include total squares next to work type
              // Treat as job only if explicitly JOB: prefix OR allDay with no leadId
              const isJob = (/^JOB:\s*/i.test(raw)) || (arg.event.allDay && !ep.leadId);
              if (isJob) {
                const matchSq = (raw || '').match(/(\d+(?:\.\d+)?)\s*sq\b/i) || (work || '').match(/(\d+(?:\.\d+)?)\s*sq\b/i);
                if (matchSq) {
                  const n = Number(matchSq[1]);
                  if (isFinite(n)) {
                    const sqText = `${n.toFixed(2)} sq`;
                    // Append if not already present
                    if (!/\bsq\b/i.test(work)) work = work ? `${work} ${sqText}` : sqText;
                  }
                }
              }
              const sub = [work, city].filter(Boolean).join(' ');
              const html = `
                <div class="fc-appt">
                  ${name ? `<div class=\"font-semibold leading-tight\">${escapeHtml(name)}</div>` : ''}
                  ${sub ? `<div class=\"text-xs leading-tight\">${escapeHtml(sub)}</div>` : ''}
                </div>
              `;
              return { html } as any;
              function escapeHtml(s: string){
                return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'} as any)[c]);
              }
              function escapeRegExp(s: string){
                return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              }
            }}
            eventClassNames={(arg) => {
              const ep: any = arg.event.extendedProps || {};
              const title = arg.event.title || '';
              const isJob = (/^JOB:\s*/i.test(title)) || (arg.event.allDay && !ep.leadId);
              if (isJob) return ["bg-green-600","text-white","job-green"];
              // Force lead appointments to a consistent blue (ignore per-user color) for clarity
              if (ep.leadId) return ["bg-blue-600","text-white","lead-appt"];
              const uid = ep.userId as string | undefined;
              if (!uid) return ["bg-blue-500"]; // default
              const colors = ["bg-blue-500","bg-emerald-500","bg-amber-500","bg-fuchsia-500","bg-cyan-500"];
              const idx = uid.split("").reduce((a,c)=> a + c.charCodeAt(0), 0) % colors.length;
              return [colors[idx]];
            }}
          />
        </CardContent>
      </Card>
      {showNewLead && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-start justify-center p-4" onClick={() => setShowNewLead(false)}>
          <div className="bg-white w-full max-w-xl rounded-xl shadow-xl p-4" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">New Lead</div>
              <button onClick={()=>setShowNewLead(false)} className="text-slate-500">✕</button>
            </div>
            <NewLeadInline initialDate={slotDate} initialTime={slotTime} onCreated={onCreated} />
          </div>
        </div>
      )}
    </div>
  );
}
