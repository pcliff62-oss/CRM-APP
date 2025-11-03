"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MeasureFromCustomerButton({ leadId, address }: { leadId?: string | null; address?: string | null }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const onClick = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/measurements/create-from-satellite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: leadId || undefined, address: address || undefined })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Request failed');
      const id = json.measurementId as string;
      router.push(`/measurements/${id}/edit`);
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center justify-center h-10 px-3 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50"
    >{loading ? 'Preparing…' : 'Measure'}</button>
  );
}
