"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatPhone } from "@/components/utils";
import FlagPicker from '@/components/FlagPicker'

type ContactCard = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  flagColor?: 'red'|'yellow'|'green'|null;
  leads: Array<{ stage: string | null; property: { address1: string | null; city?: string|null } | null }>;
};

const STAGES = ["LEAD","PROSPECT","APPROVED","COMPLETED","INVOICED","ARCHIVE"] as const;

export default function CustomersClient({ initial = [] as ContactCard[] }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string | null>(null); // null => all

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return initial.filter((c) => {
      const latest = c.leads[0];
      const stage = (latest?.stage || '').toUpperCase();
      const inStage = active ? active === stage : true;
      if (!inStage) return false;
      if (!needle) return true;
      const hay = [c.name, c.email || '', c.phone || '', latest?.property?.address1 || ''].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [initial, q, active]);

  const selectStage = (s: string | null) => setActive(s);
  const allOn = active===null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <div className="w-full max-w-sm">
          <Input placeholder="Search customers…" value={q} onChange={(e)=>setQ(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={()=>selectStage(null)} className={`px-2 py-1 text-xs rounded border ${allOn? 'bg-sky-600 text-white border-sky-600':'bg-white'}`}>All</button>
        {STAGES.map(s => (
          <button key={s} onClick={()=>selectStage(s)} className={`px-2 py-1 text-xs rounded border ${active===s? 'bg-sky-600 text-white border-sky-600':'bg-white'}`}>{prettyStage(s)}</button>
        ))}
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => {
          const latest = c.leads[0];
          const stage = (latest?.stage||'').toUpperCase();
          const base = (latest as any)?.contractPrice ?? null;
          const extrasRaw = (latest as any)?.extrasJson || '[]';
          const extrasSum = (()=>{ try { const arr = JSON.parse(extrasRaw); return Array.isArray(arr)? arr.reduce((s:number,x:any)=> s + (x && typeof x==='object'? Number(x.price||0):0),0):0 } catch { return 0 } })();
          const total = base!==null ? base + extrasSum : null;
          return (
            <Card key={c.id}>
              <CardHeader className="p-0">
                <div className="px-4 py-3 rounded-t-xl bg-gradient-to-r from-sky-700 via-sky-600 to-blue-500">
                  <CardTitle className="flex items-center justify-between text-white">
                    <span className="flex items-center gap-2 font-semibold">
                      {c.name}
                      <FlagPicker contactId={c.id} initial={c.flagColor ?? null} />
                    </span>
                    <Link href={`/customers/${c.id}`} className="text-sm underline underline-offset-2">View</Link>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-slate-700 space-y-1">
                <div>{c.email ? <a href={`mailto:${c.email}`} className="text-blue-700 hover:underline">{c.email}</a> : "—"}</div>
                <div>{c.phone ? <a href={`tel:${normalizeTel(c.phone)}`} className="text-blue-700 hover:underline">{formatPhone(c.phone)}</a> : "—"}</div>
                <div>Address: {latest?.property?.address1 ?? "—"}</div>
                {stage==='APPROVED' && base!==null && (
                  <div className="text-xs mt-1">
                    <span className="font-medium">Approved:</span> ${base.toFixed(0)}{extrasSum>0 && <> + Extras ${extrasSum.toFixed(0)} = <span className="font-semibold">${total!.toFixed(0)}</span></>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function normalizeTel(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return digits;
}

function prettyStage(s: string) {
  const map: Record<string, string> = { LEAD: 'Leads', PROSPECT: 'Prospects', APPROVED: 'Approved', COMPLETED: 'Completed', INVOICED: 'Invoiced', ARCHIVE: 'Archive' };
  return map[s] || s;
}
