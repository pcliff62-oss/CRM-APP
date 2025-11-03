# Drone Scan (Beta)

This feature lets you plan aerial photo capture missions for a Phantom 4 Pro (or similar) to generate orthomosaics and roof measurements in a future processing pipeline. Current implementation covers mission planning, storage, export, and a placeholder processing job queue — it does NOT yet perform autonomous flight or real photogrammetry stitching.

## Overview

1. User opens a contact's page and clicks **Drone Scan**.
2. Planner modal opens with a map: draw (or adjust) the target polygon.
3. Adjust flight params (altitude, overlaps, capture mode, gimbal pitch, etc.).
4. Generate lawn‑mower style waypoint path preview.
5. (Optional) Enable automatic processing job creation.
6. Save mission: persists to DB (DroneMission + DroneWaypoint) and (optionally) queues a ProcessingJob.
7. Mobile field app (future) pulls export JSON to execute flight via DJI SDK.
8. Processing provider (future) ingests imagery and generates orthomosaic + metrics returned to UI.

## Data Models (Prisma)

- **DroneMission**: altitudeFt, frontOverlap, sideOverlap, captureMode, pitchDeg, pathGeoJson, photoCountEst, status, notes, relations (tenant, property, contact, lead), waypoints, telemetry, events, photos.
- **DroneWaypoint**: order, lat, lng, altitude, gimbalPitchDeg, gimbalYawDeg, mission relation.
- **MissionTelemetry**: ts, lat, lng, altAGL, altMSL, heading, gimbalPitch, speedMS, batteryPct (indexed by missionId+ts).
- **MissionEvent**: ts, type (START|PAUSE|RESUME|ABORT|COMPLETE|ERROR|RTH|PHOTO), meta JSON blob.
- **File (photos)**: missionId association for captured imagery (category="photos", folder="Mission Photos").
- **ProcessingJob**: provider (GENERIC placeholder), status (QUEUED→RUNNING→DONE/ERROR), inputJson/outputJson.

## Planner UI Fields

| Field              | Purpose                         | Notes                                           |
| ------------------ | ------------------------------- | ----------------------------------------------- |
| Altitude (ft)      | Flight AGL altitude             | Impacts footprint & photo estimate              |
| Front Overlap (%)  | Forward image overlap           | Affects lateral spacing vs. direction of travel |
| Side Overlap (%)   | Cross-track overlap             | Affects lane spacing                            |
| Capture Mode       | Nadir / Oblique (stub)          | Adjusts photo estimate multiplier               |
| Gimbal Pitch (deg) | Camera tilt                     | 0 = level horizon, -90 = straight down          |
| Auto Processing    | Queue placeholder ProcessingJob | Uses provider=GENERIC                           |

## Waypoint Generation

A lawn‑mower (boustrouphedon) path:

1. Compute polygon bounding box.
2. Derive ground sampling footprint from altitude & assumed sensor FOV (simplified constant).
3. Calculate lane spacing = footprintWidth \* (1 - sideOverlap).
4. Sweep alternating east/west (or similar) lines across bounds clipped to polygon.
5. Insert waypoints at ends of each lane (and optional midpoints if needed for capture rate control — future).

Edge cases handled:

- Degenerate polygon (<3 points) → generation disabled.
- Overly small area vs. altitude causing zero lanes → warns user.

## Photo Count Estimation

Simplified: (area / single_photo_ground_footprint) _ overlap_multiplier _ mode_multiplier. Displayed as an approximate planning aid, not an exact capture count.

## GeoJSON Storage

`pathGeoJson` stores a FeatureCollection:

- Polygon: the user‑drawn AOI.
- LineString: ordered waypoint path (same sequence as DroneWaypoint order).

## API Endpoints

| Endpoint                                      | Method | Description                                                                                                                                   |
| --------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- | ------- | ---------- | ------- | ------------------------------------------------------- |
| `/api/drone-missions`                         | POST   | Create mission (& waypoints). Accepts parameters + polygon + waypoints + photoCountEst + pitchDeg                                             |
| `/api/drone-missions`                         | GET    | List missions (scoped to tenant)                                                                                                              |
| `/api/drone-missions/[id]/export`             | GET    | Mission export JSON for mobile SDK consumption                                                                                                |
| `/api/drone-missions/[id]/telemetry`          | POST   | Batch ingest telemetry: `{ points: [{ ts?, lat, lng, altAGL?, altMSL?, heading?, gimbalPitch?, speedMS?, batteryPct? }] }` (max 500 per call) |
| `/api/drone-missions/[id]/events`             | POST   | Record lifecycle event `{ type: "START"                                                                                                       | "PAUSE" | "RESUME" | "ABORT" | "COMPLETE" | "ERROR" | "RTH", meta? }` updates mission.status where applicable |
| `/api/drone-missions/[id]/photos`             | POST   | Multipart photo upload (`file`, `sequence?`, `checksum?`) associates stored File with mission & emits PHOTO event                             |
| `/api/drone-missions/[id]/derive-measurement` | POST   | Compute area & perimeter from mission polygon and create a Measurement record                                                                 |
| `/api/processing-jobs`                        | POST   | Queue placeholder processing job (GENERIC)                                                                                                    |
| `/api/processing-jobs`                        | GET    | List jobs                                                                                                                                     |

