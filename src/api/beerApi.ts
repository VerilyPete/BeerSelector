import { Beer, Beerfinder } from '../database/types';
import { isBeer } from '../types/beer';
import { Reward } from '../types/database';
import { getPreference } from '../database/preferences';
import { config } from '../config';
import { HttpError, TransportAbortedError, UnreadableBodyError, toNonEmpty } from './fetchOutcome';
import { createErrorResponse } from '../utils/notificationUtils';
import type { FetchOutcome, UnavailableReason, UnconditionalSource } from './fetchOutcome';

/**
 * Budget an attempt must have left before it is worth making at all.
 *
 * An attempt with less than one backoff interval of deadline remaining cannot
 * plausibly complete a TLS handshake and a response on the links this targets.
 * Without the term, the retry guard permits a recursion that arms
 * `setTimeout(abort, deadline - Date.now())` with a few milliseconds left — an
 * attempt born dead that still costs the server a request.
 *
 * It does NOT close the suspension hole: the budget is reserved BEFORE the
 * sleep, and a 1s sleep can resume 20s later if the app is backgrounded or the
 * JS thread stalls. Covering that needs a post-sleep recheck on the shared retry
 * path, which affects the ordinary retry too and is deliberately a separate
 * change.
 *
 * Exported so tests pin the boundary against this value rather than against a
 * hard-coded copy of it.
 */
export const MIN_ATTEMPT_MS = 1000;

/**
 * Fetch with exponential backoff, bounded as a whole.
 *
 * @param url - The URL to fetch
 * @param retries - Maximum attempts, including the first (default: 3)
 * @param delay - Initial delay between retries in ms (default from config)
 * @returns Promise with the JSON response
 */
export const fetchWithRetry = async (
  url: string,
  retries = 3,
  delay = config.network.retryDelay
): Promise<unknown> => {
  // The none:// synthesis that used to live here is GONE. It fabricated
  // `[null, { tasted_brew_current_round: [] }]` — a server response that never
  // existed — which every downstream parser then read as a legitimate empty
  // round. Callers now reject none:// URLs before calling, and return
  // `unavailable/not-applicable` instead.

  // The deadline is computed ONCE, here, and then spent by however many attempts
  // follow. Phase 5.0 armed a fresh `config.network.timeout` per attempt, which
  // bounds an attempt and not the operation: three stalled attempts plus backoff
  // came to ≈47.5s against a 15s master-lock hold, so the bound whose stated
  // purpose was to keep a refresh inside that hold missed it by 3x. A caller
  // asking for a 15s timeout is asking about the call it made, not about an
  // implementation detail of how many times that call is repeated internally.
  return attemptFetch(url, retries, delay, Date.now() + config.network.timeout, undefined, 1);
};

/**
 * One attempt against a chain-wide deadline, recursing until it succeeds, runs
 * out of attempts, or runs out of budget.
 *
 * Separate from `fetchWithRetry` so `deadline` is a required parameter rather
 * than an optional one. An optional deadline defaulting to "now + timeout" reads
 * identically at the call site and silently renews the budget on every recursion
 * — reintroducing the per-attempt bound this exists to remove, in a way no
 * caller could see.
 *
 * `unreadableRetriesLeft` is required for exactly the same reason, and the type
 * is the ONLY available fence: a defaulted version resets on every recursion and
 * no test can observe the difference at the retry budgets this code runs with.
 */
