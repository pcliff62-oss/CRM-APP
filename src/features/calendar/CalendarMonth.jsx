import React from 'react'

const WEEKDAYS = ['S','M','T','W','T','F','S']

export default function CalendarMonth({ year, month, onPrev, onNext }) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startWeekday = first.getDay()
  const daysInMonth = last.getDate()

  const leading = Array.from({ length: startWeekday }, () => null)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const cells = [...leading, ...days]

  const label = first.toLocaleString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          className="px-2 py-1 rounded-md border border-neutral-300 text-neutral-700"
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="text-sm font-semibold">{label}</div>
        <button
          type="button"
          onClick={onNext}
          className="px-2 py-1 rounded-md border border-neutral-300 text-neutral-700"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[11px] text-neutral-500 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((val, idx) => (
          val === null ? (
            <div key={idx} className="h-10 rounded-md bg-neutral-50 border border-neutral-200/50" />
          ) : (
            <div
              key={idx}
              className="h-10 rounded-md border border-neutral-200 bg-white px-1 py-1 text-[12px]"
            >
              <div className="text-neutral-700">{val}</div>
            </div>
          )
        ))}
      </div>
    </div>
  )
}
