# Legacy build-53 crash investigation — 2026-09-11

## Conclusion

The leading explanation is an Expo SQLite close-versus-query lifetime race. The native implementation does not carry over the background-close path or asynchronous shared statement objects. No production change is justified by this incident in the native migration. User requested keeping this investigation bounded; no legacy rebuild, forced crash or extended reproduction was performed.

## Evidence

The downloaded TestFlight report is for 1.1.0 (53), August 28 at 21:00:02.9519 CDT. The matching archived app/dSYM UUID is 333A00F9-EDB1-328F-8ABE-D9FF1026AFA2. Independent atos resolution verified the application frames.

- Thread 1 crashes in pthread mutex locking through exsqlite3_reset and SQLiteModule.run, SQLiteModule.swift:399.
- At the same instant, thread 9 is in SQLiteModule.closeDatabase, SQLiteModule.swift:489, through sqlite3Close and WAL cleanup.
- The reviewed legacy app invokes closeDatabaseConnection on backgrounding (app/_layout.tsx). connection.ts waits for prepareForShutdown(5000), but still calls closeAsync when it returns false. The manager tracks participating lock holders, not every database query: preferences and repository reads can bypass it. getDatabase also returns the existing handle while close is pending.
- These lifecycle/connection/lock-manager files are unchanged between current source and pre-archive commit 5163e49b. The actual build-53 Hermes bundle contains the background-close, shutdown preparation and forced-close-on-timeout messages. This corroborates the path's presence; it does not reconstruct the exact archive source commit or prove which callback triggered the recorded close.
- Inspected the lockfile-pinned expo-sqlite 16.0.10 npm package after checking its SHA-512 integrity, without installing/executing it. Both current and pre-archive lockfiles select this version. Its SQLiteModule.swift uses a concurrent module queue. run checks closed/finalized flags before taking its statement semaphore and calls reset at line 399. closeDatabase calls maybeFinalizeAllStatements before close at line 489. That cleanup enumerates/finalizes SQLite pointers without taking run's statement semaphore; explicit finalize likewise does not share that semaphore. The matching source line numbers support this package comparison, but archive dependency provenance was not independently reconstructed.

These facts make a close/query race substantially more plausible than a bad SQL string or an ordinary SQLITE_BUSY response. They do not prove that threads 1 and 9 held the same database pointer, identify the exact JS query, or demonstrate a particular interleaving. Expo exclusive transactions also close their own connection, so the thread-9 stack alone cannot identify app backgrounding as the trigger. [SQLite documents that using a finalized statement can cause segmentation faults or heap corruption](https://sqlite.org/c3ref/finalize.html).

## Native comparison

Core/Database.swift keeps its handle private, creates each statement inside synchronous execute/rows, and finalizes it on return with defer. There is no statement cache, escaping statement pointer, asynchronous reset/finalize API, or public close method. The only close is deinit. AppModel is MainActor-isolated and its production database calls are synchronous; transaction closures cannot suspend. BeerSelectorApp's background handler flushes diagnostics and does not close or replace the database.

Consequently, the concrete legacy path identified here is absent in native. FULLMUTEX alone would not make using freed pointers safe; scoped statement ownership and the absence of overlapping close are the meaningful differences. BeerDatabase itself is not actor-annotated, so future concurrency changes must preserve its current ownership/serialization contract. This review is not a claim that native SQLite can never fail or that the separate native phone exit is resolved.

## Disposition

No app or legacy code changed. Existing local/Cloud correctness evidence remains 74/74; tests were not rerun for this documentation-only investigation. Raw report and reviewed dependency source remain in ignored .build/CrashAnalysis/legacy53. A legacy hotfix would be separate work if legacy distribution is resumed or maintained; it is not part of this native investigation. Continue with accessibility and remaining device lifecycle checks.
