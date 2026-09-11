# Remaining hands-on accessibility and lifecycle checks

Use a build containing the current accessibility fixes. TestFlight build 61 predates these changes. Distribution remains paused; this checklist does not authorize an upload or live queue mutations.

## VoiceOver

Enable VoiceOver in iOS Settings → Accessibility. Navigate by swiping left/right; activate with a double-tap.

- Home: read the tasted count, move through navigation cards, open and close Settings. Confirm hidden beer tabs do not contribute off-screen focus targets.
- Beerfinder: reach search, each filter, Queue and Rewards. Expand one beer; verify its name, container, ABV and expanded/collapsed state are understandable. Reach Check In without activating it. Confirm decorative glyphs are not spoken as stray characters.
- Rewards: read journey progress and milestones, open an available reward, then choose Cancel. Both choices must be discoverable. Do not queue the reward for this check.
- Settings: reach Refresh All Data and Prepare Diagnostic Report, then close the sheet. Check that focus returns somewhere useful, without trapping navigation.
- Repeat key controls at the largest accessibility text size. Record the screen and exact missing/incorrect spoken label if anything fails.

## Live Activity

Use an already-existing queue during normal app use; avoid adding a beer solely for this check.

- With Live Activities disabled for BeerSelector, opening the app and refreshing must remain usable. Restore the original setting afterward.
- If an activity already exists, force-quit and reopen BeerSelector. Check that the app and queue recover; tapping the activity should open Beerfinder for the signed-in member.
- For expiry, note when the activity was created/last restarted by a queue change. After three hours without a queue change, observe the Lock Screen and reopen the app. Record what disappears before versus after reopening. Background cleanup is best effort; this is not a guarantee of removal at an exact wall-clock deadline.

Previously confirmed by the user: ordinary queue appearance/update and removal on logout/empty. Do not repeat these just to refill the checklist.

## Existing local evidence

76 automated model/persistence/network tests pass, including foreground refresh throttling and membership-aware deep links. Offline simulator checks cover tablet portrait/landscape, maximum-text card actions, reward confirmation cancellation, Settings controls, and view/scroll retention across background/foreground. These do not establish spoken VoiceOver quality or physical ActivityKit scheduling.
