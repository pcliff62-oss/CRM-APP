"use client";
import { useEffect, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import AssignJobClient, { MaterialOrderedToggle } from '../customers/[id]/AssignJobClient';

interface Crew { id: string; name: string; ratePerSquare?: number; members?: string[] }
interface JobAppt { id: string; when: string; end?: string; allDay?: boolean; crewId?: string; customerName?: string; address?: string; workType?: string; squares?: number; jobStatus?: string; materialOrdered?: boolean; extrasJson?: string; contactId?: string; customerId?: string; title?: string; assignedName?: string; userName?: string; assignedTo?: string; }

// Sales commission box: prefer latest Sales Payment Request values; fall back to lead/user defaults
function SalesCommissionBox({ leadId, jobStatus, extrasTotal, pctOverride, grandOverride, extrasListOverride, contractOverride, amountOverride }:{ leadId?: string; jobStatus?: string; extrasTotal: number; pctOverride?: number | null; grandOverride?: number | null; extrasListOverride?: Array<{ title: string; price: number; qty?: number }> | null; contractOverride?: number | null; amountOverride?: number | null }){
  const [pct, setPct] = useState<number>(10);
  const [contract, setContract] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [sprExtras, setSprExtras] = useState<Array<{ title: string; price: number; qty?: number }>>([]);
  useEffect(() => {
    let active = true;
    if (!leadId) { setPct(10); setContract(0); return; }
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}`);
        const data = await res.json().catch(()=>({}));
        const lead = data?.lead || {};
        const contractPrice = Number(lead.contractPrice || 0) || 0;
        const commissionPercent = Number(lead?.assignee?.commissionPercent ?? NaN);
        if (!active) return;
        setContract(contractOverride != null && Number.isFinite(Number(contractOverride)) ? Number(contractOverride) : contractPrice);
        setPct(Number.isFinite(commissionPercent) ? commissionPercent : 10);
      } catch {
        if (active) { setContract(0); setPct(10); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [leadId, contractOverride]);
  // Load latest SPR extras for this lead to display itemized lines
  useEffect(() => {
    let active = true;
    if (Array.isArray(extrasListOverride)) {
      setSprExtras(extrasListOverride);
    } else {
      (async () => {
        try {
          const res = await fetch('/api/sales-payment-requests', { cache: 'no-store' });
          const data = await res.json().catch(()=>({items:[]}));
          const items = Array.isArray(data?.items) ? data.items : [];
          const candidates = items.filter((it:any) => it?.leadId === leadId);
          const latest = candidates.sort((a:any,b:any)=> String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
          const extrasArr = Array.isArray(latest?.extras) ? latest.extras : [];
          if (active) setSprExtras(extrasArr);
        } catch { if (active) setSprExtras([]); }
      })();
    }
    return () => { active = false; };
  }, [leadId, extrasListOverride]);
  const isSubmitted = jobStatus === 'submitted';
  const displayPct = (pctOverride != null && Number.isFinite(Number(pctOverride))) ? Number(pctOverride) : pct;
  // Prefer SPR extras we just loaded; fallback to prop extrasTotal
  const extrasTotalFromSpr = Array.isArray(sprExtras)
    ? sprExtras.reduce((sum, ex) => {
        const qty = Number((ex as any).qty ?? 1) || 1;
        const price = Number(ex.price ?? 0) || 0;
        return sum + qty * price;
      }, 0)
    : 0;
  const effectiveExtrasTotal = Number.isFinite(extrasTotalFromSpr) && extrasTotalFromSpr > 0 ? extrasTotalFromSpr : (Number(extrasTotal) || 0);
  // Grand total: use override if present, else contract + effective extras
  let displayGrand = (grandOverride != null && Number.isFinite(Number(grandOverride)))
    ? Number(grandOverride)
    : (contract + effectiveExtrasTotal);
  const amount = (amountOverride != null && Number.isFinite(Number(amountOverride)))
    ? Number(amountOverride)
    : (displayGrand * ((displayPct||0)/100));
  const displayContract = (() => {
    // Prefer explicit contractOverride from SPR.
    if (contractOverride != null && Number.isFinite(Number(contractOverride))) return Number(contractOverride);
    return contract || 0;
  })();
  if (displayGrand === displayContract && effectiveExtrasTotal > 0) {
    displayGrand = displayContract + effectiveExtrasTotal;
  }
  // If overrides exist but extras list not yet loaded, infer extras via grandOverride - contractOverride
  const inferredExtrasFromOverride = (() => {
    if (grandOverride != null && Number.isFinite(Number(grandOverride))) {
      const g = Number(grandOverride);
      const base = displayContract;
      const diff = g - base;
      return diff > 0 ? diff : 0;
    }
    return 0;
  })();
  return (
    <div className={`rounded-md p-2 border ${isSubmitted ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
  <div className={`font-semibold ${isSubmitted ? 'text-emerald-800' : 'text-amber-800'}`}>{isSubmitted ? 'Total Sales Commission' : 'Estimated Sales Commission'}</div>
      <div className={`${isSubmitted ? 'text-emerald-700' : 'text-amber-700'} mt-1 space-y-0.5`}>
        <div className="flex justify-between items-center"><span className="text-slate-600">Contract Price</span><span className="font-medium">${displayContract.toFixed(2)}</span></div>
        {(() => {
          const extrasLineTotal = Number(effectiveExtrasTotal) > 0 ? Number(effectiveExtrasTotal) : inferredExtrasFromOverride;
          if (extrasLineTotal > 0) {
            return <div className="flex justify-between items-center"><span className="text-slate-600">Extras Total</span><span className="font-medium">${extrasLineTotal.toFixed(2)}</span></div>;
          }
          return null;
        })()}
        {Array.isArray(sprExtras) && sprExtras.length > 0 && (
          <ul className="mt-0.5 list-disc list-inside text-[11px] text-slate-700 space-y-0.5">
            {sprExtras.slice(0,3).map((ex,i)=>{
              const qty = Number(ex.qty ?? 1) || 1;
              const price = Number(ex.price || 0) || 0;
              const line = (qty * price).toFixed(2);
              const title = ex.title || 'Extra';
              return (<li key={i} className="flex justify-between"><span className="truncate mr-2">{title}</span><span>${line}</span></li>);
            })}
            {sprExtras.length > 3 && (
              <li className="text-[11px] text-slate-500">+{sprExtras.length - 3} more</li>
            )}
          </ul>
        )}
        <div className="flex justify-between items-center"><span className="text-slate-600">Commission %</span><span className="font-medium">{Number(displayPct).toFixed(2)}</span></div>
        <div className="border-t pt-2 flex justify-between text-base font-semibold"><span>Grand Total</span><span>${displayGrand.toFixed(2)}</span></div>
        <div className="flex justify-between items-center"><span className="text-slate-600">Commission Amount</span><span className="font-semibold">${amount.toFixed(2)}</span></div>
      </div>
      {loading && pctOverride == null && grandOverride == null && (
        <div className={`${isSubmitted ? 'text-emerald-600' : 'text-amber-600'} text-[11px] mt-1`}>Updating…</div>
      )}
    </div>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobAppt[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>('ADMIN');
  const [contractPrices, setContractPrices] = useState<Record<string, number>>({}); // leadId -> contractPrice
  const [assignedNames, setAssignedNames] = useState<Record<string, string>>({}); // leadId -> assignee name
  const [salesExtras, setSalesExtras] = useState<Record<string, any[]>>({}); // leadId -> sales extras array
  const [sprByLead, setSprByLead] = useState<Record<string, { extras: any[]; grandTotal: number | null; contractPrice: number | null; commissionPercent: number | null; amount: number | null }>>({});
  const [sprByAppt, setSprByAppt] = useState<Record<string, { extras: any[]; grandTotal: number | null; contractPrice: number | null; commissionPercent: number | null; amount: number | null }>>({});

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
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/users/me', { cache: 'no-store' });
        const json = await res.json().catch(()=>({}));
        const r = json?.user?.role || 'ADMIN';
        if (active) setRole(r);
      } catch {}
    })();
    return () => { active = false };
  }, []);

  // Fetch latest sales payment requests and index by appointmentId (preferred) and leadId (fallback), latest wins
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/sales-payment-requests', { cache: 'no-store' });
        const data = await res.json().catch(()=>({items:[]}));
        const items = Array.isArray(data?.items) ? data.items : [];
        // Build latest-by-lead and latest-by-appt maps
  const map: Record<string, { extras: any[]; grandTotal: number | null; contractPrice: number | null; commissionPercent: number | null; amount: number | null; createdAt?: string }> = {};
  const mapAppt: Record<string, { extras: any[]; grandTotal: number | null; contractPrice: number | null; commissionPercent: number | null; amount: number | null; createdAt?: string }> = {};
        for (const it of items) {
          const leadId = it?.leadId || null;
          const apptId = it?.appointmentId || null;
          const createdAt = String(it?.createdAt || '');
          if (leadId) {
            const cur = map[leadId];
            const isNewer = !cur || (createdAt && cur.createdAt && createdAt > cur.createdAt) || (!cur.createdAt && !!createdAt);
            if (isNewer) {
              map[leadId] = {
                extras: Array.isArray(it?.extras) ? it.extras : [],
                grandTotal: typeof it?.grandTotal === 'number' ? it.grandTotal : null,
                contractPrice: typeof it?.contractPrice === 'number' ? it.contractPrice : null,
                commissionPercent: typeof it?.commissionPercent === 'number' ? it.commissionPercent : null,
                amount: typeof it?.amount === 'number' ? it.amount : null,
                createdAt
              };
            }
          }
          if (apptId) {
            const curA = mapAppt[apptId];
            const isNewerA = !curA || (createdAt && curA.createdAt && createdAt > curA.createdAt) || (!curA.createdAt && !!createdAt);
            if (isNewerA) {
              mapAppt[apptId] = {
                extras: Array.isArray(it?.extras) ? it.extras : [],
                grandTotal: typeof it?.grandTotal === 'number' ? it.grandTotal : null,
                contractPrice: typeof it?.contractPrice === 'number' ? it.contractPrice : null,
                commissionPercent: typeof it?.commissionPercent === 'number' ? it.commissionPercent : null,
                amount: typeof it?.amount === 'number' ? it.amount : null,
                createdAt
              };
            }
          }
        }
        if (active) {
          // strip createdAt before storing
          const finalMap: Record<string, { extras: any[]; grandTotal: number | null; contractPrice: number | null; commissionPercent: number | null; amount: number | null }> = {};
          const finalMapAppt: Record<string, { extras: any[]; grandTotal: number | null; contractPrice: number | null; commissionPercent: number | null; amount: number | null }> = {};
          for (const k of Object.keys(map)) {
            const { extras, grandTotal, contractPrice, commissionPercent, amount } = map[k] as any;
            finalMap[k] = { extras, grandTotal, contractPrice, commissionPercent, amount };
          }
          for (const k of Object.keys(mapAppt)) {
            const { extras, grandTotal, contractPrice, commissionPercent, amount } = mapAppt[k] as any;
            finalMapAppt[k] = { extras, grandTotal, contractPrice, commissionPercent, amount };
          }
          setSprByLead(finalMap);
          setSprByAppt(finalMapAppt);
        }
      } catch {/* ignore */}
    })();
    return () => { active = false };
  }, []);

  // Fetch contract prices, assignee names, and sales extras for unique leads represented by jobs
  useEffect(() => {
  const uniqueLeadIds: string[] = Array.from(new Set(jobs.map(j => j.customerId).filter((v): v is string => typeof v === 'string' && v.length > 0)));
    if (!uniqueLeadIds.length) return;
    let active = true;
    (async () => {
      const cpUpdates: Record<string, number> = {};
      const assigneeUpdates: Record<string, string> = {};
      const extrasUpdates: Record<string, any[]> = {};
      for (const id of uniqueLeadIds) {
        const needsFetch = !(id in contractPrices) || !(id in assignedNames) || !(id in salesExtras);
        if (!needsFetch) continue; // already have both
        try {
          const res = await fetch(`/api/leads/${encodeURIComponent(id!)}`);
          const data = await res.json().catch(()=>({}));
          const cp = Number(data?.lead?.contractPrice ?? 0);
          const assigneeName = String(data?.lead?.assignee?.name || '').trim();
          const leadExtrasRaw = data?.lead?.extrasJson || null;
          let parsed: any[] = [];
          if (leadExtrasRaw) {
            try { const v = JSON.parse(leadExtrasRaw); if (Array.isArray(v)) parsed = v.filter((x:any)=> x && typeof x === 'object'); } catch {}
          }
          if (active && isFinite(cp) && cp > 0) cpUpdates[id!] = cp;
          if (active && assigneeName) assigneeUpdates[id!] = assigneeName;
          if (active) extrasUpdates[id!] = parsed;
        } catch { /* ignore */ }
      }
      if (active) {
        if (Object.keys(cpUpdates).length) setContractPrices(prev => ({ ...prev, ...cpUpdates }));
        if (Object.keys(assigneeUpdates).length) setAssignedNames(prev => ({ ...prev, ...assigneeUpdates }));
        if (Object.keys(extrasUpdates).length) setSalesExtras(prev => ({ ...prev, ...extrasUpdates }));
      }
    })();
    return () => { active = false; };
  }, [jobs, contractPrices, assignedNames, salesExtras]);

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
              const extras = (() => { try { const arr = JSON.parse(job.extrasJson||'[]'); return Array.isArray(arr)? arr : []; } catch { return []; } })(); // crew-added extras (for labor calc only)
              // Locate latest SPR (prefer appointment tie, then lead)
              const spr = (job.id && sprByAppt[job.id]) || (job.customerId ? sprByLead[job.customerId] : undefined);
              const sprExtras = spr?.extras || [];
              const salesExtrasList = (Array.isArray(sprExtras) && sprExtras.length > 0)
                ? sprExtras
                : (job.customerId ? (salesExtras[job.customerId] || []) : []);
              // Removed source label from Sales Extras display
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
                      const res = await fetch(`/api/appointments?id=${encodeURIComponent(job.id)}`, { method:'DELETE' })
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
                      <span className="flex items-center gap-3">
                        <span>{job.customerName || job.title || 'Job'}</span>
                        {job.customerId && contractPrices[job.customerId] !== undefined && (
                          <div className="inline-flex items-start gap-2 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-emerald-800">
                            <div className="inline-flex items-center gap-1">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <path d="M22 4 12 14.01l-3-3"></path>
                              </svg>
                              <span className="font-semibold text-[10px] sm:text-xs">Approved contract price:</span>
                              <span className="tabular-nums text-[10px] sm:text-xs">${contractPrices[job.customerId].toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                            </div>
                          </div>
                        )}
                      </span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300">{job.jobStatus || 'scheduled'}</span>
                    </CardTitle>
          {(() => {
                      const leadId = job.customerId || '';
                      const name = (leadId && assignedNames[leadId]) || job.assignedName || job.userName || '';
                      return name ? (
                        <div className="mt-0.5 text-xs text-blue-800 font-bold">
                          assigned to: <span>{name}</span>
                        </div>
                      ) : null;
                    })()}
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
                    {rate > 0 && squaresNum > 0 && (() => {
                      // Compute extras total (sum of qty * price for object extras)
                      const extrasTotal = Array.isArray(extras)
                        ? extras.reduce((sum:number, ex:any) => {
                            if (ex && typeof ex === 'object') {
                              const qty = Number(ex.qty ?? 1) || 1;
                              const price = Number(ex.price ?? 0) || 0;
                              return sum + qty * price;
                            }
                            // If extras came as strings, skip in total
                            return sum;
                          }, 0)
                        : 0;
                      const baseLabel = `${squares} sq × $${rate.toFixed(2)}`;
                      // Turn green (Total Labor) when crew has completed (completedAt present) OR job is submitted by sales
                      const isCrewCompleted = !!(job as any).completedAt;
                      const boxColor = isCrewCompleted || job.jobStatus === 'submitted';
                      const totalWithExtras = invoice + extrasTotal;
                      return (
                        <div className={`rounded-md p-2 border ${boxColor ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                          <div className={`font-semibold ${boxColor ? 'text-emerald-800' : 'text-amber-800'}`}>{boxColor ? 'Total Labor' : 'Estimated labor'}</div>
                          <div className={`${boxColor ? 'text-emerald-700' : 'text-amber-700'} mt-1`}>
                            {baseLabel} = <span className="font-medium">${invoice.toFixed(2)}</span>
                          </div>
                          {extrasTotal > 0 && (
                            <div className={`${boxColor ? 'text-emerald-700' : 'text-amber-700'} mt-1`}>
                              Extras: <span className="font-medium">${extrasTotal.toFixed(2)}</span>
                            </div>
                          )}
                          {extrasTotal > 0 && (
                            <div className={`${boxColor ? 'text-emerald-800' : 'text-amber-800'} mt-1 font-semibold`}>
                              Total: <span className="font-medium">${totalWithExtras.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {/* Sales Extras box (from lead), shown under Sales Commission */}
                    {/* Sales Commission */}
                    {(() => {
                      // Compute extras total for display when falling back
                      const extrasTotal = Array.isArray(salesExtrasList)
                        ? salesExtrasList.reduce((sum:number, ex:any) => {
                            if (ex && typeof ex === 'object') {
            const qty = Number(ex.qty ?? 1) || 1;
                              const price = Number(ex.price ?? 0) || 0;
                              return sum + qty * price;
                            }
                            return sum;
                          }, 0)
                        : 0;
          const pctOverride = spr?.commissionPercent ?? null;
          const grandOverride = spr?.grandTotal ?? null;
          const amountOverride = (spr as any)?.amount ?? null;
                      return (
                        <SalesCommissionBox
                          leadId={job.customerId}
                          jobStatus={job.jobStatus}
                          extrasTotal={extrasTotal}
                          pctOverride={pctOverride}
                          grandOverride={grandOverride}
                          extrasListOverride={sprExtras}
                          contractOverride={spr?.contractPrice ?? null}
                          amountOverride={amountOverride}
                        />
                      );
                    })()}
  {salesExtrasList.length > 0 && (
                      <div className="rounded-md bg-indigo-50 border border-indigo-200 p-2">
      <div className="font-semibold text-indigo-800">Sales Extras</div>
                        <ul className="mt-1 list-disc list-inside space-y-0.5">
                          {salesExtrasList.map((ex:any,i:number)=>{
                            if (ex && typeof ex === 'object') {
                              const qty = Number(ex.qty ?? 1) || 1;
                              const price = Number(ex.price ?? 0) || 0;
                              const line = (qty * price).toFixed(2);
                              const title = ex.title || 'Extra';
                              return (<li key={i}>{title} — {qty} × ${price.toFixed(2)} = ${line}</li>);
                            }
                            return (<li key={i}>{String(ex)}</li>);
                          })}
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
                      {(role === 'SALES' || role === 'ADMIN' || role === 'MANAGER') && job.jobStatus !== 'submitted' && (
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
