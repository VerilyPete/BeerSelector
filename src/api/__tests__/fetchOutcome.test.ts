/**
 * Tests for fetchOutcome
 *
 * Plan 02 Phase 1. Only `toNonEmpty` has behaviour worth testing — the unions
 * themselves are checked by the compiler, and a test asserting that a switch
 * over `kind` reaches different branches would be testing TypeScript rather
 * than this module.
 */

import { describe, it, expect } from 'vitest';
import { toNonEmpty } from '../fetchOutcome';
import type { FetchOutcome, FetchedSource } from '../fetchOutcome';

// ---------------------------------------------------------------------------
// Composition guards.
//
// These are compile-time assertions, and deliberately so — the property under
// test IS a compile-time property, and `@ts-expect-error` fails the build if
// the error stops occurring, so it is a real guard rather than a runtime test
// dressed up. They exist because the earlier cut of these unions let three
// contradictory pairings typecheck, and nothing at runtime could have caught it.
// ---------------------------------------------------------------------------

// Every legitimate shape must keep compiling.
const _fetchedData: FetchedSource<FetchOutcome<number>> = {
  status: 'fetched',
  data: { kind: 'data', items: [1, 2] },
  etag: 'W/"abc"',
};
const _fetchedEmpty: FetchedSource<FetchOutcome<number>> = {
  status: 'fetched',
  data: { kind: 'confirmed-empty' },
  etag: null,
};
const _fetchedMalformed: FetchedSource<FetchOutcome<number>> = {
  status: 'fetched',
  data: { kind: 'malformed', detail: 'every row lacked an id' },
  etag: null,
};
const _unchanged: FetchedSource<FetchOutcome<number>> = { status: 'unchanged' };
const _unavailable: FetchedSource<FetchOutcome<number>> = {
  status: 'unavailable',
  reason: { code: 'not-applicable', detail: 'visitor mode' },
};

// "The request succeeded, and the body it returned was a transport condition."
//
// The reason code here is deliberately one that IS still valid
// (`not-configured`), so the only thing making this line an error is the axis
// separation itself. Using a retired code such as `network` would let the
// directive be consumed by the wrong error and pass for the wrong reason.
const _nonsense: FetchedSource<FetchOutcome<number>> = {
  status: 'fetched',
  // @ts-expect-error transport conditions cannot appear as a response body
  data: { kind: 'unavailable', reason: { code: 'not-configured', detail: 'no url' } },
  etag: null,
};

void [_fetchedData, _fetchedEmpty, _fetchedMalformed, _unchanged, _unavailable, _nonsense];

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
