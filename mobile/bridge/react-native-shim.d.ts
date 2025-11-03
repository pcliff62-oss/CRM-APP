// Minimal shim so web workspace typecheck passes without installing react-native types.
// Real mobile project will supply actual @types via React Native environment.

declare module 'react-native' {
  export const NativeModules: any;
  export class NativeEventEmitter {
    constructor(module?: any);
    addListener(event: string, listener: (...args: any[]) => void): { remove(): void };
    removeAllListeners(event?: string): void;
  }
  // Minimal component shims for web typechecking only
  export const SafeAreaView: any;
  export const Text: any;
  export const View: any;
  export const TextInput: any;
  export const Button: any;
  export const ScrollView: any;
}
