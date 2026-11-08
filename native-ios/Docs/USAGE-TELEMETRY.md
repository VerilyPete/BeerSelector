# Usage telemetry

The app reports daily per-install counts of feature use to the ufobeer worker's
`POST /usage`. It is **off** in every build until the distribution configuration
switches it on. The worker repository's `plans/usage-telemetry.md` is the authority
for the event list, wire shape, session rule and client protocol.

## What is sent

One JSON batch per flush:

| Field | Value |
|---|---|
| `install_id` | A random UUID created on this install's first recorded event |
| `batch_id` | A random UUID per frozen batch; the worker ignores a batch it has already recorded |
| `app_version` | `CFBundleShortVersionString` when the events were recorded |
| `ai_status` | `RecommendationCompatibility.current` when the events were recorded |
| `os_major` | The iOS major version |
| `events` | `[{name, count}]`, at most 500 per event per batch |

The batch has no timestamps, beer IDs, beer names, search text, member ID or card
number. The install ID is never derived from the member ID or the device. It
survives logout, account switch and **Reset App Data**. Only a reinstall replaces it.

The 25 event names and their trigger points are in `Core/Usage.swift` (`UsageEvent`)
and `Core/AppModel.swift` (`recordUsage`). Each fires once per user action, never from
view lifecycle hooks, and never in preview sessions.

## How it works

| Piece | File | Role |
|---|---|---|
| `UsageRecorder` | `Core/UsageRecorder.swift` | Live counters per dimension tuple, one pending batch, the session rule. Every change is one atomic write to `Application Support/Usage/state.json`, applied in memory only after it reaches disk. |
| `UsageHTTPTransport` | `Core/UsageTransport.swift` | POSTs to `{EnrichmentURL}/usage` with `X-API-Key`. Only a 204 deletes the batch. Nothing is retried immediately. |
| `UsageTelemetry` | `Core/UsageTelemetry.swift` | Keeps recorder calls in order, tracks whether the app is active, refreshes `lastActiveAt` once a minute, and flushes inside a background task on `.background` and when a session starts. |

A session starts on the first `.active` after launch or after a background when the
app was last in the foreground 3 or more hours ago. A flush sends up to 5 batches,
continuing only after each 204. A pending batch is dropped 7 days after it was frozen.

## Request contract

`Tests/Fixtures/usage-report.request.json` is the production encoder's output for a
canonical batch with every event; `usage-report.expected.json` is the hand-written
oracle. ufobeer's `contract-test/usageReport.contract.test.ts` runs the request
through the worker's real parser against this repository's `main`.

**Adding an event:** add it to the worker's `USAGE_EVENTS` and deploy first. Then add
the `UsageEvent` case, a count in `UsageContractTests.shuffledCounts`, the item in
`usage-report.expected.json`, and paste the new encoder output (printed by the failing
test) into `usage-report.request.json`. **Removing an event** goes the other way: the
app stops sending it first.

## Switching it on

Do not release a sending build unless ufobeer's usage contract passes against this
repository's `main`. A 204 makes the app delete its batch, so an encoder mismatch would
lose data silently.

1. In App Store Connect, update the app's privacy details (below).
2. Add `UsageTelemetryEnabled` with the **string** value `true` to the plist inside
   the Xcode Cloud secret `BEERSELECTOR_SERVICE_CONFIGURATION_BASE64`. The app reads
   that plist as `[String: String]`, so `ci_scripts/write-distribution-config.py`
   rejects any non-string value; a Boolean would otherwise drop every setting.
3. Mention the change in `TestFlight/WhatToTest.en-US.txt` for that build.

To switch it off, remove the key or set it to `false`. Counts keep accumulating
locally and are sent once it is on again, unless the pending batch is over 7 days old.

## Privacy details

From the worker plan. Purposes: **Analytics** and **App Functionality**. Linked to the
user through the install ID. **Not used for tracking**: never shared with third parties
or combined with other companies' data.

| Data | Apple category |
|---|---|
| Install ID | Identifiers → Device ID |
| Feature counts | Usage Data → Product Interaction |
| App version, `ai_status`, OS major | Diagnostics → Other Diagnostic Data |
| Client IP (worker logs) | Check Apple's current guidance before submission; most likely Diagnostics |
