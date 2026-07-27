/**
 * Result types for the fetch layer
 *
 * Plan 02 Phase 1.
 *
 * `beerApi` currently has no way to say anything but "here is an array", so six
 * distinct conditions all collapse to `[]`: no URL configured, visitor mode, a
 * `none://` placeholder URL, a parsed response where every entry lacked an id,
 * a network failure — and, exactly once, a server genuinely reporting an empty
 * round. Only the last is real data, and callers cannot tell which they got.
 * That ambiguity is what lets a benign `[]` wipe the tasted table and be
 * recorded as a successful sync.
 *
 * These are two unions rather than one on purpose. See the module's phase notes
 * for the full argument; the short version is that they answer different
 * questions — one about the response body, one about the request — and a merged
 * union would admit nonsense like "unchanged AND confirmed-empty". Only
 * all-beers has ETags, so folding 304 into the payload union would give
 * my-beers and rewards a case they can never produce.
 */

import { ErrorResponse } from '../utils/notificationUtils';

/**
 * An array the type system knows has at least one element.
 *
 * Defence in depth, not the fix on its own: a well-typed NonEmptyArray of rows
 * that all lack an `id` is still useless to a caller, which is why the wipe
 * branches in MyBeersRepository throw rather than relying on this.
 */
export type NonEmptyArray<T> = readonly [T, ...(readonly T[])];

/**
 * Narrow an array to NonEmptyArray, or null when it is empty.
 *
 * Assertion-free by design. `tsconfig.json` does not enable
 * `noUncheckedIndexedAccess`, so `items[0]` is `T` and the spread compiles
 * without a cast.
 *
 * Copies rather than aliasing the input, so a caller mutating its own array
 * later cannot reach through into a NonEmptyArray somebody else is holding.
 */
export const toNonEmpty = <T>(items: readonly T[]): NonEmptyArray<T> | null =>
  items.length > 0 ? [items[0], ...items.slice(1)] : null;

/**
 * Why no usable data came back.
 *
 * Deliberately a code plus a human-readable detail, not a message to be
 * re-parsed. Classifying by substring is the pattern this plan exists to
 * remove — see `createErrorResponse` in `src/utils/notificationUtils.ts`.
 */
export type UnavailableReason =
  | { readonly code: 'not-configured'; readonly detail: string }
  | { readonly code: 'not-applicable'; readonly detail: string }
  | { readonly code: 'malformed'; readonly detail: string }
  | { readonly code: 'network'; readonly detail: string };

/**
 * What the response BODY contained.
 *
 * `confirmed-empty` is a success: the server really did report zero rows, which
 * happens legitimately for a new user or at the 200-beer round rollover. It is
 * the only case in which clearing the local table is correct, and separating it
 * from `unavailable` is the whole point of this type.
 */
export type FetchOutcome<T> =
  | { readonly kind: 'data'; readonly items: NonEmptyArray<T> }
  | { readonly kind: 'confirmed-empty' }
  | { readonly kind: 'unavailable'; readonly reason: UnavailableReason };

/**
 * What happened to the REQUEST. Consumed by plan 01 Phase 4.
 *
 * Composes with the above: all-beers is honestly
 * `FetchedSource<FetchOutcome<Beer>>`, while my-beers and rewards are plain
 * `FetchOutcome<T>` that a caller lifts with
 * `{ status: 'fetched', data: outcome, etag: null }`.
 */
export type FetchedSource<T> =
  | { readonly status: 'fetched'; readonly data: T; readonly etag: string | null }
  | { readonly status: 'unchanged' }
  | { readonly status: 'failed'; readonly error: ErrorResponse };
