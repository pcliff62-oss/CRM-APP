# HyTech Mobile (iOS First) – DJI Integration Plan

App Key (provided): `17ac0b824d8c388e714dfb0b` (DO NOT COMMIT in production – move to build secrets).

Target Platforms Phase 1: iOS (React Native).  
Hardware: Phantom 4 Pro (MSDK 4.x), Mini 4 Pro (requires MSDK 5.x – see notes below).

## Bundle / Naming

- Bundle Identifier: `com.hytech.field` (dev) / `com.hytech.field.prod` (prod optional)
- Display Name: `HyTech Field`

## High-Level Architecture

```
mobile/
  bridge/
    DjiBridge.ts          # TypeScript facade
  screens/
    MissionPicker.tsx
    MissionBrief.tsx
    FlightScreen.tsx
  services/
    missionClient.ts      # reuse from examples
    telemetryQueue.ts
    uploader.ts
  store/
    missionStore.ts
```

Native (iOS):

```
ios/
  HyTechField/
    AppDelegate.m/.swift
    DjiBridge.m           # RCTEventEmitter subclass
    Info.plist            # DJISDKAppKey placeholder reference
    Config/Dev.xcconfig   # DJISDK_APP_KEY=... (excluded from VCS)
```

## DJI SDK Version Strategy

- P4 Pro: DJI Mobile SDK 4.16.4 (CocoaPods `DJISDK`)
- Mini 4 Pro: NOT supported by 4.x; needs MSDK 5.x (different API surface).  
  Approach: Ship v1 with 4.x only; detect unsupported model and show message: _"Mini 4 Pro support coming – connect Phantom 4 Pro."_  
  Later: Add conditional compilation and a second bridge for MSDK 5 when dual support required.

## Initialization Flow (iOS)

1. Load App Key from Info.plist (value references xcconfig var).
2. Register the SDK in `AppDelegate`:
   ```objc
   [[DJISDKManager registerAppWithDelegate:self];
   ```
3. Implement `-appRegisteredWithError:`; on success start product connection:
   ```objc
   [DJISDKManager startConnectionToProduct];
   ```
4. Emit JS event `dji:registered` / `dji:connected` when aircraft recognized.

## Permissions / Entitlements

- NSBluetoothAlwaysUsageDescription (some controllers)
- NSLocationWhenInUseUsageDescription (if using location overlay)
- NSPhotoLibraryAddUsageDescription (if saving to Photo Library – optional)
- Privacy - Camera / Microphone if needed (not for standard still capture from aircraft – handled by aircraft)

## Bridge Events (JS)

| Event               | Payload                                                                   |
| ------------------- | ------------------------------------------------------------------------- | ------ |
| dji:registered      | { success: boolean, error?: string }                                      |
| dji:productChanged  | { model: string                                                           | null } |
| dji:telemetry       | { ts, lat, lng, altAGL, altMSL, heading, gimbalPitch, speed, batteryPct } |
| dji:photoTaken      | { fileName }                                                              |
| dji:missionProgress | { waypointIndex, total, status }                                          |
| dji:missionComplete | { success: boolean, error?: string }                                      |

## Bridge Methods (JS Signature)

```
interface IDjiBridge {
  register(): Promise<boolean>;
  connect(): Promise<void>;
  loadMission(m: ExportedMission): Promise<void>; // translates to native waypoint mission
  startMission(): Promise<void>;
  pauseMission(): Promise<void>;
  resumeMission(): Promise<void>;
  abortMission(): Promise<void>; // stop & hover
  returnToHome(): Promise<void>;
  setGimbalPitch(deg: number): Promise<void>;
}
```

## Mission Translation (P4 Pro / MSDK 4.x)

- Each waypoint → `DJIWaypoint` with coordinate + altitude.
- Set `headingMode` to `DJIWaypointMissionHeadingAuto`.
- Photo capture: configure `shootPhotoTimeInterval` = null and instead add `DJIWaypointActionShootPhoto` at each waypoint (ensures capture even if slowdown occurs).
- Gimbal pitch: optional action list per waypoint (or global pre-mission adjustment).
- Speed: set mission max flight speed (e.g., 5 m/s) and auto flight speed (same initial).

## Mini 4 Pro Caveat

MSDK 5 (Beta / different API). Until integrated: show unsupported dialog if model detection returns Mini 4 Pro (M4P). Provide link to internal help doc.

## Telemetry Batch Strategy

- Collect 1 Hz; queue locally.
- Every 5 sec send `POST /api/missions/{id}/telemetry` with array of points.
- Retry offline; mark unsent in SQLite.

## Photo Upload Strategy

- Receive native photo path (SDK stored on device SD card). Copy to app sandbox if needed.
- Immediately stream multipart upload with headers:
  - `X-Mission-ID`
  - `X-Sequence`
  - `X-Checksum` (SHA256)
- On success mark uploaded; on failure queue.

## Required Server Endpoints (to implement later)

```
POST /api/missions/:id/telemetry     # [{ts,lat,lng,altAGL,altMSL,heading,gimbalPitch,speed,batteryPct}]
POST /api/missions/:id/photos        # multipart: photo + sequence + checksum
POST /api/missions/:id/events        # { type: START|PAUSE|RESUME|ABORT|COMPLETE|ERROR, ts, meta? }
```

## Environment / Config Example

`.env.mobile` (not committed):

```
DJI_APP_KEY=17ac0b824d8c388e714dfb0b
API_BASE=https://your-api-host
```

## Next Steps

1. Add native iOS project (React Native init).
2. Implement `DjiBridge` native module skeleton.
3. Translate exported mission JSON to waypoint mission (with per-waypoint photo action).
4. Add telemetry queue + uploader services.
5. Implement server telemetry & photo endpoints.
6. Add flight UI (connect → brief → start → progress → complete).

---

This file is a scaffold; native code still required.
