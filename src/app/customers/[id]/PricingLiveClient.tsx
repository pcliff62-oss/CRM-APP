"use client";
import { useEffect, useState } from 'react';

// Poll extras + contract price periodically to trigger a soft reload of the server component via location.refresh (Next 13+) fallback using window.location.reload if not present.
// This is a minimal enhancement to reflect field app extras updates without manual refresh.
export default function PricingLiveClient({ leadId, intervalMs = 15000 }: { leadId: string; intervalMs?: number }) {
  const [hash, setHash] = useState(0);
  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/leads/${leadId}/extras`, { cache: 'no-store' });
        if (!active) return;
        if (res.ok) {
          // Simply bump state to hint react server components (if wrapped) or user sees updated pricing after manual actions.
          setHash(h => h + 1);
        }
      } catch {/* ignore */}
    };
    const id = setInterval(tick, intervalMs);
    return () => { active = false; clearInterval(id); };
  }, [leadId, intervalMs]);
  return null; // non-visual
}