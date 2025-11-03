"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StartMeasurementButton({ leadId, address, className, variant = 'primary' }: { leadId?: string; address?: string; className?: string; variant?: 'primary'|'tile' }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const onClick = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/measurements/create-from-satellite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId, address }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to start');
      const id = json.measurementId as string;
      router.push(`/measurements/${id}/edit`);
    } catch (e: any) {
      alert(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };
  if (variant === 'tile') {
    return (
      <button onClick={onClick} disabled={loading} className={`group relative flex items-center gap-3 rounded-md border border-sky-300 bg-sky-100 hover:bg-sky-200 hover:border-sky-400 hover:shadow-sm transition px-4 py-3 ${className||''}`}>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-sky-500 text-white group-hover:bg-sky-600 transition">
          <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2" className="h-5 w-5"><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M7 7v4M11 7v2M15 7v4M19 7v2" /></svg>
        </span>
        <div className="flex flex-col text-left">
          <span className="text-sm font-medium text-sky-900 leading-none">{loading ? 'Starting…' : 'Measure'}</span>
          <span className="mt-1 text-xs text-sky-800/80">Open measurement tools</span>
        </div>
      </button>
    );
  }
  return (
    <button onClick={onClick} disabled={loading} className={`inline-flex items-center justify-center h-10 px-3 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-60 ${className||''}`}>
      {loading ? 'Starting…' : 'Measure'}
    </button>
  );
}