const attemptFetch = async (
  url: string,
  retries: number,
  delay: number,
  deadline: number,
  earlierFailure: unknown,
  unreadableRetriesLeft: number
): Promise<unknown> => {
  // An unbounded request here can be an unbounded database lock hold: the full
  // refresh paths call this while holding the master lock, and past the lock's
  // hold timeout the grant is abandoned and every later writer blocks until this
  // returns. It was the one network await in the codebase with no bound — the
  // apiClient and enrichment paths all have their own AbortController.
  //
  // (Plan 05 Phase 5.4/5.5 hoists the fetches out of the lock, which weakens the
  // lock-hold argument but not the bound itself — a request that never settles
  // is worth failing either way.)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), deadline - Date.now());

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText);
    }

    try {
      return await response.json();
    } catch (parseError) {
      // Typed, for the same reason `HttpError` is: a raw SyntaxError has
      // nothing `createErrorResponse` recognises, so it fell through to
      // UNKNOWN_ERROR — which returns `error.message` verbatim and puts
      // "Unexpected token < in JSON at position 0" in a user-facing alert.
      //
      // `UnreadableBodyError`, not `MalformedResponseError`: this says the body
      // could not be READ, which is a different claim from the server having
      // sent a well-formed body of the wrong shape. The shape decision is made
      // by the three fetchers AFTER this returns, and reports through
      // MALFORMED_RESPONSE_ERROR; this arm cannot see shape and must not
      // pretend to.
      //
      // The parser's error travels as `cause` and is NEVER interpolated — V8
      // embeds a body excerpt in it, Hermes does not, so interpolation leaks the
      // response body into `ErrorResponse.message` in CI and silently not on
      // device.
      //
      // An abort during the body read needs no special case here: the catch
      // below asks the controller BEFORE it looks at this type, so a chain that
      // has already timed out is reported as the deadline rather than as a body
      // worth re-fetching. See the ordering fence in beerApi.failureOutcome.test.ts.
      throw new UnreadableBodyError(parseError);
    }
  } catch (error) {
    // A timeout is NOT retried. The request already spent the full deadline, and
    // three more rounds of backoff on top of that is the opposite of what a weak
    // link needs — it is what turns one stalled request into a multi-minute
    // hold. Transient failures below still retry; this exit is only for the
    // deadline.
    //
    // Asks the controller rather than inspecting the error. `error.name ===
    // 'AbortError'` was wrong in both directions: any error so named from any
    // source would exit here, and an abort that is not an `Error` instance would
    // not — React Native's whatwg-fetch polyfill raises its own DOMException,
    // which would have fallen through and been retried three times, defeating
    // the whole point. The controller knows the answer without inferring it,
    // which is the same argument notificationUtils makes for classifying by type
    // rather than by message.
    if (controller.signal.aborted) {
      // The deadline is how we stopped waiting; it is not what went wrong. If
      // an earlier attempt produced a real answer — a 500, a refused
      // connection — that is the fault worth reporting, and the abort is an
      // implementation detail of giving up on it.
      //
      // Without this the chain reports an AbortError, which
      // `createErrorResponse` maps to NETWORK_ERROR, which sets
      // `allNetworkErrors`, which picks the "check your internet connection"
      // alert. A server that answered 500 twice and then stalled would tell
      // the user to check a connection that demonstrably worked. That is the
      // same defect 30f9d90's review found at the fetcher layer, and the
      // per-chain deadline reintroduced it one layer down: shortening the
      // budget makes a late attempt likelier to abort, so the more often the
      // deadline does its job, the more often the real error was discarded.
      //
      // Typed HERE, at the outer exit, rather than inside the `json()` catch:
      // `fetch()` itself is the abort route that actually fires, and it does not
      // pass through that catch at all. Typing it where the controller is in
      // scope also covers a non-`Error` rejection value, which would otherwise
      // skip `createErrorResponse`'s whole `instanceof Error` block and land on
      // UNKNOWN_ERROR with 'An unknown error occurred'.
      throw (
        earlierFailure ?? new TransportAbortedError('the chain deadline ended the attempt', error)
      );
    }

    // A 4xx is the server reading the request and rejecting it on its merits.
    // Repeating it verbatim asks the same question and gets the same answer, so
    // the retry buys nothing and costs 4.75s of a weak link's refresh budget.
    // `createErrorResponse` already concedes the point — it maps 4xx to
    // VALIDATION_ERROR and 5xx to SERVER_ERROR — and until now this loop
    // contradicted it. 5xx keeps its retries: a 502 from a load balancer is the
    // transient fault backoff is for.
    //
    // Keyed on the status rather than on "it threw", because a transport failure
    // carries no status and must keep retrying — that is the case this whole
    // plan exists for.
    if (error instanceof HttpError && error.status < 500) {
      throw error;
    }

    // A body that could not be READ gets exactly one more chance, inside the
    // deadline already computed.
    //
    // The old policy applied the 4xx argument to the body — the same request
    // returns the same unusable answer — which is true of a captive-portal login
    // page and false of a truncation. Nothing here can tell those apart, so the
    // old code was choosing the answer that is wrong for a weak link, which is
    // the case this whole file exists for. A body of the wrong SHAPE is still
    // never retried, and structurally cannot be: that decision is made by the
    // three fetchers after this function has returned.
    //
    // Conditions 2 and 3 are re-checked here rather than inherited, because this
    // branch is evaluated BEFORE both the shared `retries <= 1` exit and the
    // shared deadline guard below.
    //
    // Not-aborted is an invariant rather than a fourth condition: the abort exit
    // above returns before this line is reached.
    if (error instanceof UnreadableBodyError) {
      const worthRetrying =
        unreadableRetriesLeft > 0 && retries > 1 && Date.now() + delay + MIN_ATTEMPT_MS < deadline;

      if (!worthRetrying) {
        throw error;
      }

      // The ordinary retry logs at its own recursion; without a sibling line
      // here, an unreadable retry that SUCCEEDS leaves no trace anywhere. The
      // source and the remaining budget are included so a future breaker can be
      // sized from incidents rather than from attempts.
      console.log(
        `Response body could not be read, retrying once in ${delay}ms... (${retries - 1} attempts left) ${url}`
      );
      await new Promise(resolve => setTimeout(resolve, delay));

      // `earlierFailure` is passed through UNCHANGED, and an UnreadableBodyError
      // never becomes one. Passing `undefined` would destroy an earlier
      // `HttpError` and reintroduce verbatim the defect the abort exit above
      // exists to prevent — a server that answered 500 and then stalled telling
      // the user to check a connection that demonstrably worked. Carrying the
      // unreadable body forward would be worse still: it is the least
      // informative thing that happened.
      return attemptFetch(
        url,
        retries - 1,
        delay * 1.5,
        deadline,
        earlierFailure,
        unreadableRetriesLeft - 1
      );
    }

    if (retries <= 1) {
      throw error;
    }

    // Sleeping past our own deadline buys nothing: the attempt it schedules is
    // born already aborted, so the wait converts a real error into an AbortError
    // that describes nothing that happened. Report what actually failed instead.
    if (Date.now() + delay >= deadline) {
      throw error;
    }

    console.log(`Fetch failed, retrying in ${delay}ms... (${retries - 1} retries left)`);
    await new Promise(resolve => setTimeout(resolve, delay));
    // This attempt's error is carried forward as the one to report if the
    // chain later runs out of budget. Most recent rather than first: it is the
    // freshest evidence of what the server is doing.
    // `unreadableRetriesLeft` is PRESERVED, not decremented and not refilled: it
    // is a separate cap on a separate condition, spent only by the branch above.
    return attemptFetch(url, retries - 1, delay * 1.5, deadline, error, unreadableRetriesLeft);
  } finally {
    // Runs on the retry path too: `return attemptFetch(...)` in the catch
    // evaluates the call, then this clears THIS invocation's timer before the
    // promise is handed back. Each recursion arms and disarms its own.
    clearTimeout(timeoutId);
  }
};

