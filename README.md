# HyTech Roofing CRM Starter (Next.js 14 + Tailwind + Prisma + MapLibre)

A minimal, good-looking, **functioning UI** that combines:

- **CRM** (leads, contacts, properties)
- **DIY Roof Measurements** (draw roof facets, add pitch, compute squares)
- **Proposals** (templates + token merge preview)

> Built for quick iteration in **VS Code**.

## Quick Start

```bash
# 1) Install deps
npm install

# 2) Init DB (SQLite) & seed
npx prisma migrate dev --name init
npm run seed

# 3) Run
npm run dev
```

Open http://localhost:3000

## Map config

By default, we use MapLibre's public demo tiles (no token needed). You can override with your own style URL:

Create `.env.local`:

```
NEXT_PUBLIC_MAP_STYLE=https://demotiles.maplibre.org/style.json
```

## Tech

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Prisma + SQLite (swap to Postgres by changing the `DATABASE_URL`)
- MapLibre GL + mapbox-gl-draw + turf.js
- Lightweight proposal templating (handlebars-like `{{token}}`)

## Scripts

- `npm run dev` — start dev server
- `npm run build` — build
- `npm run seed` — seed demo data
- `npm run lint` — lint
- `npm run prisma:studio` — open Prisma studio

## Notes

- This starter is multi-tenant-ready (simple `tenantId` field). Add auth later (e.g., NextAuth or Supabase).
- Proposal PDFs: start with in-browser print-to-PDF. Swap later to server PDF rendering if needed.

### Pricing Breakdown (Approved + Extras)

The customer contact card displays the approved contract price plus any extras line items. Extras are sourced from:

1. `Lead.extrasJson` (sales-managed pre-job additions)
2. Latest job `Appointment.extrasJson` (crew-added during job)

Helper: `pricingBreakdownForLead(leadId)` in `src/lib/jobs.ts` returns `{ contractPrice, extras[], extrasTotal, grandTotal }`.
Pipeline Approved column shows subtotal (contract + extras). A small polling client component keeps the banner current when field app updates occur.

## Map Component

Google Maps satellite view is used for each property. A Street View toggle button now appears (if coverage exists within ~50m of the geocoded coordinate). Button states:

- Street View: switches to immersive panorama (disabled if no panorama found)
- Map View: returns to the satellite map

