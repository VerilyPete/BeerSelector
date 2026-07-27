/**
 * Tests for fetchOutcome
 *
 * Plan 02 Phase 1. Only `toNonEmpty` has behaviour worth testing — the unions
 * themselves are checked by the compiler, and a test asserting that a switch
 * over `kind` reaches different branches would be testing TypeScript rather
 * than this module.
 */

import { toNonEmpty } from '../fetchOutcome';

describe('toNonEmpty', () => {
  it('returns null for an empty array', () => {
    expect(toNonEmpty([])).toBeNull();
  });

  it('preserves order and length for a populated array', () => {
    expect(toNonEmpty([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('returns a distinct array, not the input reference', () => {
    const input = [1, 2, 3];

    const result = toNonEmpty(input);

    // The caller keeps ownership of its own array: mutating the input later
    // must not reach through into a NonEmptyArray somebody is holding.
    expect(result).not.toBe(input);
    input.push(4);
    expect(result).toEqual([1, 2, 3]);
  });
});