/**
 * Build an `unavailable` outcome.
 *
 * These are the conditions that used to collapse into a bare `[]` — the whole
 * reason a caller could not tell "we never asked" from "the server said none".
 */
const unavailable = <T>(
  code: UnavailableReason['code'],
  detail: string
): UnconditionalSource<FetchOutcome<T>> => ({ status: 'unavailable', reason: { code, detail } });

/**
 * A usable member API URL, or the reason there is not one.
 */
type MemberApiUrl =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: UnavailableReason };

/**
 * Resolve `my_beers_api_url` for a member-only source, or say why there is none.
 *
 * My-beers and rewards read the **same** preference and must reject the same
 * three conditions before making a request. They did not: 02 Phase 3 added the
 * `none://` rejection to my-beers only, and rewards kept sending the placeholder
 * to `fetch()` — three retries at 1s / 1.5s / 2.25s for a URL that was never
 * valid, on exactly the weak links this work targets.
 *
 * The omission was invisible because the duplication made it read as a
 * difference between the two functions rather than a gap in one. Sharing the
 * preamble is what makes the next such omission impossible rather than merely
 * fixed.
 *
 * @param subject - Names the source in log lines and detail strings
 */
const resolveMemberApiUrl = async (subject: string): Promise<MemberApiUrl> => {
  if ((await getPreference('is_visitor_mode')) === 'true') {
    console.log(`DB: In visitor mode - ${subject} is not applicable`);
    return {
      ok: false,
      reason: { code: 'not-applicable', detail: `visitor mode has no ${subject}` },
    };
  }

  const url = await getPreference('my_beers_api_url');
  if (!url) {
    console.log(`DB: My beers API URL not found in preferences (${subject})`);
    return {
      ok: false,
      reason: { code: 'not-configured', detail: 'my_beers_api_url is not set' },
    };
  }

  if (url.startsWith('none://')) {
    // Rejected HERE, before any request. fetchWithRetry no longer synthesises a
    // fake empty response for none://, so without this the URL falls through to
    // fetch() and burns three retries with backoff.
    console.log(`DB: none:// placeholder in my_beers_api_url - ${subject} not applicable`);
    return {
      ok: false,
      reason: { code: 'not-applicable', detail: 'my_beers_api_url is a none:// placeholder' },
    };
  }

  return { ok: true, url };
};

