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
