/**
 * `node-fetch` v2 ships no types and `@types/node-fetch` is not installed.
 *
 * This did not matter while the integration suite reached it through
 * `require()`, which is implicitly `any`. `await import()` is typed, so the
 * missing declaration became a TS7016 error. Declaring the shape we actually
 * use is cheaper than adding a dependency for one call site.
 */
declare module 'node-fetch' {
  const fetch: typeof globalThis.fetch;
  export default fetch;
}
