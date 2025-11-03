export interface ExportedMissionWaypoint {
  order: number;
  lat: number;
  lng: number;
  altitudeFt: number | null;
  gimbalPitchDeg?: number | null;
  gimbalYawDeg?: number | null;
}

export interface ExportedMission {
  id: string;
  title: string;
  platform: string;
  version: number;
  altitudeFt: number | null;
  frontOverlap: number | null;
  sideOverlap: number | null;
  captureMode: string | null;
  pitchDeg: number | null;
  photoCountEst: number | null;
  waypoints: ExportedMissionWaypoint[];
  path: any; // GeoJSON FeatureCollection
}

export async function fetchMission(baseUrl: string, missionId: string, authHeaders?: Record<string,string>): Promise<ExportedMission> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/drone-missions/${missionId}/export`, {
    headers: { 'Accept': 'application/json', ...(authHeaders||{}) }
  });
  if (!res.ok) throw new Error(`Failed mission export fetch (${res.status})`);
  return await res.json() as ExportedMission;
}

export function feetToMeters(feet: number | null): number | null { return feet == null ? null : feet * 0.3048; }
