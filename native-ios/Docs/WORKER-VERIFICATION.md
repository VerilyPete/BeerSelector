# Live enrichment Worker verification

## API host moved to api.ufobeer.app — 2026-10-29

The enrichment Worker now serves only `https://api.ufobeer.app`. The apex `ufobeer.app` is being freed for a public website and will stop serving the API once older builds are expired. Set `EnrichmentURL` to `https://api.ufobeer.app` (no trailing slash; `EnrichmentService` appends `beers`, `beers/batch`, `beers/sync` and `health`). Paths, `X-API-Key`, User-Agent and ETag behavior are unchanged.

`GET https://api.ufobeer.app/health` with redirects rejected (`curl --max-redirs 0 --proto '=https'`) returned **200** with `status: ok`. The Cloudflare 1010 block recorded below no longer applies to that request. `/health` also answers without a key, so it does not prove the key; the simulator taplist refresh does.

If an older build's enrichment host returns 404, 403 or an HTML 200, the app falls back to the direct Flying Saucer taplist without showing an error and keeps previously cached ABV values. `NetworkTests.testRetiredEnrichmentHostFallsBackToDirectTaplistAndKeepsCachedEnrichment` covers all three. New beers on such a build get no enrichment. Cross-host redirects are refused, so the API key is not forwarded to another host.

## Edge block — 2026-09-11

Status: blocked at the edge; no live Worker contract or delayed-cleanup success is claimed.

The user requested live Worker verification and migration compatibility work in one pass. Read-only local inspection confirmed the ignored configured endpoint exactly matches `https://ufobeer.app` in tracked `.env.example`. Credentials were neither printed nor added to source. The probe rejects redirects and uses public fixture store 1; it does not use a member session or private database backup.

The first and only transmitted request, authenticated `GET /health`, returned HTTP 403 with Cloudflare error **1010**, `browser_signature_banned`. The response says the site owner blocked the browser signature, is not retryable, and requires owner action. It does not establish whether the Worker accepted the API key or whether the Worker itself is healthy. No proxy, batch, sync, conditional-cache or polling requests followed. No check-in/reward/delete requests were made.

Automatic approval review rejected an earlier proposed probe because it used backup-derived identifiers and an unverified destination; that probe did not run. After locally verifying the destination and removing private-backup access, review allowed the revised request above. Cloudflare's rejection is the remaining blocker, not an approval-review rejection.

Private evidence: `/private/tmp/BeerSelectorNative-live-worker/health.json` and `health-metadata.json`. The temporary probe is `/private/tmp/beerselector-live-worker-probe.py`; it reads the local configuration at runtime and contains no embedded key.

To resume: the site owner must permit the intended verification client at the Cloudflare edge. Then verify health, the public store proxy, a bounded batch lookup and ETag revalidation with the native decoders; observe any genuinely pending cleanup within the native rate and polling bounds. Do not fabricate production beer records or induce rate-limit traffic merely to manufacture coverage. All current success evidence for contract parsing, rate limits and delayed cleanup remains fixture-based.
