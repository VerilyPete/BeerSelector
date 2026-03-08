# Phase 5: Deployment and Verification

**Depends on**: All previous phases

## Deployment Order

Order matters — migration before Worker deploy, Worker before app.

### 1. D1 Migration (before Worker deploy)

```bash
cd /Users/pete/claude/ufobeer
npx wrangler d1 migrations apply ufobeer-db
```

Adds nullable `content_hash` column. Existing Worker code continues working (doesn't read this column yet).

### 2. Deploy Worker

```bash
npx wrangler deploy
```

New Worker code starts:

- Computing content hashes on upstream fetches
- Storing hashes in `store_taplist_cache`
- Returning `ETag` headers on 200 responses
- Returning 304 when `If-None-Match` matches

Old app clients are unaffected — they don't send `If-None-Match`, always get 200.

### 3. Verify Worker (manual)

```bash
# First request — should get 200 with ETag header
curl -s -D- -H "X-API-Key: $KEY" \
  "https://ufobeer.app/beers?sid=13879" | head -20

# Second request with ETag — should get 304
ETAG=$(curl -s -D- -H "X-API-Key: $KEY" \
  "https://ufobeer.app/beers?sid=13879" | grep -i etag | awk '{print $2}' | tr -d '\r')

curl -s -D- -H "X-API-Key: $KEY" \
  -H "If-None-Match: $ETAG" \
  "https://ufobeer.app/beers?sid=13879" | head -10
# Expect: HTTP/2 304

# Verify non-Sugar Land store is still rejected
curl -s -o /dev/null -w "%{http_code}" -H "X-API-Key: $KEY" \
  "https://ufobeer.app/beers?sid=13885"
# Expect: 400 (only Sugar Land 13879 is enabled)
```

### 4. Deploy App Update

Build and ship via normal Xcode flow. No `.env` changes needed.

### 5. Verify App (on device)

- Fresh install / first launch: fetches 200, stores ETag
- Pull-to-refresh (data unchanged): gets 304, no DB churn, fast return
- Pull-to-refresh (data changed): gets 200, new ETag stored
- Switch stores in settings: ETag cleared, next fetch is 200
- Kill app, relaunch: auto-refresh uses stored ETag
- Turn off WiFi, pull-to-refresh: graceful error (existing behavior)
- Disable enrichment config: falls back to direct Flying Saucer (no ETag)

## Backwards Compatibility Matrix

| App Version | Worker Version | Behavior                           |
| ----------- | -------------- | ---------------------------------- |
| Old         | Old            | No change                          |
| Old         | New            | 200 always (ETag header ignored)   |
| New         | Old            | 200 always (If-None-Match ignored) |
| New         | New            | 304 when taplist unchanged         |
| New         | Down           | Falls back to direct Flying Saucer |

## Rollback Plan

- **Worker**: Revert to previous Worker version. D1 column stays (nullable, harmless). Old code ignores it.
- **App**: No app rollback needed — new app with old Worker just never gets 304s.

## Risks

| Risk                                                     | Mitigation                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| Worker deploy before migration                           | Run migration first; column is nullable; existing code ignores it |
| `setCachedTaplist` signature change breaks callers       | Both callers updated in same PR                                   |
| Hash computed on raw data but cache stores enriched data | Intentional — ETag tracks taplist changes, not enrichment changes |
| Stale ETag sent after store change                       | Clear `all_beers_etag` preference on store change                 |
| D1 row size limit (1MB)                                  | Largest taplist ~200KB; not a concern                             |
