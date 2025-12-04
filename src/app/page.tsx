import prisma from "@/lib/db";
import { sendEmail } from '@/lib/email';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import dynamic from "next/dynamic";

const WeatherWidget = dynamic(() => import('@/features/weather/WeatherWidget.jsx'), { ssr: false });
const TasksClient = dynamic(() => import('./dashboard/TasksClient'), { ssr: false });
const WeatherShiftTask = dynamic(() => import('./dashboard/WeatherShiftTask.jsx'), { ssr: false });

function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export default async function Page() {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const nextYear = new Date(new Date().getFullYear() + 1, 0, 1);
  const now = new Date();
  const in7 = new Date(now); in7.setDate(now.getDate() + 7);

  const [stageGroups, approvedSum, completedSum, invoicedSum, archivedYtdSum, appts, approvedLeads, tasksData, usersForDocs] = await Promise.all([
    prisma.lead.groupBy({ by: ['stage'], _count: { stage: true } }).catch(() => []),
    prisma.lead.aggregate({ where: { stage: 'APPROVED', contractPrice: { not: null } }, _sum: { contractPrice: true } }),
    prisma.lead.aggregate({ where: { stage: 'COMPLETED', contractPrice: { not: null } }, _sum: { contractPrice: true } }),
    prisma.lead.aggregate({ where: { stage: 'INVOICED', contractPrice: { not: null } }, _sum: { contractPrice: true } }),
    prisma.lead.aggregate({ where: { stage: 'ARCHIVE', contractPrice: { not: null }, updatedAt: { gte: yearStart, lt: nextYear } }, _sum: { contractPrice: true } }),
    prisma.appointment.findMany({ where: { start: { gte: now, lt: in7 } }, include: { lead: { include: { contact: true, property: true } }, user: true }, orderBy: { start: 'asc' } }),
  // Fetch all jobs via API so we reuse unified classification logic (jobOnly=1)
  // Fetch approved leads (pipeline Approved) for Upcoming Jobs section
  prisma.lead.findMany({ where: { stage: 'APPROVED' }, include: { contact: true, property: true }, orderBy: { updatedAt: 'desc' } }),
    fetch(`${API_BASE}/api/tasks`, { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
  prisma.user.findMany({ select: { id: true, name: true, email: true, docsJson: true } })
  ]);

  const STAGES: Array<{ key: string; label: string; color: string }> = [
    { key: 'LEAD', label: 'Leads', color: 'bg-amber-500' },
    { key: 'PROSPECT', label: 'Prospects', color: 'bg-orange-500' },
    { key: 'APPROVED', label: 'Approved', color: 'bg-lime-500' },
    { key: 'COMPLETED', label: 'Completed', color: 'bg-sky-500' },
    { key: 'INVOICED', label: 'Invoiced', color: 'bg-rose-500' },
    { key: 'ARCHIVE', label: 'Archive', color: 'bg-slate-500' }
  ];
  const counts: Record<string, number> = Object.fromEntries(STAGES.map(s => [s.key, 0]));
  for (const g of stageGroups as Array<{ stage: string|null; _count: { stage: number } }>) {
    const k = (g.stage || '').toUpperCase(); if (k) counts[k] = g._count.stage || 0;
  }
  const sums = {
    sold: Number(approvedSum?._sum?.contractPrice || 0),
    completed: Number(completedSum?._sum?.contractPrice || 0),
    invoiced: Number(invoicedSum?._sum?.contractPrice || 0),
    archivedYtd: Number(archivedYtdSum?._sum?.contractPrice || 0)
  };

  const rawTasks: any[] = Array.isArray((tasksData as any)?.items) ? (tasksData as any).items : (Array.isArray(tasksData) ? (tasksData as any[]) : []);
  const tasksBase = rawTasks.map(t => ({ id: String(t?.id || ''), title: String(t?.title || ''), dueDate: typeof t?.dueDate === 'string' ? t.dueDate : undefined, status: String(t?.status || '').toLowerCase() }));
  // Add document tasks: expiring soon (<=14 days) and expired. Use mm/dd/yyyy formatting.
  const fmtDate = (iso: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(iso).toLocaleDateString('en-US');
    const [y,m,d] = iso.split('-');
    return `${m}/${d}/${y}`;
  };
  const docTasks: any[] = [];
  for (const u of usersForDocs as Array<{ id: string; name: string; email: string; docsJson: string|null }>) {
    if (!u.docsJson) continue;
    let docs: any[] = []; try { docs = JSON.parse(u.docsJson); } catch { continue; }
    let mutated = false;
    for (const d of docs) {
      if (!d?.expires) continue;
      const exp = new Date(d.expires + 'T00:00:00');
      const diffDays = Math.ceil((exp.getTime() - now.getTime())/86400000);
      const pretty = fmtDate(d.expires);
      if (diffDays < 0) {
        // Expired task
        docTasks.push({ id: `doc-expired-${u.id}-${d.type}`, title: `${u.name} ${d.type.replace('_',' ')} has expired on: ${pretty}`, dueDate: d.expires });
      } else if (diffDays <= 14) {
        docTasks.push({ id: `doc-expiring-${u.id}-${d.type}`, title: `${u.name} ${d.type.replace('_',' ')} is expiring on ${pretty}`, dueDate: d.expires });
        if (!d.notifiedExpiringAt && u.email) {
          const subject = `Document Expiring Soon: ${d.type.replace('_',' ')}`;
          const body = `Hello ${u.name},\n\nYour document '${d.type.replace('_',' ')}' is expiring on ${pretty}. Please update it.\n\nThanks.`;
          await sendEmail(u.email, subject, body);
          d.notifiedExpiringAt = new Date().toISOString();
          mutated = true;
        }
      }
    }
    // Persist notification flags if modified
    if (mutated) {
      try { await prisma.user.update({ where:{ id: u.id }, data: { docsJson: JSON.stringify(docs) } }); } catch {}
    }
  }
  const tasks = [...docTasks, ...tasksBase];

  const isJob = (a: any) => !!a.allDay || /^JOB:\s*/i.test(String(a.title||'')) || !!a.crewId || (typeof a.squares === 'number' && isFinite(a.squares) && a.squares > 0);
  const upcomingAppointments = (appts as any[]).filter(a => !isJob(a));
  // Approved leads list (acts as Upcoming Jobs)
  const upcomingJobs = (approvedLeads as any[]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Pipeline bubbles */}
      <div className="md:col-span-3">
        <div className="flex flex-wrap gap-3 items-center">
          {STAGES.map(s => (
            <Link key={s.key} href={`/leads#stage-${s.key.toLowerCase()}`} className="flex items-center gap-2 px-3 py-2 rounded-full border bg-white shadow-sm hover:shadow-md transition" aria-label={`View ${s.label} in pipeline`}>
              <span className="text-xs font-medium text-slate-600">{s.label}</span>
              <span className={`inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full text-white text-sm font-semibold ${s.color}`}>{counts[s.key] || 0}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Finances */}
      <Card className="md:col-span-3">
        <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-xl">
          <CardTitle className="text-white">Finances</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MoneyStat label="Sold Jobs" value={sums.sold} />
            <MoneyStat label="Completed Jobs" value={sums.completed} />
            <MoneyStat label="Invoiced Jobs" value={sums.invoiced} />
            <MoneyStat label={`YTD Archived (${new Date().getFullYear()})`} value={sums.archivedYtd} />
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Appointments */}
      <Card>
        <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-xl">
          <CardTitle className="text-white">Upcoming Appointments</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingAppointments.length === 0 ? (
            <div className="text-slate-500 text-sm">No appointments in the next 7 days.</div>
          ) : (
            <ul className="divide-y">
              {upcomingAppointments.map((a: any) => {
                const start = new Date(a.start);
                const end = a.end ? new Date(a.end) : undefined;
                const day = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                const time = `${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}${end ? ` - ${end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}`;
                const raw = String(a.title || '');
                const title = raw.replace(/^\s*(Appt:|Appointment:)\s*/i, '').trim();
                const name: string = a.lead?.contact?.name || '';
                const city: string = a.lead?.property?.city || '';
                let work: string = (a.lead?.title || '').toString().trim() || title;
                if (name && work) {
                  const rx = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
                  work = work.replace(rx, '').replace(/\bfor\s+$/i, '').replace(/\s{2,}/g, ' ').trim();
                  work = work.replace(/\s*-\s*$/g, '').trim();
                }
                if (city && work) {
                  const rxCity = new RegExp(`\\b${escapeRegExp(city)}\\b`, 'i');
                  work = work.replace(rxCity, '').replace(/\s{2,}/g, ' ').trim();
                }
                const sub = [work, city].filter(Boolean).join(' ');
                return (
                  <li key={a.id} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <div className="text-xs font-semibold text-sky-700 mt-0.5 min-w-[8ch]">{day}</div>
                      <div>
                        {name ? <div className="font-medium text-slate-800">{name}</div> : null}
                        {sub ? <div className="text-xs text-slate-500">{sub}</div> : null}
                        <div className="text-xs text-slate-500">{time}</div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-600">{a.user?.name || 'Unassigned'}{a.user?.email ? ` (${a.user.email})` : ''}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Jobs */}
      <Card>
        <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-xl">
          <CardTitle className="text-white">Upcoming Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingJobs.length === 0 ? (
            <div className="text-slate-500 text-sm">No approved leads.</div>
          ) : (
            <ul className="divide-y">
              {upcomingJobs.slice(0,6).map((l: any) => {
                const name: string = l.contact?.name || l.title || 'Lead';
                const price: number | null = typeof l.contractPrice === 'number' && !isNaN(l.contractPrice) ? l.contractPrice : null;
                const addr: string = l.property?.address1 || '';
                const contactId: string | null = l.contact?.id || null;
                const inner = (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-800 truncate">{name}</div>
                      {price != null && <div className="text-xs font-semibold text-emerald-600">${price.toLocaleString()}</div>}
                      {addr && <div className="text-xs text-slate-500 truncate">{addr}</div>}
                    </div>
                    <span className="ml-auto inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full bg-emerald-500 text-white text-xs font-semibold">Approved</span>
                  </>
                );
                return (
                  <li key={l.id} className="py-2">
                    {contactId ? (
                      <Link href={`/customers/${contactId}`} className="flex items-start gap-3 hover:bg-slate-50 rounded-md px-2 py-2 transition" aria-label={`Open contact card for ${name}`}>
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-start gap-3">
                        {inner}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

    {/* Tasks (moved to right) */}
      <Card>
        <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-xl">
          <CardTitle className="text-white">Tasks</CardTitle>
        </CardHeader>
        <CardContent>
      <div className="flex flex-col gap-3">
        <WeatherShiftTask />
        <TasksClient tasks={tasks} />
      </div>
        </CardContent>
      </Card>

      {/* Weather Forecast (moved to bottom) */}
      <Card className="md:col-span-2">
        <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-xl">
          <CardTitle className="text-white">Weather Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Client-only widget renders here and can trigger job shifting */}
          <WeatherWidget />
        </CardContent>
      </Card>
    </div>
  );
}

function MoneyStat({ label, value }: { label: string; value: number }) {
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase mb-1">{label}</div>
      <div className="text-2xl font-semibold">{fmt.format(value || 0)}</div>
    </div>
  );
}
