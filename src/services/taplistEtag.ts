/**
 * Sole owner of the correspondence between the `allbeers` table and its ETag
 *
 * Plan 04 Phase 1.
 *
 * **The invariant:** `all_beers_etag` may be retained only when the `allbeers`
 * table was derived from exactly that proxy response. Any write that replaces
 * the table from another source, or that removes data from it, must clear the
 * ETag.
 *
 * The bug this exists to prevent is not a missing `else` branch. It is that no
 * single place owned that correspondence, so `dataUpdateService.ts` decided
 * independently in three places and all three got it wrong the same way: a
 * bare `if (etag)` keeps the *previous* ETag when a fallback write produced no
 * new one, leaving an ETag that names proxy-enriched data the table no longer
 * holds. Every later conditional request then 304s and returns early without
 * touching the database, so the ABV placards never come back.
 *
 * Every decision here is a pure function. `readTaplistEtag` and
 * `commitTaplistWrite` are thin wrappers over the preferences module with no
 * branching of their own, so there is nowhere else for a decision to hide.
 *
 * **Documented exception:** the background enrichment poll
 * (`BeerRepository.updateEnrichmentData`) does NOT clear the ETag. It cannot
 * delete rows, and `abv` and `brew_description` are `COALESCE`d so it cannot
 * null them either — which is what this exception rests on. It is NOT "purely
 * additive", as this comment used to claim: `enrichment_confidence` and
 * `enrichment_source` are written unconditionally and can be overwritten with
 * null. In practice the poll only targets rows missing enrichment, so an
 * already-populated row is not normally revisited, but the SQL permits it.
 *
 * The other half is that ufobeer `f57bb91` makes the server ETag cover
 * enrichment, so a 304 provably means the client already has that data.
 * Clearing would force a full 200 on exactly the weak links this plan exists to
 * fix. That dependency on the backend's combined ETag has already reversed
 * once; if it reverses again, this exception is the first thing to revisit.
 */

import { getPreference, setPreference } from '../database/preferences';

/**
 * Preference key. Deliberately not exported — the raw string should appear
 * nowhere else, so that every read and write goes through this module.
 */
const TAPLIST_ETAG_KEY = 'all_beers_etag';

const TAPLIST_ETAG_DESCRIPTION = 'Cached ETag for all beers taplist';

/**
 * Where the rows now in `allbeers` came from.
 *
 * `proxy` carries the ETag the server sent for that exact payload; every other
 * kind means the table no longer corresponds to any stored ETag.
 */
export type TaplistWriteSource =
  | { readonly kind: 'proxy'; readonly etag: string | null }
  | { readonly kind: 'fallback' }
  | { readonly kind: 'local-mutation' }
  | { readonly kind: 'cleared' };

/**
 * The ETag to store after a write, given what produced it.
 *
 * Returns `''` rather than leaving the previous value alone, because "do
 * nothing" is precisely the bug: a fallback write that produces no ETag must
 * actively invalidate the old one.
 *
 * @param source - What filled or changed the table
 * @returns The value to store; `''` means "no valid ETag"
 */
export function nextTaplistEtag(source: TaplistWriteSource): string {
  if (source.kind !== 'proxy') {
    return '';
  }

  // A proxy response without an ETag header cannot be revalidated later, so it
  // is no better than a fallback write.
  return source.etag ?? '';
}

/**
 * Interpret a stored ETag value.
 *
 * The preference store holds `''` for "cleared", and a whitespace-only value is
 * not a usable validator either. Both become `undefined` so callers cannot
 * accidentally send them as an `If-None-Match` header.
 *
 * @param stored - The raw preference value
 * @returns The ETag, or undefined when there is none to send
 */
export function normalizeStoredEtag(stored: string | null): string | undefined {
  if (stored === null) {
    return undefined;
  }

  const trimmed = stored.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Whether a 304 can be believed.
 *
 * A 304 asserts "you already have this". With an empty table that assertion is
 * false, and honouring it strands the app showing nothing. Checking the row
 * count is the backstop for an ETag that survived when it should not have.
 *
 * @param currentRowCount - Rows currently in `allbeers`
 */
export function shouldTrustNotModified(currentRowCount: number): boolean {
  return currentRowCount > 0;
}

/**
 * Read the stored taplist ETag, normalized.
 *
 * @returns The ETag to send as `If-None-Match`, or undefined
 */
export async function readTaplistEtag(): Promise<string | undefined> {
  return normalizeStoredEtag(await getPreference(TAPLIST_ETAG_KEY));
}

/**
 * Record the ETag implied by a write that just happened.
 *
 * Call this after every write to `allbeers`, including ones that produce no
 * ETag — that is the whole point.
 *
 * @param source - What filled or changed the table
 */
export async function commitTaplistWrite(source: TaplistWriteSource): Promise<void> {
  await setPreference(TAPLIST_ETAG_KEY, nextTaplistEtag(source), TAPLIST_ETAG_DESCRIPTION);
}
