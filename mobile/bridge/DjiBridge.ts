// TypeScript facade for native DJI bridge (to be implemented in a React Native app)
// This code lives here as a contract reference; not executed in the Next.js environment.

import { NativeEventEmitter, NativeModules } from 'react-native';
import type { ExportedMission } from '../../examples/mobile-mission-fetch/missionClient';

const { DjiBridgeNative } = NativeModules as any;

export interface TelemetryPoint {
  ts: number; // epoch ms
  lat: number;
  lng: number;
  altAGL?: number;
  altMSL?: number;
  heading?: number;
  gimbalPitch?: number;
  speed?: number; // m/s
  batteryPct?: number; // 0-100
}

export interface IDjiBridge {
  register(): Promise<boolean>;
  connect(): Promise<void>;
  loadMission(m: ExportedMission): Promise<void>;
  startMission(): Promise<void>;
  pauseMission(): Promise<void>;
  resumeMission(): Promise<void>;
  abortMission(): Promise<void>; // stop & hover
  returnToHome(): Promise<void>;
  setGimbalPitch(deg: number): Promise<void>;
}

class DjiBridge implements IDjiBridge {
  private emitter = new NativeEventEmitter(DjiBridgeNative);

  register() { return DjiBridgeNative.register(); }
  connect() { return DjiBridgeNative.connect(); }
  loadMission(m: ExportedMission) { return DjiBridgeNative.loadMission(m); }
  startMission() { return DjiBridgeNative.startMission(); }
  pauseMission() { return DjiBridgeNative.pauseMission(); }
  resumeMission() { return DjiBridgeNative.resumeMission(); }
  abortMission() { return DjiBridgeNative.abortMission(); }
  returnToHome() { return DjiBridgeNative.returnToHome(); }
  setGimbalPitch(deg: number) { return DjiBridgeNative.setGimbalPitch(deg); }

  addListener(evt: string, cb: (...args: any[]) => void) { return this.emitter.addListener(evt, cb); }
}

export const djiBridge = new DjiBridge();

export type DjiEvents =
  | 'dji:registered'
  | 'dji:productChanged'
  | 'dji:telemetry'
  | 'dji:photoTaken'
  | 'dji:missionProgress'
  | 'dji:missionComplete';

// Example usage (in RN app):
// djiBridge.addListener('dji:telemetry', (t: TelemetryPoint) => updateStore(t));
// await djiBridge.register();
