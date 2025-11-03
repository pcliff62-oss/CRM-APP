import prisma from '@/lib/db';
import MissionPhotoUploader from '@/components/drone/MissionPhotoUploader';
import NaiveMeasureUploader from '@/components/drone/NaiveMeasureUploader';
import Link from 'next/link';

export default async function MissionPhotosPage({ params }: { params: { id: string } }) {
  const mission = await prisma.droneMission.findUnique({
  where: { id: params.id },
  select: { id: true, title: true, tenantId: true, leadId: true, propertyId: true }
  });
  if (!mission) return <div className="p-4">Mission not found</div>;

  const photos = await prisma.file.findMany({
    where: { missionId: mission.id, category: 'photos' },
    orderBy: { createdAt: 'asc' }
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{mission.title} – Photos</h1>
        <div className="flex gap-2 text-sm">
          <Link className="underline" href={`/api/drone-missions/${mission.id}/photos/analyze`}>
            Analyze EXIF
          </Link>
          <Link className="underline" href={`/drone-missions/${mission.id}/orthomosaic`}>
            Orthomosaic
          </Link>
          {/* Satellite measurement now lives as the primary /measure flow; link from customer page */}
          {/* Start processing triggers a POST; simple forms */}
          <form action={`/api/drone-missions/${mission.id}/process/start`} method="post">
            <button className="underline" type="submit">Start (Default)</button>
          </form>
          <form action={`/api/drone-missions/${mission.id}/process/start`} method="post">
            <input type="hidden" name="provider" value="PIX4D" />
            <button className="underline" type="submit">Start with Pix4D</button>
          </form>
          <form action={`/api/drone-missions/${mission.id}/process/start`} method="post">
            <input type="hidden" name="provider" value="MAPWARE" />
            <button className="underline" type="submit">Start with Mapware</button>
          </form>
        </div>
      </div>

  {/* Uploaders */}
  <div className="grid md:grid-cols-2 gap-6">
    <MissionPhotoUploader missionId={mission.id} />
    <NaiveMeasureUploader leadId={mission.leadId || undefined} propertyId={mission.propertyId || undefined} />
  </div>

      {photos.length === 0 && (
        <div className="text-sm text-muted-foreground">No photos uploaded yet. Use the photos API to upload test images.</div>
      )}

  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {photos.map(p => (
          <div key={p.id} className="border rounded p-2">
            <div className="text-xs mb-2 truncate" title={p.name}>{p.name}</div>
    {/* Serve via proxy to avoid GCS public ACL issues */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/api/files/${p.id}`} alt={p.name} className="w-full h-auto rounded" />
            <div className="text-[10px] text-muted-foreground mt-1">{p.size ? `${(p.size/1024).toFixed(1)} KB` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
