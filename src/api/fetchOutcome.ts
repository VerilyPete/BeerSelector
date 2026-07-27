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
 * Why no request was made at all.
 *
 * Deliberately narrow: these are the states where asking would be meaningless,
 * not failures. Visitor mode and "no URL configured" are normal conditions, so
 * they must not be modelled as errors — that is what pushes callers back to
 * classifying by message string.
 *
 * A code plus a human-readable detail, never a message to be re-parsed.
 */
export type UnavailableReason =
  | { readonly code: 'not-configured'; readonly detail: string }
  | { readonly code: 'not-applicable'; readonly detail: string };

/**
 * What the response BODY contained. Only meaningful once a body has arrived.
 *
 * `confirmed-empty` is a success: the server really did report zero rows, which
 * happens legitimately for a new user or at the 200-beer round rollover. It is
 * the only case in which clearing the local table is correct, and separating it
 * from every "we have nothing to show you" condition is the whole point.
 *
 * `malformed` lives here rather than alongside the transport conditions because
 * it is genuinely a statement about a body: it arrived, and it was unusable.
 */
export type FetchOutcome<T> =
  | { readonly kind: 'data'; readonly items: NonEmptyArray<T> }
  | { readonly kind: 'confirmed-empty' }
  | { readonly kind: 'malformed'; readonly detail: string };

/**
 * What happened to the REQUEST. Consumed by plan 01 Phase 4.
 *
 * **Every source composes as `FetchedSource<FetchOutcome<T>>`** — all-beers,
 * my-beers and rewards alike. The earlier split, where only all-beers composed
 * and the others used a bare `FetchOutcome<T>`, let three contradictory pairings
 * typecheck: `{ status: 'fetched', data: { kind: 'unavailable', … } }` reads as
 * "the request succeeded, and the body it returned was a network failure". The
 * merged five-case union was rejected for admitting nonsense; the composed pair
 * admitted different nonsense.
 *
 * The cut is by axis. `not-configured` / `not-applicable` / a network failure
 * are facts about the request, so they live here; only `malformed` is a fact
 * about a body. With the codes on the right side, no combination is
 * contradictory.
 *
 * The cost, stated honestly: my-beers and rewards inherit `unchanged`, which
 * they can never produce because neither supports conditional requests. One
 * inert case is cheaper than three constructible nonsense combinations that
 * every reader has to reason about — and the previous design's own prescribed
 * lift (`{ status: 'fetched', data: outcome, etag: null }`) handed them that
 * same inert case anyway, one layer up, plus a permanently-null etag.
 */
export type FetchedSource<T> =
  | { readonly status: 'fetched'; readonly data: T; readonly etag: string | null }
  | { readonly status: 'unchanged' }
  | { readonly status: 'unavailable'; readonly reason: UnavailableReason }
  | { readonly status: 'failed'; readonly error: ErrorResponse };

/**
 * A source that cannot report `unchanged`, because it makes no conditional
 * requests.
 *
 * The comment above accepts the inert `unchanged` arm as the price of cutting
 * the unions by axis — and that argument is about the shape of the SHARED union,
 * not about what each individual producer declares it can return. None of the
 * three `beerApi` fetchers sends `If-None-Match`; only the enrichment proxy does,
 * and `dataUpdateService` handles its 304 separately without ever building a
 * `FetchedSource`.
 *
 * Every consumer was therefore carrying a branch for a state its input could not
 * be in. Those branches cannot be tested through the public API, and an untested
 * branch in the code that exists to stop non-answers becoming answers is exactly
 * where the next one hides — one of them was a `fail` carrying developer prose
 * into a user-facing channel. Narrowing here makes writing such a branch a
 * compile error, which is a better guarantee than a test.
 *
 * Assignable to `FetchedSource<T>`, so wide consumers keep working unchanged.
 */
export type UnconditionalSource<T> = Exclude<FetchedSource<T>, { readonly status: 'unchanged' }>;

/**
 * A response arrived and could not be used.
 *
 * Typed so that callers — and the user-facing error formatter — can tell it
 * apart from a network failure or an unknown fault. Without this the raw
 * developer message reaches the Settings refresh alert verbatim, which is what
 * `CONTENTION_ERROR` already exists to prevent for the database layer.
 *
 * Deliberately NOT retryable: the same request returns the same unusable body,
 * so offering "try again" would be a lie.
 *
 * 02 Phase 3 folds this into `FetchOutcome`'s `malformed` case; until the
 * callers are migrated, the throw needs a type.
 */
/**
 * The server answered with a non-2xx status.
 *
 * A type rather than a message, for the reason `createErrorResponse` states at
 * the top of its body: it classifies `DatabaseContentionError` and
 * `MalformedResponseError` by type precisely so the answer does not depend on
 * prose. Before this existed, the thrown message was
 * `Failed to fetch: 500 Internal Server Error`, which matched that function's
 * `'Failed to fetch'` substring test — so **every HTTP error was reported to the
 * user as "check your internet connection"**, and counted toward
 * `allNetworkErrors`, which picks the offline alert. The one thing the user could
 * do nothing about was the one thing they were told to check.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    statusText: string
  ) {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ''}`);
    this.name = 'HttpError';
    // Required for `instanceof` to survive transpilation of Error subclasses.
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

export class MalformedResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedResponseError';
    // Required for `instanceof` to survive transpilation of Error subclasses.
    Object.setPrototypeOf(this, MalformedResponseError.prototype);
  }
}
