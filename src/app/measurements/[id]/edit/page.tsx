import prisma from '@/lib/db';
import NaivePolygonEditor from '@/components/drone/NaivePolygonEditor';

export default async function MeasurementEditPage({ params }: { params: { id: string } }) {
  const m = await prisma.measurement.findUnique({ where: { id: params.id } });
  if (!m) return <div className="p-4">Not found</div>;
  const fc = JSON.parse(m.geojson || '{"type":"FeatureCollection","features":[]}');
  const features = fc.features || [];
  const src = m.sourceImagePath || '';
  const edgeTotalsFt = fc?.properties?.edgeTotalsFt || null;
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Adjust roof polygons</h1>
      {src ? (
        <NaivePolygonEditor
          measurementId={m.id}
          imageSrc={src}
          initialFeatures={features}
          initialEdgeTotalsFt={edgeTotalsFt}
          initialSquares={typeof m.totalSquares === 'number' ? m.totalSquares : null}
          initialPerimeterFt={typeof m.totalPerimeterFt === 'number' ? m.totalPerimeterFt : null}
        />
      ) : (
        <div className="text-sm text-muted-foreground">No source image path was stored.</div>
      )}
    </div>
  );
}
