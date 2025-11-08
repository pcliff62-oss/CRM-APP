import React, { useEffect, useMemo, useState } from "react";
import { listTasks } from "../../lib/tasks.ts";

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function isSameDay(a, b) { return startOfDay(a).getTime() === startOfDay(b).getTime(); }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function startOfMonth(d) { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function endOfMonth(d) { const x = new Date(d); x.setMonth(x.getMonth()+1,0); x.setHours(0,0,0,0); return x; }
function getMonthDaysGrid(viewDate) {
  // Build a 6x7 grid starting on Sunday. No layout changes.
  const first = startOfMonth(viewDate);
  const last = endOfMonth(viewDate);
  const startWeekday = first.getDay(); // 0=Sun
  const daysInMonth = last.getDate();
  const grid = [];
  // Leading days from previous month
  const leadCount = startWeekday;
  const leadStart = new Date(first);
  leadStart.setDate(first.getDate() - leadCount);
  for (let i=0;i<leadCount;i++) {
    const d = new Date(leadStart); d.setDate(leadStart.getDate()+i);
    grid.push(d);
  }
  // Current month days
  for (let i=1;i<=daysInMonth;i++) {
    const d = new Date(first); d.setDate(i);
    grid.push(d);
  }
  // Trailing days to fill 42 cells
  while (grid.length < 42) {
    const lastGrid = grid[grid.length-1];
    const d = new Date(lastGrid); d.setDate(lastGrid.getDate()+1);
    grid.push(d);
  }
  return grid;
}
function monthLabel(d) {
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}
function isSameMonth(a, b) {
  const A = new Date(a), B = new Date(b);
  return A.getFullYear() === B.getFullYear() && A.getMonth() === B.getMonth();
}

function toLocalISODate(d) {
  const x = new Date(d)
  return [x.getFullYear(), String(x.getMonth()+1).padStart(2,'0'), String(x.getDate()).padStart(2,'0')].join('-')
}
function formatDisplayDate(iso) {
  if (!iso) return ''
  const parts = String(iso).split('-')
  if (parts.length !== 3) return ''
  const [y, m, d] = parts
  return `${m}/${d}/${String(y).slice(2)}`
}

export default function CalendarFixed({
  value,
  onChange,
  className = "",
  showTodayButton = true,
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const initial = value ? startOfDay(value) : today;
  const [viewMonth, setViewMonth] = useState(startOfMonth(initial));
  const [selected, setSelected] = useState(initial);
  const [items, setItems] = useState([]); // {id,title,date}
  const [marks, setMarks] = useState({}); // { [YYYY-MM-DD]: count }
  const [dayOpen, setDayOpen] = useState(false);
  const [dayItems, setDayItems] = useState([]);

  const grid = useMemo(() => getMonthDaysGrid(viewMonth), [viewMonth]);

  // Load tasks for visible grid range and build marks
  useEffect(() => {
    let active = true
    ;(async () => {
      if (!grid.length) return
      const start = toLocalISODate(grid[0])
      const end = toLocalISODate(grid[grid.length - 1])
      const all = await listTasks()
      const ranged = all
        .filter(t => typeof t.dueDate === 'string')
        .filter(t => t.dueDate >= start && t.dueDate <= end)
        .map(t => ({ id: t.id, title: t.title, date: t.dueDate }))
      const m = {}
      for (const it of ranged) m[it.date] = (m[it.date] ?? 0) + 1
      if (!active) return
      setItems(ranged)
      setMarks(m)
    })()
    return () => { active = false }
  }, [viewMonth, grid])

  function openDayList(d) {
    const key = toLocalISODate(d)
    setDayItems(items.filter(it => it.date === key))
    setDayOpen(true)
  }

  function selectDay(d) {
    const s = startOfDay(d);
    setSelected(s);
    if (onChange) onChange(s);
    openDayList(d)
  }
  function goPrev() { setViewMonth(addMonths(viewMonth, -1)); }
  function goNext() { setViewMonth(addMonths(viewMonth, 1)); }
  function goToday() {
    const t = startOfDay(new Date());
    setViewMonth(startOfMonth(t));
    selectDay(t);
  }

  const weekdayLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous month"
            className="rounded-xl px-2 py-1 border text-sm"
          >
            ‹
          </button>
          <div className="text-sm font-medium">{monthLabel(viewMonth)}</div>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next month"
            className="rounded-xl px-2 py-1 border text-sm"
          >
            ›
          </button>
        </div>
        {showTodayButton && (
          <button
            type="button"
            onClick={goToday}
            className="rounded-xl px-3 py-1.5 border text-sm"
            aria-label="Go to today"
          >
            Today
          </button>
        )}
      </div>

      {/* Weekdays */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdayLabels.map(w => (
          <div key={w} className="text-[11px] text-neutral-500 text-center select-none">
            {w}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((d, idx) => {
          const inMonth = isSameMonth(d, viewMonth);
          const itIsToday = isSameDay(d, today);
          const isSelected = isSameDay(d, selected);

          return (
            <button
              key={idx}
              type="button"
              onClick={() => selectDay(d)}
              className={[
                "relative aspect-square rounded-lg border",
                "flex items-center justify-center",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
                inMonth ? "bg-white" : "bg-neutral-100 text-neutral-500",
              ].join(" ")}
              aria-current={itIsToday ? "date" : undefined}
              aria-pressed={isSelected ? true : undefined}
            >
              {/* Selected overlay: blue fill + ring, inset-1 keeps borders intact */}
              {isSelected && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-1 rounded-md ring-2 ring-blue-600 bg-blue-600/15"
                />
              )}
              {/* Today outline: black ring with slight negative offset to avoid size change */}
              {itIsToday && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-[4px] rounded-md ring-2 ring-black"
                />
              )}
              {/* Day number on top */}
              <span className="relative z-10 text-base font-medium">
                {d.getDate()}
              </span>
              {/* Bottom dots for task marks (max 3), absolute so no layout shift */}
              <div className="pointer-events-none absolute inset-x-1 bottom-1 flex gap-1 justify-center">
                {(() => {
                  const k = toLocalISODate(d)
                  const n = Math.min(marks[k] || 0, 3)
                  return Array.from({ length: n }).map((_, i) => (
                    <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-blue-600" />
                  ))
                })()}
              </div>
            </button>
          );
        })}
      </div>

      {/* Minimal non-modal day list panel */}
      {dayOpen && (
        <div className="mt-2 rounded-xl border border-neutral-200 bg-white p-2">
          <div className="text-sm font-medium">{formatDisplayDate(toLocalISODate(selected))}</div>
          {dayItems.length === 0 ? (
            <div className="text-xs text-neutral-500">No tasks for this day.</div>
          ) : (
            <ul className="mt-1 space-y-1">
              {dayItems.map(it => (
                <li key={it.id} className="text-sm">• {it.title}</li>
              ))}
            </ul>
          )}
          <div className="mt-2">
            <button type="button" className="text-xs underline" onClick={() => setDayOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
