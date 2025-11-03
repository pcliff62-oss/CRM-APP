"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function NaiveMeasureUploader({ leadId, propertyId }: { leadId?: string; propertyId?: string; }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<string | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [squares, setSquares] = useState<number | null>(null);
  const [measurementId, setMeasurementId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Drive an indeterminate progress bar while analyzing/uploading and until overlay image finishes loading
  const isLoading = busy || overlayLoading;
  useEffect(() => {
    let timer: any;
    if (isLoading) {
      // start progressing up to 90%
      setProgress(p => (p === 0 ? 10 : p));
      timer = setInterval(() => {
        setProgress(p => (p < 90 ? Math.min(90, p + Math.floor(Math.random() * 5 + 1)) : p));
      }, 200);
    } else if (progress > 0) {
      // finish to 100 then reset shortly after
      setProgress(100);
      timer = setTimeout(() => setProgress(0), 400);
    }
    return () => { if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setMsg(null);
    setOverlay(null);
    setOverlayLoading(false);
    setSquares(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      if (leadId) fd.append('leadId', leadId);
      if (propertyId) fd.append('propertyId', propertyId);
  const res = await fetch('/api/drone/naive-measure', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');
  setMeasurementId(data?.measurement?.id || null);
      const overlayPath = data?.overlayPath || data?.worker?.overlay || null;
      setOverlay(overlayPath);
      if (overlayPath) setOverlayLoading(true);
      setSquares(data?.measurement?.totalSquares ?? data?.worker?.totals?.surfaceAreaFt2 ? data.worker.totals.surfaceAreaFt2 / 100.0 : null);
      setMsg('Measured successfully');
    } catch (err: any) {
      setMsg(String(err?.message || err));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-2">
      {/* Loading status bar */}
      {progress > 0 && (
        <div className="w-full h-1 bg-slate-200 rounded overflow-hidden">
          <div
            className="h-full bg-black transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <label className="text-sm font-medium">Auto-detect from Photo</label>
      <input type="file" accept="image/jpeg" onChange={onChange} disabled={busy} />
      {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
      {typeof squares === 'number' && <div className="text-xs">Total squares: {squares.toFixed(2)}</div>}
      {overlay && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={overlay}
          alt="Overlay"
          className="w-full max-w-md rounded border"
          onLoad={() => setOverlayLoading(false)}
          onError={() => setOverlayLoading(false)}
        />
      )}
      {measurementId && (
        <div className="text-xs">
          <Link className="underline" href={`/measurements/${measurementId}/edit`}>Adjust polygons</Link>
        </div>
      )}
    </div>
  );
}