### Mission Export JSON Shape (example)

```
{
  "id": "mission_uuid",
  "title": "Customer Roof 2025-09-16",
  "platform": "phantom4pro",
  "version": 1,
  "altitudeFt": 200,
  "frontOverlap": 75,
  "sideOverlap": 70,
  "captureMode": "NADIR",
  "pitchDeg": -90,
  "photoCountEst": 140,
  "path": { /* FeatureCollection parsed from pathGeoJson */ },
  "waypoints": [
    { "order": 0, "lat": 42.123, "lng": -71.456, "altitudeFt": 200, "gimbalPitchDeg": -90 },
    ...
  ]
}
```

## Authentication & Multi-Tenancy

All mission and processing job operations are tenant-scoped via existing auth utilities. Ensure requests include a valid session; missions belong to the tenant derived from the user context.

## Mobile SDK Integration (Future)

1. Native app fetches `/api/drone-missions/{id}/export`.
2. Maps altitudeFt & waypoints to DJI WaypointV2 mission objects.
3. Inserts camera actions (photo capture) at interval or per‑waypoint.
4. Executes mission (preflight checklist omitted in current scope).
5. Streams telemetry batches to `/api/drone-missions/{id}/telemetry` every 1–3 seconds (or 10–20 points per batch) to reduce HTTP overhead.
6. Sends lifecycle events (`START`, `PAUSE`, etc.) to `/api/drone-missions/{id}/events` (include contextual meta like battery, gpsSatellites later).
7. Uploads each captured JPEG (or burst) to `/api/drone-missions/{id}/photos` with `sequence` incrementing; optional `checksum` (MD5/SHA1) for integrity.

## Processing Pipeline (Future)

- Replace GENERIC placeholder with a real stitching service (e.g., hosted photogrammetry API or serverless pipeline).
- On completion, store orthomosaic URL + derived roof metrics into `ProcessingJob.outputJson` and associate to mission.
- Extend UI to display results (overlay mosaic, surface area, pitch map, etc.).

## Limitations / Known Gaps

- No direct drone control: mobile field app not included yet.
- No real photogrammetry; only a queued placeholder job record.
- Simplified estimation math (not accounting sensor exact FOV or aspect ratio).
- No wind / battery / NFZ validation.
- No path optimization (e.g., start point selection, rotation to align with longest polygon edge — potential improvement).

## Suggested Next Steps

1. Implement mobile app (React Native / native iOS) consuming export JSON & DJI SDK.
2. Add secure upload pipeline for mission imagery (with checksum + EXIF validation).
3. Integrate hosted photogrammetry service; update ProcessingJob lifecycle.
4. Add mission list UI & status indicators on customer page.
5. Enhance path generator: rotate sweep to minimize passes, dynamic camera interval based on overlap.
6. Compute accurate photo footprint from camera intrinsics + altitude.
7. Add edge/plane detection for roof facets (post‑processing step).

## NEXT_STEPS (Implementation Roadmap)

Short Term (1-2 sprints):

- Integrate mission list (done) and add status + last event / progress indicator.
- Validate mission geometry (non-self-intersecting polygon, altitude limits).
- Add simple mission live view (last telemetry point + count of photos) polling APIs.

Medium Term (3-5 sprints):

- Mobile field app with DJI SDK integration (mission execution + telemetry logging).
- External photogrammetry provider integration; update ProcessingJob worker to poll provider.
- Orthomosaic viewer overlay (tiled image or single high-res with pan/zoom + opacity slider).

Long Term (5+ sprints):

- Automated roof facet extraction & pitch map generation (ML or planar segmentation).
- Cost estimation auto-fill (material squares, waste factor, pitch adjustments).
- Mission optimization: polygon rotation, terrain-follow (DSM integration), battery-aware segmentation.

Architectural Considerations:

- Keep export JSON backward compatible; introduce `version` increments when altering structure.
- Use object storage (e.g., S3/GCS) for raw imagery; store only metadata & signed URLs in DB.
- Add background job queue (e.g., BullMQ / cloud tasks) for processing jobs and progress polling.

Security / Compliance:

- Enforce auth & RBAC (who can create / execute missions).
- Log flight plans & execution events for traceability.
- Future: integrate FAA LAANC / NFZ advisory API before mission execution (not in current scope).

## Developer Notes

- Adjusting schema: create a new migration (do NOT edit existing applied migrations) when adding fields like terrain-follow or camera interval.
- Keep mission export backwards compatible; bump `version` field when changing structure.
- Consider rate limiting mission creation to prevent DB bloat from experimental planning.

---

Status: Beta scaffold implemented (planning + persistence + export + telemetry/events/photo ingestion). Processing & advanced visualization layers pending.
