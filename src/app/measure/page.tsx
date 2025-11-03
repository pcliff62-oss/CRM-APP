"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function MeasurePage() {
  const router = useRouter();
  const [leadId, setLeadId] = useState<string | null>(null);
  const [addr, setAddr] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const id = sp.get('lead');
      const a = sp.get('addr');
      if (id || a) {
        setLeadId(id);
        if (a) setAddr(a);
        setLoading(true);
        fetch('/api/measurements/create-from-satellite', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ leadId: id, address: a || undefined }) })
          .then(async r => { const j = await r.json().catch(()=>({})); if (!r.ok) return Promise.reject(new Error(j?.error || 'Failed')); return j; })
          .then(j => router.replace(`/measurements/${j.measurementId}/edit`))
          .catch(e => setError(e.message || 'Failed to start'))
          .finally(() => setLoading(false));
      }
    } catch {}
  }, [router]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    fetch('/api/measurements/create-from-satellite', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ address: addr || undefined, leadId: leadId || undefined }) })
      .then(async r => { const j = await r.json().catch(()=>({})); if (!r.ok) return Promise.reject(new Error(j?.error || 'Failed')); return j; })
      .then(j => router.replace(`/measurements/${j.measurementId}/edit`))
      .catch(e => setError(e.message || 'Failed to start'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="max-w-xl mx-auto">
      <Card>
        <CardHeader><CardTitle>Start Measurement</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-slate-600">Create a measurement from a satellite map. Enter an address if it’s not linked to a lead.</div>
          {error && <div className="text-xs text-red-600">{error}</div>}
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-xs text-slate-500">Address</label>
            <Input value={addr} onChange={(e)=> setAddr(e.target.value)} placeholder="123 Main St, City, ST 00000" />
            <Button type="submit" disabled={loading}>{loading ? 'Starting…' : 'Start'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