/**
 * Classify a parsed array into `data` or `confirmed-empty`.
 *
 * `confirmed-empty` means the server genuinely reported none — a well-formed
 * body that says zero. Whether zero is an acceptable answer is the caller's
 * question, not this one's: an empty rewards list is a normal member state, and
 * an empty taplist is rejected as a VALIDATION_ERROR by both of the taplist
 * writers that can see it — `fetchAndUpdateAllBeers` and `prepareAllBeers`.
 * Both, now: this said "downstream" while only the direct path classified it,
 * and the sequential/manual path still threw a plain Error that reached the
 * user as UNKNOWN_ERROR. `errorClassificationParity.test.ts` is what holds the
 * two together, and is the thing to check before trusting this sentence again.
 * Neither case is a fact about the body being unusable.
 *
 * This used to return `malformed` for an empty array, contradicting the line
 * above and every other classifier in this file. Only the `brewInStock` caller
 * could reach it — the other two check `length > 0` first — and there it turned
 * a working server's honest "nothing on tap" into a thrown plain Error that
 * surfaced as UNKNOWN_ERROR. There is no malformed case left here, which is why
 * the detail string this took as a second argument is gone rather than unused.
 */
const fromArray = <T>(items: readonly T[]): UnconditionalSource<FetchOutcome<T>> => {
  const nonEmpty = toNonEmpty(items);
  return fetched(
    nonEmpty === null ? { kind: 'confirmed-empty' } : { kind: 'data', items: nonEmpty }
  );
};

/**
 * Build a `failed` outcome from a thrown transport error, classified by type.
 *
 * Every transport failure leaves through here rather than through a `throw`, so
 * callers learn what happened from a value they must destructure rather than
 * from a message they would have to re-parse.
 */
const failed = <T>(error: unknown): UnconditionalSource<FetchOutcome<T>> => ({
  status: 'failed',
  error: createErrorResponse(error),
});

/**
 * Wrap a payload outcome as a completed request.
 *
 * `etag: null` because only the all-beers proxy path carries ETags, and it
 * handles them separately — these three functions never produce one.
 */
const fetched = <T>(data: FetchOutcome<T>): UnconditionalSource<FetchOutcome<T>> => ({
  status: 'fetched',
  data,
  etag: null,
});

/**
 * Fetch all beers from the Flying Saucer API
 * @returns Promise with array of Beer objects
 */
