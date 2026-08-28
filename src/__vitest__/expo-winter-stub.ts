/**
 * No-op stand-in for `expo/src/winter/runtime`.
 *
 * That file installs `__ExpoImportMetaRegistry` on globalThis via a literal
 * CJS `require()` inside TypeScript source. Vite emits ESM, where `require` does
 * not exist; jest-expo gets away with it because babel compiles the module to
 * CJS first. Node-environment logic tests never read the registry, so the
 * cheapest correct answer is to not install it.
 */
export {};
