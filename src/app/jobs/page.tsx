"use client";
import { useEffect, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import AssignJobClient, { MaterialOrderedToggle } from '../customers/[id]/AssignJobClient';

interface Crew { id: string; name: string; ratePerSquare?: number; members?: string[] }
interface JobAppt { id: string; when: string; end?: string; allDay?: boolean; crewId?: string; customerName?: string; address?: string; workType?: string; squares?: number; jobStatus?: string; materialOrdered?: boolean; extrasJson?: string; contactId?: string; customerId?: string; title?: string; }

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobAppt[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsRes, crewsRes] = await Promise.all([
        fetch('/api/appointments?jobOnly=1'),
        fetch('/api/crews')
      ]);
      const jobsData = await jobsRes.json();
      const crewsData = await crewsRes.json();
      const jobItems: JobAppt[] = Array.isArray(jobsData.items) ? jobsData.items.filter((j:any)=> j.job) : [];
      setJobs(jobItems);
      setCrews(Array.isArray(crewsData.items) ? crewsData.items : []);
    } catch (e:any) {
      setError('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const crewMap = useMemo(() => {
    const m = new Map<string, Crew>();
    crews.forEach(c => m.set(c.id, c));
    return m;
  }, [crews]);

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString(); } catch { return iso.slice(0,10); }
  };

  // Compute scheduled days for a job using start/end and skipping weekends (end is exclusive)
  const computeJobDays = (startIso?: string, endIso?: string, allDay?: boolean) => {
    if (!startIso) return 0;
    const start = new Date(startIso);
    // If no end, assume 1 day
    let end = endIso ? new Date(endIso) : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    // Normalize to dates (strip time)
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    if (e <= s) return 1;
    let days = 0;
    for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
      const day = d.getDay();
      // Skip weekends for all-day jobs; otherwise count all
      if (allDay) {
        if (day !== 0 && day !== 6) days += 1;
      } else {
        days += 1;
      }
    }
    return Math.max(1, days);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Jobs</CardTitle>
          <div className="flex items-center gap-2">
            {/* variant outline not supported; using secondary */}
            <Button variant="secondary" size="sm" onClick={load}>Refresh</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <div className="text-sm text-slate-500">Loading...</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!loading && jobs.length === 0 && <div className="text-sm text-slate-500">No jobs scheduled.</div>}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-2">
            {jobs.map(job => {
              const crew = job.crewId ? crewMap.get(job.crewId) : null;
              const scheduledDays = computeJobDays(job.when, job.end, job.allDay ?? true);
              const squaresNum = Number(job.squares||0) || 0;
              const squares = squaresNum > 0 ? squaresNum.toFixed(2) : '0.00';
              const rate = crew?.ratePerSquare || 0;
              const invoice = rate * squaresNum;
              const extras = (() => { try { const arr = JSON.parse(job.extrasJson||'[]'); return Array.isArray(arr)? arr : []; } catch { return []; } })();
              // Build static map URL (mirrors approach used in customer contact card) using address
              const mapKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined; // only NEXT_PUBLIC* is exposed client-side
        const staticMapUrl = (() => {
                if (!mapKey || !job.address) return null as string | null;
                // (Static Maps free limit: 640x640 unless scale param). Keep modest size for card.
                const params = new URLSearchParams([
                  ['center', job.address],
          ['zoom', '20'],
                  ['size', '640x240'],
                  ['maptype', 'satellite'],
          ['scale', '2'],
          // Add a pin at the address
          ['markers', `color:red|${job.address}`],
                  ['key', mapKey]
                ]);
                return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
              })();
              return (
                <Card key={job.id} className="border border-green-300 relative">
                  <button
                    aria-label="Delete job"
                    title="Delete job"
                    className="absolute top-2 right-2 z-10 h-6 w-6 rounded-full bg-rose-600 text-white text-[11px] leading-6 text-center shadow hover:bg-rose-700 active:scale-95"
                    onClick={async (e)=>{
                      e.stopPropagation();
                      if (!confirm('Delete this job?')) return;
                      const res = await fetch(`/api/appointments/${encodeURIComponent(job.id)}`, { method:'DELETE' })
                      if (res.ok) {
                        setJobs(prev => prev.filter(j => j.id !== job.id))
                        // Notify other views (e.g., Calendar) to refresh
                        try {
                          window.dispatchEvent(new CustomEvent('appointments:changed', { detail: { action: 'deleted', id: job.id } }));
                        } catch {}
                      }
                    }}
                  >×</button>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{job.customerName || job.title || 'Job'}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300">{job.jobStatus || 'scheduled'}</span>
                    </CardTitle>
                    <div className="mt-1 text-xs text-slate-600">
                      {formatDate(job.when)} • {scheduledDays} day job • {job.workType || 'Work'} • {squares} sq
                    </div>
                    <div className="mt-1 text-xs text-slate-700">{job.address || '—'}</div>
                    {staticMapUrl && (
                      <div className="mt-2 rounded-md overflow-hidden border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={staticMapUrl}
                          alt="Job location map"
                          className="w-full h-40 object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    {crew ? (
                      <div className="mt-2 inline-flex items-center gap-2 text-xs bg-blue-50 border border-blue-200 rounded-md px-2 py-1">
                        <span className="font-semibold">Crew:</span>
                        <span>{crew.name}</span>
                        {rate > 0 && <span className="ml-2">Rate: ${rate.toFixed(2)} / sq</span>}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-amber-700">No crew assigned</div>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3 text-xs">
                    {rate > 0 && squaresNum > 0 && (
                      <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2">
                        <div className="font-semibold text-emerald-800">Invoice Preview</div>
                        <div className="mt-1 text-emerald-700">{squares} sq × ${rate.toFixed(2)} = <span className="font-medium">${invoice.toFixed(2)}</span></div>
                      </div>
                    )}
                    {extras.length > 0 && (
                      <div className="rounded-md bg-indigo-50 border border-indigo-200 p-2">
                        <div className="font-semibold text-indigo-800">Extras</div>
                        <ul className="mt-1 list-disc list-inside space-y-0.5">
                          {extras.map((ex:any,i:number)=>(<li key={i}>{typeof ex==='string'? ex : JSON.stringify(ex)}</li>))}
                        </ul>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {!crew && (
                        <AssignJobClient
                          contactId={job.contactId||''}
                          leadId={job.customerId||''}
                          customerName={job.customerName||''}
                          address={job.address||''}
                          workType={job.workType||''}
                          jobId={job.id}
                          initialSquares={job.squares}
                          onAssigned={(updated)=>{
                            setJobs(prev=> prev.map(j=> j.id===updated.id ? { ...j, crewId: updated.crewId, squares: updated.squares ?? j.squares } : j))
                          }}
                        />
                      )}
                      <MaterialOrderedToggle jobId={job.id} initial={!!job.materialOrdered} />
                      {job.jobStatus !== 'submitted' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async ()=>{
                            const res = await fetch(`/api/jobs/${job.id}/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ squares: squaresNum }) });
                            if (res.ok) load();
                          }}
                        >Mark Complete</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