export const fetchBeersFromAPI = async (): Promise<UnconditionalSource<FetchOutcome<Beer>>> => {
  try {
    // Get the API endpoint from preferences
    const apiUrl = await getPreference('all_beers_api_url');

    if (!apiUrl) {
      console.log('All beers API URL not found in preferences');
      return unavailable('not-configured', 'all_beers_api_url is not set');
    }

    console.log('Fetching beers from API URL:', apiUrl);
    const data = await fetchWithRetry(apiUrl);

    // Log the structure to help debug
    console.log('API response type:', typeof data);
    if (typeof data === 'object' && data !== null) {
      console.log('API response keys:', Object.keys(data as object));
    }

    // Handle different response formats based on API endpoint
    // 1. Regular format: Array with brewInStock in second element
    // `Array.isArray`, not truthiness: `{}` is truthy, and `fromArray({})` reads
    // `.length` as `undefined`, so a non-array payload became `confirmed-empty`
    // — the right refusal for entirely the wrong reason, and one that says the
    // SERVER reported nothing on tap. A non-array falls through to
    // `findBeersArray` below, which may still recognise a nested array, and
    // otherwise to the `malformed` return at the end.
    if (
      data &&
      Array.isArray(data) &&
      data.length >= 2 &&
      data[1] &&
      Array.isArray(data[1].brewInStock)
    ) {
      console.log(
        `Found regular format with brewInStock array (${data[1].brewInStock.length} beers)`
      );
      return fromArray(data[1].brewInStock);
    }

    // 2. Visitor API format: may have different structure
    // Check for common beer properties in the response at different levels
    if (data) {
      // Try to find any array that looks like it contains beer objects
      const findBeersArray = (obj: unknown): Beer[] | null => {
        // If we have an array, check if it looks like beers
        if (Array.isArray(obj)) {
          // Check if this looks like an array of beers
          if (
            obj.length > 0 &&
            obj[0] &&
            typeof obj[0] === 'object' &&
            ('brew_name' in obj[0] || 'id' in obj[0] || 'brewer' in obj[0])
          ) {
            console.log(`Found potential beer array with ${obj.length} items`);
            return obj.filter(isBeer);
          }

          // If not, check each element if it's an object that might contain beers
          for (const item of obj) {
            const result = findBeersArray(item);
            if (result) return result;
          }
        }
        // If we have an object, check each property
        else if (typeof obj === 'object' && obj !== null) {
          const objRecord = obj as Record<string, unknown>;
          // Check direct properties first
          for (const key of Object.keys(objRecord)) {
            if (key === 'brewInStock' || key === 'beers' || key === 'beer_list') {
              const value = objRecord[key];
              if (Array.isArray(value)) {
                console.log(`Found beer array at key "${key}" with ${value.length} items`);
                return value.filter(isBeer);
              }
            }

            // Then recursively check nested objects
            const result = findBeersArray(objRecord[key]);
            if (result) return result;
          }
        }

        return null;
      };

      const beersArray = findBeersArray(data);
      if (beersArray && beersArray.length > 0) {
        return fromArray(beersArray);
      }
    }

    console.error('Could not find beer data in API response');
    // A body ARRIVED and could not be used — a fact about the body, not the
    // request, so `malformed` rather than `failed`. Also not retryable: the same
    // request returns the same unusable body.
    return fetched({
      kind: 'malformed',
      detail: 'response contained no recognisable beer array',
    });
  } catch (error) {
    console.error('Error fetching beers from API:', error);
    return failed(error);
  }
};

/**
 * Fetch user's tasted beers (My Beers) from the Flying Saucer API
 *
 * Note: The tasted_brew_current_round array can be legitimately empty in two scenarios:
 * 1. New user who hasn't tasted any beers yet
 * 2. Experienced user whose "round" has rolled over after reaching 200 tasted beers
 *
 * Business rules:
 * - Users can only log max 3 beers per day, so round rollover from 197→200 takes minimum 24 hours
 * - This gives users predictable timing and prevents sudden empty states during active sessions
 *
 * Both scenarios should be handled as valid states, not errors.
 *
 * @returns Promise with array of Beerfinder (tasted beer) objects
 */
export const fetchMyBeersFromAPI = async (): Promise<
  UnconditionalSource<FetchOutcome<Beerfinder>>
