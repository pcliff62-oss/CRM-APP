"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UseSatelliteMeasurement({ missionId }: { missionId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onClick = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/drone-missions/${missionId}/satellite/use-as-measurement`, { method: 'POST' });
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
      className="underline disabled:opacity-50"
      type="button"
    >
      {loading ? 'Preparing…' : 'Use Satellite Map'}
    </button>
  );
}
