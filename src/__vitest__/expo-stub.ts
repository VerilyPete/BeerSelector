/**
 * Stand-in for the bare `expo` package in node-environment runs.
 *
 * `expo`'s `main` is `src/Expo.ts` — untranspiled TypeScript whose winter
 * runtime installs globals through a literal CJS `require()`. Vite emits ESM,
 * where `require` does not exist; jest-expo only survives it because babel
 * compiles the module to CJS first.
 *
 * `expo-sqlite` imports this package purely to register its native module, so
 * logic tests (which mock `expo-sqlite` anyway) never need any of it.
 */
/**
 * `expo-sqlite` calls `requireNativeModule('ExpoSQLite')` at import time. There
 * is no native side in a node run, and every suite that touches the database
 * mocks `expo-sqlite` itself — so this only has to be callable, not real.
 */
export const requireNativeModule = (): Record<string, unknown> => ({});
export const requireOptionalNativeModule = (): null => null;
export const registerRootComponent = (): void => {};
export const isRunningInExpoGo = (): boolean => false;
export default {};
