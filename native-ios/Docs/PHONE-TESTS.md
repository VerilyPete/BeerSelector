# Phone test checklist: account, cache, and remaining behavior

Use the normal signed native build on the paired iPhone. Do not use Create Mock Session or Reset to First-Run State during this pass. This checklist does not include new check-ins, reward redemption, or queue deletion. Existing pending check-ins can automatically retry on launch/reconnect; inspect the pending indicator before testing reconnect.

Record each result as PASS / FAIL / NOT TESTED, with the step number and what appeared. Keep credentials and account identifiers out of reports. A screenshot of a failure is useful only after hiding personal information.

## 1. Signed-in data, navigation, cache, and offline recovery

1. Open BeerSelector after the in-place install. Check whether the existing login, selected store, and member progress survived. If Settings asks you to sign in, record that as a session-retention failure before signing in directly on the phone. Do not uninstall to fix it.
2. Open Settings → Refresh All Data while online. Wait for completion. Expect the busy state to finish and usable data to remain. Record any error exactly, omitting personal information.
3. Return Home. Record the tasted count and selected store privately. Open All Beers, Beerfinder, Tasted Brews, and Rewards; return Home between each. Expect the same account/store throughout, Home's tasted count to match Tasted Brews, and no tasted or already queued beer in Beerfinder. Empty Rewards can be legitimate.
4. In All Beers, search for a visible beer, clear the search, cycle ALL/DRAFT/CANS, then DATE/NAME/ABV and the direction control. Expect matching rows, correct container filtering/order, and unknown ABV last in both directions. Expand a row, then change the search/filter; the expansion should reset. Repeat a search on Finder and Tasted.
5. In Finder, open QUEUE and close it without deleting anything; open REWARDS and return. Expand a beer and open UNTAPPD, then dismiss it. Expect the right search and a return to the same app without losing login.
6. Swipe up to the app switcher and swipe BeerSelector away. Reopen it online. Expect the same account/store and populated lists after loading. Record any unexpected sign-in prompt or cache loss.
7. Turn on Airplane Mode, then explicitly turn Wi-Fi off (Airplane Mode may leave Wi-Fi enabled). Return to BeerSelector. Expect the offline indicator; All Beers, Tasted Brews, and cached Rewards should remain usable. The remote queue is not certified as an offline cache.
8. While offline, try Settings → Refresh All Data. A network error may take time because requests retry. Expect an eventual error and retained cached lists, not an empty replacement. Then force-quit and reopen while still offline. Expect the saved account and cached lists to remain accessible.
9. Turn Airplane Mode off and restore Wi-Fi. Wait for connectivity, then use Settings → Refresh All Data. Expect refresh to finish, the offline indicator to clear, and lists to remain usable. Existing queued operations may retry automatically; do not create one just for this test.

## 2. Login cancellation, account changes, enrichment, and statistics

10. While signed in as account A, open Settings → Login to Flying Saucer. Dismiss the login sheet without completing authentication (swipe down if needed). Expect account A, its store, tasted count and rewards to remain. Repeat once after entering part of the form, without submitting it; credentials stay on the phone.
11. Open LOG OUT, then cancel the confirmation. Expect no account change. For the full logout test, confirm only when ready to sign back in. Expect member data/navigation to disappear. Force-quit and reopen; the app must not restore the logged-out member. Sign in directly on the phone again and verify the member data returns.
12. If you have a second authorized account B, use Login to Flying Saucer to switch from A to B. Expect B's name/store/tastings/rewards with no A-only rows. Force-quit and reopen to check B persists, then switch back to A. Without a second account, mark this NOT TESTED; logging into A again is not an account-switch test.
13. Optional visitor transition: open Login to Flying Saucer and choose the hosted visitor option. Expect store browsing in All Beers, with member-only navigation unavailable and old personal progress/rewards hidden. Restart and verify visitor mode persists, then sign back into the member account. Record the exact point if old member data reappears.
14. For a visible beer with an ABV/description, record those values, refresh online, and inspect it again. Restart offline and confirm persisted values remain. Values can legitimately change upstream. This is a smoke test only: it does not prove missing-beer sync, rate limiting, or delayed cleanup behavior.
15. Open Settings → Developer Tools → Database Statistics. Compare All Beers, Tasted Beers, Rewards, and Pending operations against the app's lists. The current dialog reports in-memory counts; despite its subtitle, refresh times are not yet included. Record that as a known implementation gap.
16. Open View Preferences. Check `last_all_beers_refresh` and `last_my_beers_refresh` after a successful member refresh (millisecond timestamps). If testing timestamp clearing, choose Clear Refresh Timestamps → cancel first and confirm values remain; then choose Clear and confirm both are `0`. Restart online or Refresh All Data and check successful sources receive new timestamps. Failed refreshes should not get a new success timestamp. This changes refresh metadata, not saved beer rows.

## Controlled tests still needed for item 2

The phone steps cannot reliably produce authentication callbacks at precise cancellation points, logout during an outstanding response, corrupt JSON, HTTP 429, or interrupted Keychain writes. These require isolated automated fixtures; do not attempt to force them against the live account.

Current automated evidence: 25 passing tests, including rejection of stale account writes during enrichment, real simulator Keychain generation cases, and the bounded post-sync lookup. Remaining work includes the full cancellation/failure-injection matrix, batch/proxy/health response validation, configurable rate/chunk reservation behavior, delayed enrichment polling/persistence, and complete statistics/refresh-time presentation. Mark these pending until implemented and tested.