To ensure the key loads client-side, set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local`.

## Appointments from Customer Page

On a contact's detail page you can now create an Appointment directly using the "Create Appointment" button beneath the property map. The modal lets you:

- Enter title, start & end (local timezone)
- Optionally assign to a user in the tenant
- Add notes (stored as `description`)

Appointments post to `/api/appointments` and appear on the calendar view automatically (no manual refresh needed after navigation).

## Drone Scan (Beta)

Plan aerial photo capture missions for future orthomosaic + roof metric generation. Current beta includes:

- Mission planner (draw polygon, set altitude, overlaps, pitch)
- Automatic lawn‑mower waypoint generation & photo estimate
- Persistence (DroneMission + DroneWaypoint) & JSON export endpoint
- Optional placeholder processing job queue (no real stitching yet)

Not yet included: actual DJI flight execution, real photogrammetry, or results visualization.

See full documentation: `docs/DRONE_SCAN.md`

---

Field App (experimental, from jesse-upload)

This repository also includes a Vite-based mobile/field app prototype intended to run alongside the CRM and call its APIs.

Backend (local dev)

This prototype includes a minimal Express + TypeScript backend (server/) that proxies storage operations to Google Cloud Storage. It is intended for local development only and reads credentials from environment variables.

Required environment variables (set in your shell or a .env file inside /server):

- GCS_PROJECT_ID
- GCS_BUCKET
- GCS_CLIENT_EMAIL
- GCS_PRIVATE_KEY (paste the JSON private_key value; if it contains literal "\n" sequences they will be normalized)

Run locally:

1. Start the backend in one terminal:

```bash
cd server
npm install
npm run dev
```

2. Start the front-end in another terminal (root):

```bash
npm run dev
```

The field app may also use `VITE_API_BASE` for calling a deployed API; set it in `.env.local` or `.env`.

## Company Info Management

Admins can now manage tenant-level company details under Settings > Company Info:

- Name, phone, email
- Address (lines 1 & 2, city, state, postal)
- Logo upload (stored via existing `/api/upload` endpoint; path saved as `logoPath` on `Tenant`)
- Licenses: dynamic list of `{ type, number, expires }` entries

API:

- `GET /api/company` returns `{ ok, item }`
- `PUT /api/company` (ADMIN only) updates fields; validates email & phone formats

Database additions (Prisma `Tenant` model): `phone`, `email`, `address1`, `address2`, `city`, `state`, `postal`, `logoPath`, `licensesJson`.

Licenses are stored as JSON array in `licensesJson` and surfaced to the UI as editable rows.

### Edit Mode & License Expiration

- The Edit button only appears after initial data finishes loading to avoid editing stale placeholders.
- Each license shows a status badge:
  - `Expired` (red) when the expiration date is past.
  - `Expiring (Nd)` (amber) when within 30 days.
  - `Valid` (green) otherwise.
- Badges update live as you change dates in edit mode.

## AI Auto-Detect (Roof Planes)

Experimental feature lets an external AI worker propose roof polygons automatically when opening the measurement tool.

### Setup

1. Run / deploy the Python worker in `ai_worker/` (FastAPI):

```bash
cd ai_worker
python -m venv .venv-ai-worker
source .venv-ai-worker/bin/activate
pip install -r requirements.txt
python main.py  # starts on :8089 by default
```

2. Configure the CRM to reach it by adding to `.env.local` (or environment):

```
AI_WORKER_URL=http://localhost:8089
```

3. Restart `npm run dev` so Next.js picks up the variable.

### Using

Inside the measurement UI (polygon editor):

- Click `AI Detect` to fetch predictions (`/api/measurements/:id/auto-detect`). Existing AI predictions are replaced; manual polygons are preserved.
- Click `Clear AI` to remove only AI predicted polygons (those with `properties.source === 'ai'`).
- Click `Save` after making corrections; the client sends a diff of changed geometry / edge labels to `/api/measurements/:id/ai-feedback` for future model improvement.

### Endpoints

- `POST /api/measurements/:id/auto-detect` -> `{ features: Feature[], raw }`
- `POST /api/measurements/:id/ai-feedback` -> `{ ok, count }`
- `GET  /api/measurements/:id/ai-feedback` (dev only) -> collected feedback records

### Feature Object Shape (subset)

```ts
interface Feature {
  type: "Feature";
  properties: {
    id?: string;
    pitch?: number; // initial guess (default 6/12)
    edges?: { i: number; type: string }[]; // all initially 'unknown'
    source?: "ai"; // present only for AI predicted facets
    layerId?: string;
  };
  geometry: { type: "Polygon"; coordinates: number[][][] }; // single outer ring
}
```

### Feedback Diff Logic

On save, the editor compares every original AI facet (geometry hash + edge labels) with the current non-ai facets. If a corresponding facet's geometry or any edge label changed, a record is posted containing:

```json
{
  "aiFeatureId": "P1",
  "geometryChanged": true,
  "edgeDiff": [ { "i": 0, "from": "unknown", "to": "eave" } ],
  "updatedFeature": { ...full feature object... }
}
```

These corrections will seed a future training pipeline (not implemented here). Replace the in-memory store with a persistent table for production.

### Improving the Worker

The current worker uses heuristic segmentation (GrabCut + vegetation masking + Hough line splits + contour polygonization). For higher accuracy you can:

- Integrate a roof plane segmentation model (Mask R-CNN / Segment Anything + post-processing).
- Add line refinement to merge nearly collinear edges and orthogonal snapping.
- Predict edge types with a small classifier using angle + adjacency context.

### Safety / Fallbacks

If the worker or env var is missing, `AI Detect` returns an error and no polygons are added; manual drawing continues unaffected.

## Weather Forecast & Auto Job Shifting

The dashboard now includes a Weather Forecast widget (toggle via the Weather Forecast tile). It shows a 10-day precipitation probability based on the company ZIP set in Settings > Company Info.

Data Source:

- Geocoding: zippopotam.us (ZIP -> lat/lon)
- Forecast: open-meteo.com daily precipitation probability, temperature highs/lows, weather code.

Highlighting:

- Days with ≥70% precipitation probability are highlighted.

Auto-Shift Logic:

- API endpoint: `POST /api/weather/shift-jobs`
- Loads 10-day forecast and shifts any upcoming all-day job appointments (title starts with `JOB` or has `jobStatus`) whose start date has ≥70% precipitation probability.
- Shifts forward one day at a time until the start date precipitation probability is below threshold or forecast horizon is exceeded.
- Non-job appointments are never moved.

Manual Trigger:

You can invoke the shift manually (e.g., from a scheduled job or script) by POSTing to the endpoint after authentication cookies are present:

```
fetch('/api/weather/shift-jobs', { method: 'POST' })
  .then(r => r.json())
  .then(console.log);
```

Future Enhancements:

- Add UI button in WeatherWidget for on-demand shift.
- Persist shift audit log entries.
- Allow custom threshold per tenant.
