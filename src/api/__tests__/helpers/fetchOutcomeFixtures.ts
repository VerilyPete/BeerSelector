/**
 * Builders for the `FetchedSource<FetchOutcome<T>>` shape the three `beerApi`
 * fetchers now return.
 *
 * Shared rather than duplicated across five suites, because the whole point of
 * the type is that these cases are distinguishable — five hand-rolled copies
 * would be five chances to blur them again.
 *
 * Not a `.test.ts` file, so Jest's testMatch does not collect it.
 */

import type { FetchOutcome, FetchedSource, UnavailableReason } from '../../fetchOutcome';
import { toNonEmpty } from '../../fetchOutcome';

/**
 * A completed request whose body contained rows — or, for an empty array,
 * `confirmed-empty`.
 *
 * The empty case maps to `confirmed-empty` on purpose: it is what a bare `[]`
 * used to mean at these call sites when the server genuinely reported none, so
 * a mechanical `mockResolvedValue([])` keeps its original intent.
 */
export function fetchedRows<T>(items: readonly T[]): FetchedSource<FetchOutcome<T>> {
  const nonEmpty = toNonEmpty(items);
  return {
    status: 'fetched',
    data: nonEmpty === null ? { kind: 'confirmed-empty' } : { kind: 'data', items: nonEmpty },
    etag: null,
  };
}

/** The server answered, and the answer was zero rows. Clearing is correct. */
export function confirmedEmpty<T>(): FetchedSource<FetchOutcome<T>> {
  return { status: 'fetched', data: { kind: 'confirmed-empty' }, etag: null };
}

/** A body arrived and could not be used. Clearing is NOT correct. */
export function malformed<T>(detail = 'unusable body'): FetchedSource<FetchOutcome<T>> {
  return { status: 'fetched', data: { kind: 'malformed', detail }, etag: null };
}

/** No request was made. Clearing is NOT correct, and nor is a timestamp. */
export function unavailable<T>(
  code: UnavailableReason['code'] = 'not-configured',
  detail = 'not configured'
): FetchedSource<FetchOutcome<T>> {
  return { status: 'unavailable', reason: { code, detail } };
}
