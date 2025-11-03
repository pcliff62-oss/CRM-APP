"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UseAsMeasurement({ missionId }: { missionId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onClick = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/drone-missions/${missionId}/orthomosaic/use-as-measurement`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const id = json.measurementId as string;
      router.push(`/measurements/${id}/edit`);
    } catch (e) {
      alert(`Failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
    >
      {loading ? 'Preparing…' : 'Open in Editor'}
    </button>
  );
}
