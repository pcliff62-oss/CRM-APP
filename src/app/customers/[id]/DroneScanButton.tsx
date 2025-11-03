"use client";
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const Planner = dynamic(() => import('./DroneScanPlanner'), { ssr: false });

interface Props {
  contactId: string;
  leadId?: string;
  propertyId?: string;
  normalizedAddress: string;
}

export default function DroneScanButton(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="group relative flex items-center gap-3 rounded-md border border-purple-300 bg-purple-100 hover:bg-purple-200 hover:border-purple-400 hover:shadow-sm transition px-4 py-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-purple-500 text-white group-hover:bg-purple-600 transition">
          <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2" className="h-5 w-5">
            <circle cx="12" cy="12" r="3" />
            <path d="M4 4l4 4M20 4l-4 4M4 20l4-4M20 20l-4-4" />
            <path d="M2 12h4M18 12h4M12 2v4M12 18v4" />
          </svg>
        </span>
        <div className="flex flex-col text-left">
          <span className="text-sm font-medium text-purple-900 leading-none">Drone Scan</span>
          <span className="mt-1 text-xs text-purple-800/80">Plan aerial capture</span>
        </div>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-5xl h-[90vh] rounded-lg shadow-lg flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="font-semibold text-lg">Drone Mission Planner</h2>
              <button onClick={() => setOpen(false)} className="text-slate-600 hover:text-black">✕</button>
            </div>
            <Planner {...props} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
