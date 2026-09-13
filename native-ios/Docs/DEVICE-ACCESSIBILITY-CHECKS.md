# Remaining hands-on accessibility and lifecycle checks

Use a build containing the current accessibility fixes. TestFlight build 61 predates these changes. Distribution remains paused; this checklist does not authorize an upload or live queue mutations.

## VoiceOver

Deferred at the user's request on September 12: keep these checks silent and do not enable VoiceOver.

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

The last full automated suite passed 120 tests; it was not rerun for this documentation-only check. Earlier offline simulator checks cover maximum-text card actions, reward confirmation cancellation, Settings controls, and view/scroll retention across background/foreground. These do not establish spoken VoiceOver quality or physical ActivityKit scheduling.

### September 12 silent check results

- Current local Debug app built successfully for iOS Simulator. Only the isolated review iPhone and iPad received the build; no physical installation or upload occurred.
- iPadOS 26.3: portrait/landscape Home → All Beers → Home → Rewards → Home navigation passed. Resizing to a narrow floating window visibly selected the compact Home layout. This was windowed mode, not a completed legacy Split View check. Subsequent Maestro accessibility data did not match the visible window, and direct coordinate taps did not establish navigation; narrow-window interaction remains unverified. Evidence: `/private/tmp/beerselector-silent-tablet.log`, `/private/tmp/ipad-resized.png`, `/private/tmp/beerselector-silent-window-nav.log`.
- iPhone iOS 26.3 offline fixtures: `beerselector://mybeers` opened Beerfinder; background/foreground retained it. After terminating and relaunching with the exact `--preview-fixtures` argument, the same URL opened Beerfinder again. An initial automation relaunch used the wrong argument format and was corrected. Evidence: `/private/tmp/beerselector-silent-phone.log`, `/private/tmp/beerselector-silent-relaunch.log`. This does not test an actual Lock Screen tap or ActivityKit survival after force-quit.
- Minimum iOS 17.6: deployment target remains 17.6 and the current SDK build passed. Xcode returned `iOS 17.6 is not available for download.` Only runtime 26.3 is installed; both reachable phone/tablet devices reported OS 26.6.2. Minimum-version runtime testing remains blocked by availability. Evidence: `/private/tmp/beerselector-runtime17.log`.
- User subsequently confirmed physical iPhone checks 1 and 2 passed: force-quit followed by tapping the Lock Screen activity opens Beerfinder with the queue intact; disabling Live Activities leaves app/queue refresh usable. Installed app reports build 61. Three-hour expiry remains pending; the user will check later. Record Lock Screen state before and after foregrounding, measured from creation or the last queue change. No expiry result is claimed.

### Silent physical follow-through

1. On the iPad, open BeerSelector beside another app; try approximately half and one-third widths. Open All Beers, Queue, Rewards, and Settings, then widen the window again. Verify every close button and bottom tab remains reachable and text does not overlap.
2. On the iPhone, note the original BeerSelector Live Activities setting, turn it off, then open BeerSelector and refresh. Verify the app remains usable and restore the setting.
3. When a queue activity already exists, swipe BeerSelector away in the app switcher. Tap the activity on the Lock Screen and verify Beerfinder opens and the queue is accurate. Also test reopening from the app icon. Do not add a beer solely for this check.
4. Note the activity's creation or last queue-change time. Leave the queue unchanged for three hours without an audible timer. Inspect the Lock Screen before reopening, then reopen and inspect again. Record removal before versus after foregrounding; background scheduling is best effort.
