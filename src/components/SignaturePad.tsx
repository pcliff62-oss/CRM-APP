"use client";
import React, { useEffect, useRef } from "react";

export default function SignaturePad({ width = 760, height = 180, onChange }: { width?: number; height?: number; onChange?: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.lineWidth = 2; ctx.lineCap = "round";
    let drawing = false;
    const toPos = (e: any) => { const r = c.getBoundingClientRect(); const x = (e.touches? e.touches[0].clientX : e.clientX) - r.left; const y = (e.touches? e.touches[0].clientY : e.clientY) - r.top; return { x, y }; };
    const start = (e: any) => { drawing = true; const p = toPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move  = (e: any) => { if (!drawing) return; const p = toPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); onChange && onChange(c.toDataURL("image/png")); };
    const end   = () => { drawing = false; };
    c.addEventListener("mousedown", start);
    c.addEventListener("mousemove", move);
    c.addEventListener("mouseup", end);
    c.addEventListener("mouseleave", end);
    c.addEventListener("touchstart", start, { passive: true });
    c.addEventListener("touchmove", move, { passive: true });
    c.addEventListener("touchend", end);
    return () => {
      c.removeEventListener("mousedown", start);
      c.removeEventListener("mousemove", move);
      c.removeEventListener("mouseup", end);
      c.removeEventListener("mouseleave", end);
      c.removeEventListener("touchstart", start);
      c.removeEventListener("touchmove", move);
      c.removeEventListener("touchend", end);
    };
  }, [onChange]);
  return <canvas ref={ref} width={width} height={height} className="w-full h-44 border rounded bg-white" />;
}
