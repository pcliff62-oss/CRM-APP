import prisma from '@/lib/db';
import StartOrtho from './start.client';

export default async function OrthoPage({ params }: { params: { id: string } }) {
  const mission = await prisma.droneMission.findUnique({ where: { id: params.id } });
  if (!mission) return <div className="p-4">Mission not found</div>;
  // Latest job (any provider) for context
  const latestJob = await prisma.processingJob.findFirst({ where: { missionId: mission.id }, orderBy: { createdAt: 'desc' } });
  // Prefer the latest LOCAL-MOSAIC job for mosaic rendering
  const mosaicJob = await prisma.processingJob.findFirst({ where: { missionId: mission.id, provider: 'LOCAL-MOSAIC' }, orderBy: { createdAt: 'desc' } });
  const output = mosaicJob?.outputJson ? JSON.parse(mosaicJob.outputJson) : null;
  const orthoUrl = output?.orthomosaicUrl as string | undefined;
  const mode = output?.mode as ('stitched'|'grid'|undefined);
  const stitchErr = output?.stitchErr as string | undefined;
  return (
    <div className="p-4 space-y-3">
      <h1 className="text-lg font-semibold">{mission.title} – Orthomosaic</h1>
  {!latestJob && <div className="text-sm text-muted-foreground">No processing job yet.</div>}
  <StartOrtho missionId={mission.id} />
      {latestJob && (
        <div className="text-sm">Latest job status: <span className="font-mono">{latestJob.status}</span>{latestJob.provider ? <span className="ml-2 text-xs text-slate-500">({latestJob.provider})</span> : null}</div>
      )}
      {orthoUrl ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={orthoUrl} alt="Orthomosaic" className="w-full h-auto rounded" />
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <span>Mode:</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded border ${mode==='stitched' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-50 border-slate-300 text-slate-800'}`}>{mode || 'unknown'}</span>
            {stitchErr && <span className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">{stitchErr}</span>}
          </div>
          {/* Measurement entry point has moved to the customer contact card */}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No orthomosaic URL available. Waiting for provider output.</div>
      )}
    </div>
  );
}
