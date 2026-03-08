# Taplist Cache Proxy — Implementation Plan (v3)

## Goal

Avoid unnecessary data processing when the Flying Saucer taplist hasn't changed. Add ETag/If-None-Match support to the existing `GET /beers` endpoint on the ufobeer.app Worker, and update the BeerSelector app to handle 304 responses.

## Architecture

```
BeerSelector App                         ufobeer.app Worker                    Flying Saucer
     |                                        |                                    |
     |-- GET /beers?sid=X ------------------>|                                    |
     |   If-None-Match: "abc123"              |                                    |
     |   X-API-Key: ***                       |                                    |
     |                                        |-- Auth + Rate Limit                |
     |                                        |-- Check D1 cache                   |
     |                                        |   Fresh (<5min)?                   |
     |                                        |     ETag match? -> 304             |
     |                                        |     No match? -> 200 from cache    |
     |                                        |   Stale? ----------------------->  |
     |                                        |          <-- JSON response ------  |
     |                                        |   Hash RAW response (pre-enrich)   |
     |                                        |   Same hash? Update cached_at only |
     |                                        |   Different? Update all + enrich   |
     |                                        |   ETag match? -> 304              |
     |                                        |   No match? -> 200                |
     |                                        |                                    |
     |   <-- 304 (no body) ------------------|                                    |
     |   OR                                   |                                    |
     |   <-- 200 + JSON + ETag --------------|                                    |
```

## Plan Files

| File                                         | Agent scope | Description                                                                 |
| -------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| [01-worker-etag.md](01-worker-etag.md)       | Worker repo | Add ETag generation, conditional request handling, and cache schema changes |
| [02-worker-handler.md](02-worker-handler.md) | Worker repo | Wire ETag support into `handleBeerList` and `refreshTaplistForStore`        |
| [03-app-refactor.md](03-app-refactor.md)     | App repo    | Extract shared taplist fetch helper from 3 duplicated code paths            |
| [04-app-etag.md](04-app-etag.md)             | App repo    | Add ETag storage, If-None-Match headers, 304 handling                       |
| [05-deploy.md](05-deploy.md)                 | Both        | Deployment order, verification steps, backwards compatibility               |

## Key Design Decisions

1. **Reuse `GET /beers`** — not a new endpoint. Inherits auth, rate limiting, CORS, analytics, audit logging.
2. **Hash raw upstream response** (pre-enrichment) — so enrichment-only changes don't bust the ETag. The taplist ETag answers "did the taplist change?", not "did enrichment change?"
3. **Drop `Last-Modified` / `If-Modified-Since`** from v1 — ETag/If-None-Match is sufficient. Simplifies the implementation significantly.
4. **Extract shared fetch helper on app side first** — the proxy-then-fallback logic is duplicated in 3 places. Refactor before adding ETag support.
5. **Clear ETag on store change** — switching stores must clear the stored ETag.

## ETag Format Contract

Both Worker and app must agree:

```
Format:  "<32-char-hex-sha256-prefix>"
Example: "5eb63bbbe01eeed093cb22bb8f5acdc3"
```

- Double-quoted per RFC 7232
- Strong ETag (no `W/` prefix)
- First 32 hex chars of SHA-256 of the **raw** Flying Saucer response body (pre-enrichment)
- App stores and sends this value verbatim as `If-None-Match`

## Backwards Compatibility

- **Old app + new Worker**: No `If-None-Match` sent -> always 200. ETag header ignored. Zero impact.
- **New app + old Worker**: `If-None-Match` sent -> ignored by old Worker -> always 200. App stores ETag but never gets 304. Zero impact.
- **New app + no Worker**: Falls back to direct Flying Saucer URL without `If-None-Match`. Zero impact.

## Scope

- **Sugar Land only**: `ENABLED_STORE_IDS` stays as-is (only `13879`). The Worker only accepts requests for Sugar Land. ETag support applies to Sugar Land only. Other stores are rejected with 400, same as today.
