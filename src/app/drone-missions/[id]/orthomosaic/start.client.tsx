"use client";
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function StartOrtho({ missionId }: { missionId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function start() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/drone-missions/${missionId}/orthomosaic/start`, { method: 'POST' });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to start');
      setMsg('Started orthomosaic job.');
      startTransition(() => router.refresh());
    } catch (e: any) {
      setMsg(e.message || 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={start} disabled={busy || isPending} className="px-3 py-1 text-sm rounded bg-black text-white disabled:opacity-50">{busy ? 'Starting…' : 'Generate Mosaic'}</button>
      {msg && <span className="text-xs">{msg}</span>}
    </div>
  );
}
