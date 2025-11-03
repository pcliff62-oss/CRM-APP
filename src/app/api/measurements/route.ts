import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  // Backward compatibility: if polygons provided, synthesize GeoJSON FeatureCollection
  let geojson = body.geojson;
  if (!geojson && Array.isArray(body.polygons)) {
    const features = body.polygons.filter((p: any) => Array.isArray(p.path) && p.path.length >= 3).map((p: any) => {
      const ring = [...p.path, p.path[0]]; // close ring
      return {
        type: 'Feature',
        properties: { id: p.id },
        geometry: { type: 'Polygon', coordinates: [ring.map((pt: any) => [pt.lng, pt.lat])] }
      };
    });
    geojson = JSON.stringify({ type: 'FeatureCollection', features });
  }
  const measurement = await prisma.measurement.create({
    data: {
      tenantId: "demo-tenant",
      geojson,
      totalSquares: body.totalSquares,
      totalPerimeterFt: body.totalPerimeterFt,
      wasteFactor: body.wasteFactor
    }
  });
  return NextResponse.json(measurement);
}

export async function GET() {
  const list = await prisma.measurement.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(list);
}
