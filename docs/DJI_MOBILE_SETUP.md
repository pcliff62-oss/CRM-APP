# DJI Mobile SDK Integration (HyTech Field)

App Key: (store securely) `17ac0b824d8c388e714dfb0b`

## Scope

- iOS first (React Native wrapper)
- Aircraft: Phantom 4 Pro (supported in MSDK 4.16.x). Mini 4 Pro requires MSDK 5 (deferred).

## 1. Native Project Creation

Outside this repo (recommended separate repo or submodule):

```
npx react-native init HyTechField --version 0.74.x
cd HyTechField
```

Add a workspace-level `.gitignore` entry for `Config/*.xcconfig` so keys are not committed.

## 2. Add DJI SDK (CocoaPods)

In `ios/Podfile`:

```
platform :ios, '14.0'
pod 'DJISDK', '4.16.4'
```

Run `pod install` inside `ios` folder.

## 3. Configure App Key

Create `ios/Config/Dev.xcconfig`:

```
DJISDK_APP_KEY=17ac0b824d8c388e714dfb0b
```

In Xcode target Build Settings > Info.plist Preprocessor Prefix File not needed; instead:  
Add to `Info.plist`:

```
<key>DJISDKAppKey</key>
<string>$(DJISDK_APP_KEY)</string>
```

## 4. Permissions (Info.plist)

```
<key>NSLocationWhenInUseUsageDescription</key><string>Used to tag flight logs & local map.</string>
<key>NSBluetoothAlwaysUsageDescription</key><string>Needed for remote controller connectivity.</string>
<key>NSPhotoLibraryAddUsageDescription</key><string>Optional: save media to Photos.</string>
```

## 5. AppDelegate Registration (Objective‑C sample)

```objc
#import <DJISDK/DJISDK.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTRootView.h>

@interface AppDelegate() <DJISDKManagerDelegate, DJIAppActivationManagerDelegate>
@end

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  [DJISDKManager registerAppWithDelegate:self];
  // React Native bootstrap code...
  return YES;
}

- (void)appRegisteredWithError:(NSError *)error {
  if (error) {
    [self emitEvent:@"dji:registered" body:@{ @"success": @NO, @"error": error.localizedDescription ?: @"Unknown" }];
  } else {
    [self emitEvent:@"dji:registered" body:@{ @"success": @YES }];
    [DJISDKManager startConnectionToProduct];
  }
}

- (void)productConnected:(DJIBaseProduct *)product {
  [self emitEvent:@"dji:productChanged" body:@{ @"model": product.model ?: @"" }];
}
```

## 6. React Native Bridge Skeleton

Native module `DjiBridge` exports methods (see `mobile/bridge/DjiBridge.ts` in repo for interface):

- register, connect, loadMission, startMission, pauseMission, resumeMission, abortMission, returnToHome, setGimbalPitch.
- Emit events: dji:registered, dji:productChanged, dji:telemetry, dji:missionProgress, dji:missionComplete, dji:photoTaken.

## 7. Mission Translation

From exported mission JSON (`/api/drone-missions/:id/export`):

1. Validate altitude & waypoint count.
2. Build `DJIWaypoint` list.
3. Add action: `[[DJIWaypointAction alloc] initWithActionType:DJIWaypointActionTypeShootPhoto param:0]` for each waypoint.
4. Configure `DJIWaypointMission` speed and heading mode.
5. Upload via `DJIWaypointMissionOperator` then start.

## 8. Telemetry Streaming

Use `DJIFlightControllerState` delegate callback: capture lat/lng/altitude, heading, velocity, battery.  
Buffer to array; every ~3–5 seconds POST to backend: `/api/drone-missions/:id/telemetry` with body:

```
{ "points": [ { "ts": "2025-09-16T18:20:02.123Z", "lat": 42.1234, "lng": -71.4567, "altAGL": 58.2, "heading": 183.4, "gimbalPitch": -88.0, "speedMS": 4.2, "batteryPct": 91 } ] }
```

## 9. Photo Capture Handling

If using waypoint actions, photos auto-fire. Implement `DJICameraDelegate` to receive media events.  
For each capture: increment an in-memory `sequence` counter (start at 0), queue upload (multipart) to `/api/drone-missions/:id/photos` with fields:

```
file: <binary JPEG>
sequence: <integer>
checksum: <optional sha1/md5 hex>
```

Server responds `{ file: { id, path, ... } }` and internally records a `PHOTO` MissionEvent.

## 10. Mini 4 Pro Strategy

MSDK 5+ needed. Differences:

- Different mission API (WaypointV3 / 5.x Operators).
- Add abstraction layer now: `MissionAdapter` interface so later you provide `Msdk4Adapter` and `Msdk5Adapter`.
  If product model contains `Mini 4 Pro` show unsupported toast and block loadMission until adapter implemented.

## 11. Local Queue

Use SQLite (react-native-sqlite) tables: `telemetry_queue`, `photo_queue`. Retry unsent on app foreground or network regain.

## 12. Server Endpoint Contracts (Implemented)

```
POST /api/drone-missions/:id/telemetry
Body: { points: [{ ts?, lat, lng, altAGL?, altMSL?, heading?, gimbalPitch?, speedMS?, batteryPct? }, ...] }  (max 500 per call; ts optional defaults now)

POST /api/drone-missions/:id/events
Body: { type: 'START'|'PAUSE'|'RESUME'|'ABORT'|'COMPLETE'|'ERROR'|'RTH', meta? }

POST /api/drone-missions/:id/photos
Multipart: file (required), sequence (optional int), checksum (optional string)
```

## 13. Error Codes to Surface

| Source            | Typical Codes           | Action                 |
| ----------------- | ----------------------- | ---------------------- |
| Registration      | -1000..                 | Show retry / check key |
| Upload Mission    | timeout, invalid params | Abort & show details   |
| Flight Controller | GPS weak                | Prevent start          |
| Battery           | low / critical          | Prompt RTH             |

## 14. Gimbal Pitch

Set globally before mission using `gimbal rotate` (P4 Pro). If per-waypoint fine‑tuning required later, add additional waypoint actions.

## 15. Security

- Never log the App Key.
- Wrap network calls with HTTPS + missionId auth in future (token).

## 16. Next Implementation Steps

1. Create RN project & install SDK.
2. Add bridge native module + event emitter.
3. Implement registration & product connect.
4. Build mission load/execute pipeline.
5. Add telemetry & photo delegates.
6. Implement server endpoints.
7. Field test (small mission).

---

This document complements `mobile/README.md` and `mobile/bridge/DjiBridge.ts`.
