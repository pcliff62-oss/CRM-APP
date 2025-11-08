import React from 'react'
export default function Chips({ options, value, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto py-1">
      {options.map(opt => {
        const key = opt || 'All'
        const active = value === opt
        return (
          <button
            key={key}
            onClick={()=>onChange(active ? '' : opt)}
            className={[
              "rounded-full px-3 py-1 text-sm border whitespace-nowrap",
              active ? "bg-neutral-900 text-white border-neutral-900"
                     : "bg-white text-neutral-700 border-neutral-300"
            ].join(' ')}
          >
            {opt || 'All'}
          </button>
        )
      })}
    </div>
  )
}
