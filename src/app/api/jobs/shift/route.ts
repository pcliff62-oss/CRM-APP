import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getCurrentTenantId } from '@/lib/auth'

function isJob(a: any): boolean {
  return !!a.allDay || /^JOB:\s*/i.test(String(a.title||'')) || !!a.jobStatus || !!a.squares || !!a.crewId;
}

export async function POST(req: NextRequest) {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 });
  const body = await req.json().catch(()=>({}))
  const days = Number(body?.days ?? 0)
  if (!Number.isFinite(days) || days === 0) return NextResponse.json({ ok:false, error:'days must be non-zero' }, { status:400 })
  const today = new Date(); today.setHours(0,0,0,0);
  const todayIso = today.toISOString().slice(0,10);
  // Load future all-day jobs (start after today)
  const appts = await prisma.appointment.findMany({
    where: { tenantId, allDay: true, start: { gt: today } },
    select: { id:true, start:true, end:true, title:true, jobStatus:true, crewId:true, squares:true }
  });
  const jobs = appts.filter(isJob);
  if (jobs.length === 0) return NextResponse.json({ ok:true, shifted:0, totalFuture:0 });
  const deltaDays = Math.round(days);
  const addDays = (d: Date, n: number) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
  let count = 0;
  for (const j of jobs) {
    const nextStart = addDays(new Date(j.start), deltaDays);
    // Prevent backward shift into today or earlier
    if (deltaDays < 0) {
      const nextIso = nextStart.toISOString().slice(0,10);
      if (nextIso <= todayIso) continue;
    }
    const nextEnd = addDays(new Date(j.end), deltaDays);
    await prisma.appointment.update({ where: { id: j.id }, data: { start: nextStart, end: nextEnd } });
    count++;
  }
  return NextResponse.json({ ok:true, shifted: count, totalFuture: jobs.length, days: deltaDays });
}
