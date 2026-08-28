/**
 * Tests for the taplist ETag decision module
 *
 * Plan 04 Phase 1.
 *
 * The invariant these encode:
 *
 *   all_beers_etag may be retained only when the allbeers table was derived
 *   from exactly that proxy response. Any write that replaces the table from
 *   another source, or removes data from it, must clear the ETag.
 *
 * Today nobody owns that correspondence, so three separate writers decide
 * independently and all three get it wrong the same way: `if (etag)` keeps the
 * previous ETag when a fallback write produced no new one, leaving an ETag that
 * describes proxy-enriched data the table no longer holds. Every later request
 * then 304s and the ABV placards never come back.
 */

import { describe, it, expect } from 'vitest';
import { nextTaplistEtag, normalizeStoredEtag, shouldTrustNotModified } from '../taplistEtag';

describe('nextTaplistEtag', () => {
  it('keeps the server ETag when the table was filled from a proxy response', () => {
    expect(nextTaplistEtag({ kind: 'proxy', etag: 'W/"abc"' })).toBe('W/"abc"');
  });

  it('clears the ETag when the table was filled from the direct Flying Saucer fallback', () => {
    // The reported bug. A proxy timeout falls through to the direct fetch,
    // which carries no ABV, and the old `if (etag)` guard left the previous
    // ETag in place — so the ABV-less table was 304'd forever after.
    expect(nextTaplistEtag({ kind: 'fallback' })).toBe('');
  });

  it('clears the ETag when a proxy response carried no ETag header', () => {
    expect(nextTaplistEtag({ kind: 'proxy', etag: null })).toBe('');
  });

  it('clears the ETag when rows were mutated locally', () => {
    expect(nextTaplistEtag({ kind: 'local-mutation' })).toBe('');
  });

  it('clears the ETag when the table was emptied', () => {
    expect(nextTaplistEtag({ kind: 'cleared' })).toBe('');
  });
});

describe('normalizeStoredEtag', () => {
  it('treats empty, null and whitespace-only stored values as no ETag', () => {
    expect(normalizeStoredEtag(null)).toBeUndefined();
    expect(normalizeStoredEtag('')).toBeUndefined();
    expect(normalizeStoredEtag('   ')).toBeUndefined();
  });

  it('passes a real ETag through unchanged', () => {
    expect(normalizeStoredEtag('W/"abc"')).toBe('W/"abc"');
  });
});

describe('shouldTrustNotModified', () => {
  it('rejects a 304 when the table is empty', () => {
    // A 304 means "you already have this". With zero rows that is false, so
    // honouring it strands the app on an empty taplist.
    expect(shouldTrustNotModified(0)).toBe(false);
  });

  it('accepts a 304 when the table has rows', () => {
    expect(shouldTrustNotModified(1)).toBe(true);
  });
});
