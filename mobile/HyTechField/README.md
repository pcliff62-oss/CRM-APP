HyTech Field (iOS-first) – React Native app scaffold

This folder contains app-side code stubs and native bridge notes. For a full app, initialize a new RN project at this path and add the DJI SDK + native bridge.

Quick plan:

1. npx react-native init HyTechField --version 0.74.x
2. Add pod 'DJISDK', '4.16.4' in ios/Podfile, run pod install
3. Implement native module DjiBridge (Objective-C/Swift) per contracts below
4. Use src/app.tsx to fetch mission export JSON and execute flight

See ../docs/DJI_MOBILE_SETUP.md for setup details.
