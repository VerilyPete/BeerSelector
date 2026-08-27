/**
 * Stands in for `@jest/globals`, which a few suites import explicitly and which
 * throws outside a jest environment. `vi` covers the same surface, and
 * `globals: true` already provides the rest.
 */
export {
  vi as jest,
  describe,
  it,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from 'vitest';
