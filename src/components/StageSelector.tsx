"use client";
import { useEffect, useRef, useState } from 'react';

type StageKey = 'LEAD' | 'PROSPECT' | 'APPROVED' | 'COMPLETED' | 'INVOICED' | 'ARCHIVE';

const STAGES: Array<{ key: StageKey; label: string; color: string; short: string }> = [
  { key: 'LEAD', label: 'Lead', color: 'bg-amber-400', short: 'L' },
  { key: 'PROSPECT', label: 'Prospect', color: 'bg-orange-500', short: 'P' },
  { key: 'APPROVED', label: 'Approved', color: 'bg-lime-500', short: 'A' },
  { key: 'COMPLETED', label: 'Completed', color: 'bg-sky-500', short: 'C' },
  { key: 'INVOICED', label: 'Invoiced', color: 'bg-rose-500', short: 'I' }
];

interface Props {
  contactId: string;
  value?: StageKey | null; // current stage (null means none yet)
  compact?: boolean;
  deferSave?: boolean; // if true, do not persist automatically; parent will handle
  onStageSelected?: (stage: StageKey) => void; // callback when user picks a stage
  readOnly?: boolean; // display only; ignore user interaction
}

export function StageSelector({ contactId, value, compact, deferSave = false, onStageSelected, readOnly = false }: Props) {
  const containerRef = useRef<HTMLDivElement|null>(null);
  const [dragging, setDragging] = useState(false);
  const [current, setCurrent] = useState<StageKey | null>(value || null);
  const [xPos, setXPos] = useState(0);

  // Sync when external updates happen (drag/drop or advance button elsewhere)
  useEffect(() => {
    function onExternal(ev: any) {
      const detail = ev?.detail;
      if (!detail) return;
      if (detail.contactId === contactId && detail.stage && detail.stage !== current) {
        setCurrent(detail.stage);
      }
    }
    window.addEventListener('lead-stage-changed', onExternal as any);
    return () => window.removeEventListener('lead-stage-changed', onExternal as any);
  }, [contactId, current]);

  // Determine knob position based on stage index
  useEffect(() => {
    const idx = STAGES.findIndex(s => s.key === current);
    if (idx === -1) return;
    if (!containerRef.current) return;
    const items = Array.from(containerRef.current.querySelectorAll('.stage-item')) as HTMLElement[];
    const el = items[idx];
    if (el) {
      const rect = el.getBoundingClientRect();
      const crect = containerRef.current.getBoundingClientRect();
      setXPos(rect.left - crect.left + rect.width/2);
    }
  }, [current]);

  function stageFromClientX(clientX: number): StageKey | null {
    if (!containerRef.current) return null;
    const items = Array.from(containerRef.current.querySelectorAll('.stage-item')) as HTMLElement[];
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) {
        const key = el.dataset.key as StageKey; return key;
      }
    }
    // Fallback: choose closest center
    let closest: { key: StageKey; dist: number } | null = null;
    for (const el of items) {
      const c = (el.getBoundingClientRect().left + el.getBoundingClientRect().right)/2;
      const dist = Math.abs(clientX - c);
      const key = el.dataset.key as StageKey;
      if (!closest || dist < closest.dist) closest = { key, dist };
    }
    return closest?.key || null;
  }

  function onDown(e: React.MouseEvent) {
    if (readOnly) return;
    setDragging(true);
    onMove(e);
  }
  function onMove(e: React.MouseEvent) {
    if (!dragging || readOnly) return;
    const stage = stageFromClientX(e.clientX);
    if (stage) setCurrent(stage);
  }
  async function onUp() {
    if (!dragging || readOnly) return;
    setDragging(false);
    if (current) {
      if (deferSave) {
        onStageSelected?.(current);
      } else {
        await fetch('/api/contact-stage', { method: 'POST', body: JSON.stringify({ contactId, stage: current }), headers: { 'Content-Type': 'application/json' } });
        onStageSelected?.(current);
      }
    }
  }

  async function selectStage(stage: StageKey) {
    if (readOnly) return; // ignore in read-only mode
    setCurrent(stage);
    if (deferSave) {
      onStageSelected?.(stage);
    } else {
      await fetch('/api/contact-stage', { method: 'POST', body: JSON.stringify({ contactId, stage }), headers: { 'Content-Type': 'application/json' } }).catch(()=>{});
      onStageSelected?.(stage);
    }
  }

  return (
    <div className={compact ? '' : 'mt-2'}>
      <div
        ref={containerRef}
        className="relative flex items-center justify-between select-none px-2"
        onMouseMove={onMove}
        onMouseLeave={() => dragging && setDragging(false)}
        onMouseUp={onUp}
      >
        {/* Arrow */}
        <div
          className="absolute -top-3 transition-all duration-150"
          style={{ left: xPos, transform: 'translateX(-50%)' }}
        >
          <div
      onMouseDown={onDown}
            className={`w-0 h-0 border-l-4 border-r-4 border-b-6 border-transparent border-b-slate-600 cursor-grab active:cursor-grabbing ${dragging ? 'opacity-90' : ''}`}
          />
        </div>
    <div className={`flex w-full overflow-x-auto no-scrollbar gap-6 py-4 ${readOnly ? 'opacity-100 cursor-default' : ''}`}>
          {STAGES.map(s => (
            <div
              key={s.key}
              data-key={s.key}
        onClick={() => selectStage(s.key)}
              className="stage-item flex-shrink-0 flex flex-col items-center cursor-pointer select-none text-[10px] font-medium tracking-wide uppercase text-slate-500"
            >
              <div
                className={`h-12 w-12 rounded-full flex items-center justify-center text-white text-lg font-bold ${s.color} shadow-sm ring-2 ${current===s.key ? 'ring-slate-800 ring-offset-2 ring-offset-white' : 'ring-transparent'} transition transform active:scale-90`}
                title={s.label}
              >
                {s.short}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default StageSelector;