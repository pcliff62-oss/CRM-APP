"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import interactionPlugin from "@fullcalendar/interaction";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import CalendarEditor from "./scheduler";
import NewLeadInline from "./NewLeadInline";

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
  lead?: { id: string; title: string; stage: string; contractPrice?: number | null; property?: { id: string; address1: string; city: string; state: string; postal: string; lat?: number | null; lng?: number | null; }; contact?: { id: string; name: string; email?: string | null; phone?: string | null; }; assignee?: { id: string; name: string | null; email: string; }; } | null;
};

export default function CalendarPage() {
  const [events, setEvents] = useState<Appt[]>([]);
  const [selected, setSelected] = useState<Partial<Appt> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/appointments");
    const data = await res.json();
    setEvents(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const [slotDate, setSlotDate] = useState<string>(() => new Date().toISOString().slice(0,10));
  const [slotTime, setSlotTime] = useState<string>('07:00');
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
    if (ev) setSelected(ev);
  }, [events]);

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
        </CardHeader>
        <CardContent>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            selectable
            select={onDateSelect}
            eventClick={onEventClick}
            editable
            eventStartEditable
            eventDurationEditable
            eventDrop={onEventDrop}
            eventResize={onEventResize}
            events={events as any}
            height="75vh"
            headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
            allDaySlot
            allDayText="Jobs"
            slotMinTime="07:00:00"
            slotMaxTime="18:00:00"
            slotDuration="00:30:00"
            slotLabelFormat={{ hour: 'numeric', minute: '2-digit', hour12: true }}
            eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: true, hour12: true }}
            dayHeaderFormat={{ weekday: 'short', month: 'numeric', day: 'numeric' }}
            eventClassNames={(arg) => {
              const uid = (arg.event.extendedProps as any).userId as string | undefined;
              if (!uid) return [];
              // simple deterministic color by user id
              const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-fuchsia-500", "bg-cyan-500"]; 
              const idx = uid.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
              return [colors[idx]];
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          {selected ? (
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Details</CardTitle>
              {selected.lead?.contact?.id && (
                <Link href={`/customers/${selected.lead.contact.id}`}>
                  <Button variant="secondary" size="sm">go to contact</Button>
                </Link>
              )}
            </div>
          ) : (
            <CardTitle>New Lead</CardTitle>
          )}
        </CardHeader>
        <CardContent>
          {selected ? (
            <CalendarEditor selected={selected} onClose={onClose} onSaved={onSaved} />
          ) : (
            <div className="space-y-4">
              <NewLeadInline initialDate={slotDate} initialTime={slotTime} onCreated={load} />
              <div className="text-xs text-slate-500">Click a calendar time slot to prefill date/time. Click an event to view details.</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
