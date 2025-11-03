# Mobile Mission Fetch Example (React Native / TypeScript)

This example demonstrates how a future mobile field app could fetch and parse a Drone Mission export JSON from the web backend and prepare it for DJI Mobile SDK mission construction.

> NOTE: This is **illustrative only**; it does not execute a real DJI mission.

## Steps

1. Authenticate user (token / session cookie) – omitted here.
2. Fetch mission export: `GET /api/drone-missions/{id}/export`.
3. Parse JSON, map waypoints to your internal mission structure.
4. Build DJI SDK mission objects (platform-specific – pseudocode here).
5. Present preflight summary (altitude, est photos, path length).
6. Execute mission and capture images.
7. Upload images tagged with mission ID.

## TypeScript Helper

File: `missionClient.ts`

```
export interface ExportedMissionWaypoint {
  order: number;
  lat: number;
  lng: number;
  altitudeFt: number | null;
  gimbalPitchDeg?: number | null;
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
  const res = await fetch(`${baseUrl}/api/drone-missions/${missionId}/export`, { headers: { 'Accept': 'application/json', ...(authHeaders||{}) } });
  if (!res.ok) throw new Error(`Failed export fetch (${res.status})`);
  const data = await res.json();
  return data as ExportedMission;
}

export function toMeters(feet: number | null): number | null { return feet == null ? null : feet * 0.3048; }
```

## React Native Usage (Pseudo)

```
import React, { useEffect, useState } from 'react';
import { View, Text, Button, ActivityIndicator, FlatList } from 'react-native';
import { fetchMission, toMeters, ExportedMission } from './missionClient';

export const MissionScreen = ({ missionId }: { missionId: string }) => {
  const [mission, setMission] = useState<ExportedMission | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchMission('https://your-crm.example.com', missionId)
      .then(m => { setMission(m); setError(null); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [missionId]);

  if (loading) return <ActivityIndicator />;
  if (error) return <Text>Error: {error}</Text>;
  if (!mission) return <Text>No mission.</Text>;

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontWeight: '600', fontSize: 18 }}>{mission.title}</Text>
      <Text>Altitude: {mission.altitudeFt} ft ({toMeters(mission.altitudeFt)?.toFixed(1)} m)</Text>
      <Text>Waypoints: {mission.waypoints.length}</Text>
      <Text>Est Photos: {mission.photoCountEst ?? '—'}</Text>
      <FlatList data={mission.waypoints} keyExtractor={w => String(w.order)} renderItem={({ item }) => (
        <View style={{ paddingVertical: 4 }}>
          <Text>#{item.order}  {item.lat.toFixed(6)}, {item.lng.toFixed(6)}  Alt: {item.altitudeFt ?? mission.altitudeFt} ft</Text>
        </View>
      )} />
      <Button title="Build DJI Mission" onPress={() => {/* map to DJI SDK objects here */}} />
    </View>
  );
};
```

## Mapping to DJI SDK (Conceptual)

- Convert each waypoint to DJI `WaypointV2` with coordinate + altitude.
- Set global mission altitude if per-waypoint altitude is null.
- Insert camera action: capture photo at each waypoint OR configure interval capture based on speed & overlap.
- Validate gimbal pitch: use mission.pitchDeg or per-waypoint gimbalPitchDeg.

## Uploading Captured Images

Recommended pattern:

- After capture, push images to a dedicated endpoint: `POST /api/uploads?missionId=...`.
- Include JSON body/fields with: missionId, sequence number, original filename, checksum (MD5/SHA256), optional EXIF subset.
- Server links uploads to mission for downstream processing.

## Preflight Checklist Suggestions

- Battery level & estimated duration
- Home point locked
- GPS signal strong (>=10 sats)
- Compass OK / no calibration needed
- Altitude & NFZ validation (future)

## License

MIT