> => {
  try {
    const resolved = await resolveMemberApiUrl('tasted beers');
    if (!resolved.ok) {
      return { status: 'unavailable', reason: resolved.reason };
    }

    console.log('DB: Making API request to fetch My Beers data...');
    const data = await fetchWithRetry(resolved.url);
    console.log('DB: Received response from My Beers API');

    // Log the structure of the response
    if (data) {
      console.log('DB: API response type:', typeof data);
      if (Array.isArray(data)) {
        console.log(`DB: API response is an array with ${data.length} items`);
        for (let i = 0; i < data.length; i++) {
          console.log(`DB: data[${i}] type:`, typeof data[i]);
          if (data[i] && typeof data[i] === 'object') {
            console.log(`DB: data[${i}] keys:`, Object.keys(data[i]));
          }
        }
      } else if (typeof data === 'object') {
        console.log('DB: API response keys:', Object.keys(data));
      }
    } else {
      console.log('DB: API response is null or undefined');
    }

    // Extract the tasted_brew_current_round array from the response
    if (
      data &&
      Array.isArray(data) &&
      data.length >= 2 &&
      data[1] &&
      // `Array.isArray`, not truthiness. `{}` is truthy and `{}.length` is
      // `undefined`, so the empty-round branch below was skipped and `.filter`
      // threw `TypeError: beers.filter is not a function` — caught by this
      // function's outer catch, classified UNKNOWN_ERROR, and rendered verbatim
      // as "Beerfinder data: beers.filter is not a function".
      Array.isArray(data[1].tasted_brew_current_round)
    ) {
      const beers = data[1].tasted_brew_current_round;
      console.log(`DB: Found tasted_brew_current_round with ${beers.length} beers`);

      // Handle empty array as a valid state (user has no tasted beers or round has rolled over)
      if (beers.length === 0) {
        console.log(
          'DB: Empty tasted beers array - user has no tasted beers in current round (new user or round rollover at 200 beers)'
        );
        // The server genuinely reported none. This is the ONLY case in which
        // clearing the local tasted table is correct.
        return fetched({ kind: 'confirmed-empty' });
      }

      // Validate the beers array - check for missing IDs
      const validBeers = beers.filter(
        (beer: unknown): beer is Beerfinder =>
          typeof beer === 'object' &&
          beer !== null &&
          'id' in beer &&
          beer.id !== null &&
          beer.id !== undefined
      );
      const invalidBeers = beers.filter(
        (beer: unknown) =>
          !beer ||
          typeof beer !== 'object' ||
          !('id' in beer) ||
          beer.id === null ||
          beer.id === undefined
      );

      console.log(
        `DB: Found ${validBeers.length} valid beers with IDs and ${invalidBeers.length} invalid beers without IDs`
      );

      // Log details about invalid beers for debugging
      if (invalidBeers.length > 0) {
        console.log('DB: Invalid beers details:');
        invalidBeers.forEach((beer: unknown, index: number) => {
          console.log(`DB: Invalid beer ${index}:`, JSON.stringify(beer));
        });
      }

      if (validBeers.length > 0) {
        return fromArray(validBeers);
      }

      // Rows arrived and none carried an id: MALFORMED, not an empty round.
      // Phase 2 bridged this with a throw because there was no way to say it in
      // the return type; `malformed` is that way, and it lets each caller
      // decide instead of forcing all of them to catch.
      return fetched({
        kind: 'malformed',
        detail: `${invalidBeers.length} rows returned and none carried an id`,
      });
    }

    console.error('DB: Invalid response format from My Beers API');
    return fetched({
      kind: 'malformed',
      detail: 'response contained no tasted_brew_current_round array',
    });
  } catch (error) {
    console.error('DB: Error fetching My Beers from API:', error);
    return failed(error);
  }
};

/**
 * Fetch user's rewards from the Flying Saucer API
 * @returns Promise with array of Reward objects
 */
export const fetchRewardsFromAPI = async (): Promise<UnconditionalSource<FetchOutcome<Reward>>> => {
  try {
    const resolved = await resolveMemberApiUrl('rewards');
    if (!resolved.ok) {
      return { status: 'unavailable', reason: resolved.reason };
    }

    const data = await fetchWithRetry(resolved.url);

    // Extract the reward array from the response
    // `Array.isArray`, not truthiness, and it is this site that made the hole
    // dangerous rather than merely wrong. `{}.length === 0` is FALSE, so the
    // ternary below took the `data` arm and `toNonEmpty({})!` put `items: null`
    // into a `NonEmptyArray` slot; `writeRewards` then spread it under the write
    // lock. A string payload was worse and silent: `toNonEmpty('oops')` yields
    // four one-character rows that spread fine, and `_insertManyInternal` runs
    // `DELETE FROM rewards` before collapsing them onto one empty `reward_id` —
    // the member's rewards deleted, and the refresh reporting success.
    //
    // The guard also retires the `as Reward[]` cast: the check is the narrowing.
    if (
      data &&
      Array.isArray(data) &&
      data.length >= 3 &&
      data[2] &&
      Array.isArray(data[2].reward)
    ) {
      // An empty reward list is a real state — a member with none earned yet —
      // so it is confirmed-empty rather than malformed.
      const rewards: Reward[] = data[2].reward;
      return fetched(
        rewards.length === 0
          ? { kind: 'confirmed-empty' }
          : { kind: 'data', items: toNonEmpty(rewards)! }
      );
    }

    return fetched({
      kind: 'malformed',
      detail: 'response contained no reward array',
    });
  } catch (error) {
    console.error('Error fetching Rewards from API:', error);
    return failed(error);
  }
};
