# Live Activity Auto-Dismiss Implementation Plan Review

**Reviewer**: Claude (Mobile Development Expert)
**Date**: 2025-11-30
**Document Reviewed**: `/workspace/BeerSelector/docs/liveactivity/AUTO_DISMISS_IMPLEMENTATION.md`

---

## Executive Summary

The implementation plan is **well-structured and technically sound**. The end-and-restart pattern is a valid workaround for iOS's `staleDate` limitation. The plan correctly identifies that `staleDate` only dims the UI and does not automatically dismiss activities. Most patterns align with current React Native and iOS development best practices for 2024-2025.

**Overall Assessment**: **Approved with Minor Recommendations**

---

## 1. Validated Patterns (Current and Correct)

### 1.1 End-and-Restart Pattern - VALIDATED

The plan correctly identifies the iOS Live Activity limitation and proposes an appropriate workaround.

**Source Validation**: According to [Apple Developer Forums](https://developer.apple.com/forums/thread/740406) and [Stack Overflow discussions](https://stackoverflow.com/questions/76036824/staledate-in-activitykit-ios-16-2-16-4-seems-to-have-no-effect), the `staleDate` parameter only marks an activity as stale - it does NOT auto-dismiss it. The iOS system will keep activities visible for up to 8 hours unless explicitly ended.

**Key finding from research**:

> "When observing `activityStateUpdates`, developers expect to get a `.stale` value after the staleDate passes. However, for some developers, this never happens."

The plan's approach of ending and immediately restarting within the same `Task` block is the correct pattern.

### 1.2 Native Module Bridge Pattern - VALIDATED (with recommendations)

The current Objective-C/Swift bridge pattern (`RCT_EXTERN_MODULE` + `@objc` Swift methods) is **still valid and supported** in React Native 0.76+ and Expo SDK 52.

**Source**: [React Native Official Documentation](https://reactnative.dev/docs/legacy/native-modules-ios) and [Medium article on TurboModules](https://medium.com/@varunkukade999/build-native-and-turbo-modules-in-react-native-with-swift-e5d942226855)

**Key finding**:

> "While Swift is indeed possible, at the current stage of TurboModules, we have to employ a thin Objective-C layer to connect everything together."

The existing pattern in `LiveActivityModule.m` and `LiveActivityModule.swift` follows current best practices.

### 1.3 ActivityKit API Usage - VALIDATED

The Swift code correctly uses:

- `Activity<T>.request()` for starting activities
- `activity.end(dismissalPolicy: .immediate)` for ending activities
- `ActivityContent` with `staleDate` for content state

**Source**: [Apple's ActivityKit Documentation](https://developer.apple.com/documentation/activitykit) and [WWDC23 Session](https://developer.apple.com/videos/play/wwdc2023/10184/)

### 1.4 TypeScript Service Layer - VALIDATED

The service layer pattern with:

- Platform checks (`Platform.OS !== 'ios'`)
- Feature detection (`LiveActivityModule.areActivitiesEnabled()`)
- Graceful error handling (never throwing to crash the app)
- Module-level state tracking (`currentActivityId`)

These all follow current React Native best practices.

### 1.5 Jest + Maestro Testing Strategy - VALIDATED

The plan correctly follows the project's testing guidelines from `CLAUDE.md`:

- Jest for unit tests (pure functions, service logic)
- Maestro for E2E/integration tests
- No Jest for React Native hooks or integration tests

**Source**: [Maestro Documentation](https://docs.maestro.dev/platform-support/react-native) and [DEV Community best practices](https://dev.to/retyui/best-tips-tricks-for-e2e-maestro-with-react-native-2kaa)

---

## 2. Patterns Requiring Updates or Clarification

### 2.1 TurboModules Consideration - RECOMMENDATION

**Current Status**: The plan uses legacy Native Modules pattern, which is still supported but not optimal for React Native 0.76+ (New Architecture).

**Recommendation**: Consider migrating to TurboModules or Expo Modules API in a future iteration.

**Source**: [Expo Modules API Documentation](https://docs.expo.dev/modules/overview/)

> "The Expo Modules API allows you to write Swift and Kotlin to add new capabilities to your app with native modules and views. Expo Modules all support the New Architecture and are automatically backwards compatible."

**However**, for this specific implementation, the legacy pattern is acceptable because:

1. It's already working in the codebase
2. TurboModules migration would be a larger refactor
3. The plan focuses on feature implementation, not architecture migration

**Action**: Add a TODO comment noting future TurboModules migration consideration.

### 2.2 expo-live-activity Alternative - INFORMATION

**Note**: Software Mansion has released [expo-live-activity](https://github.com/software-mansion-labs/expo-live-activity), which provides a simpler API for Live Activities with Expo.

**Source**: [Software Mansion GitHub](https://github.com/software-mansion-labs/expo-live-activity)

**Key Features**:

- Auto-generates native SwiftUI target
- Built-in config plugin
- Handles push token management
- Activity state listeners (`addActivityUpdatesListener`)

**Recommendation**: The current custom native module approach is **preferred for this project** because:

1. It provides full control over SwiftUI layout (expo-live-activity has limited customization)
2. The project uses local Xcode builds, not EAS
3. The custom module is already integrated and working

### 2.3 Jest Debounce Testing - VALIDATED WITH CLARIFICATION

The debounce testing approach in the plan is correct, but needs clarification on timer usage.

**Source**: [Jest Timer Mocks Documentation](https://jestjs.io/docs/timer-mocks) and [TestDouble article](https://testdouble.com/insights/jest-timers-vs-waitfor-debounced-inputs)

**Important Clarification**: The plan shows using `jest.useFakeTimers()` with debounce tests. This is correct, but:

> "Lodash's debounce needs special treatments in tests because it uses setTimeout() recursively. Calling `jest.runAllTimers()` to mock setTimeout will lead to infinite recursion error."

**Recommendation**: Use `jest.advanceTimersByTime()` or `jest.runOnlyPendingTimers()` instead of `jest.runAllTimers()` if using lodash-style debounce. The plan's custom debounce implementation should avoid this issue, but add a note.

**Updated test pattern**:

```typescript
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it('should debounce rapid restart calls', async () => {
  // Call multiple times
  debouncedRestartActivity(beers1, session);
  debouncedRestartActivity(beers2, session);
  debouncedRestartActivity(beers3, session);

  // Use advanceTimersByTime, not runAllTimers
  jest.advanceTimersByTime(500);

  // Assert only one native call was made
  expect(LiveActivityModule.restartActivity).toHaveBeenCalledTimes(1);
});
```

---

## 3. Suggested Improvements

### 3.1 Add Activity State Listener

**Enhancement**: Consider adding activity state observation to handle edge cases.

**Source**: [expo-live-activity API](https://github.com/software-mansion-labs/expo-live-activity)

> "`addActivityUpdatesListener` API allows subscribing to changes in Live Activity state. Handler receives an `ActivityUpdateEvent` object with `activityState` property: 'active', 'dismissed', 'pending', 'stale' or 'ended'."

**Implementation suggestion** (for Swift module):

```swift
/// Observe activity state changes (optional enhancement)
private func observeActivityState() async {
  if #available(iOS 16.2, *) {
    for activity in Activity<BeerQueueAttributes>.activities {
      Task {
        for await state in activity.activityStateUpdates {
          switch state {
          case .dismissed:
            // User dismissed the activity
            self.currentActivityId = nil
          case .ended:
            // Activity was ended by system
            self.currentActivityId = nil
          default:
            break
          }
        }
      }
    }
  }
}
```

### 3.2 Semaphore Pattern for App Termination

**Important**: When the app terminates, async tasks may not complete before the process exits.

**Source**: [Stack Overflow discussion](https://stackoverflow.com/questions/76541035/dismiss-live-activities-on-app-termination)

> "Using a simple Task to end activities won't work because the method returns and allows the app to terminate before the activities get a chance to actually end."

**Recommendation**: Add semaphore-based synchronous ending for app termination scenarios:

```swift
/// Synchronously end all activities (for app termination)
@objc func endAllActivitiesSync() {
  if #available(iOS 16.1, *) {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
      for activity in Activity<BeerQueueAttributes>.activities {
        await activity.end(dismissalPolicy: .immediate)
      }
      semaphore.signal()
    }
    semaphore.wait()
    self.currentActivityId = nil
  }
}
```

### 3.3 Debounce Implementation Improvement

**Current approach**: Custom debounce with Promise-based state.

**Suggested improvement**: Use a simpler, more testable debounce pattern:

```typescript
// Simpler debounce utility
function createDebouncer<T extends (...args: any[]) => Promise<any>>(fn: T, delay: number) {
  let timeoutId: NodeJS.Timeout | null = null;
  let latestArgs: Parameters<T> | null = null;
  let latestResolve: ((value: Awaited<ReturnType<T>>) => void) | null = null;
  let latestReject: ((error: Error) => void) | null = null;

  return (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    return new Promise((resolve, reject) => {
      latestArgs = args;
      latestResolve = resolve;
      latestReject = reject;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(async () => {
        timeoutId = null;
        if (latestArgs && latestResolve) {
          try {
            const result = await fn(...latestArgs);
            latestResolve(result);
          } catch (error) {
            latestReject?.(error instanceof Error ? error : new Error(String(error)));
          }
        }
      }, delay);
    });
  };
}
```

### 3.4 Add Deep Link Support

**Enhancement for future**: When users tap the Live Activity, add deep link navigation.

**Source**: [GeekyAnts Guide](https://geekyants.com/en-us/blog/ios-live-activities-in-react-native-a-complete-guide)

> "When starting a new Live Activity, it's possible to pass `deepLinkUrl` field in config object. This usually should be a path to one of your screens."

---

## 4. Potential Issues and Mitigations

### 4.1 Flicker During Restart

**Risk**: Users may perceive visual flicker between end and start.

**Mitigations already in plan**:

1. Same `Task` block execution (minimizes gap)
2. `.immediate` dismissal policy
3. 500ms debounce window

**Additional mitigation**: The Dynamic Island has built-in transition animations that should smooth over sub-100ms gaps. Real-device testing should validate this.

### 4.2 Race Conditions

**Risk**: Multiple simultaneous calls to `restartActivity` could cause issues.

**Mitigation in plan**: Debouncing handles this by coalescing rapid calls.

**Recommendation**: Add a mutex/lock in the native module for extra safety:

```swift
private let activityLock = NSLock()

@objc func restartActivity(...) {
  activityLock.lock()
  defer { activityLock.unlock() }
  // ... rest of implementation
}
```

### 4.3 Memory Leaks from Pending Promises

**Risk**: If the debouncer accumulates many pending resolvers, memory could grow.

**Current mitigation**: Plan already clears `pendingResolvers` after execution.

**Recommendation**: Add a maximum pending count or timeout to prevent unbounded growth.

---

## 5. Testing Recommendations

### 5.1 Unit Tests (Jest) - APPROVED

The proposed test cases are appropriate:

- `restartActivity` function tests
- `debouncedRestartActivity` function tests
- Edge case handling (empty queue, no activity, errors)

**Note**: Ensure fake timers are properly cleaned up with `jest.useRealTimers()` in `afterEach`.

### 5.2 E2E Tests (Maestro) - APPROVED WITH NOTE

The Maestro test cases are well-structured.

**Note**: Live Activities cannot be directly verified in Maestro (they appear on lock screen/Dynamic Island). The tests correctly focus on verifying app state and queue behavior.

**Addition**: Consider adding a Maestro test for the logout flow to verify activities are cleaned up:

```yaml
# .maestro/live-activity-logout.yaml
appId: org.verily.FSbeerselector
---
- launchApp
# ... login and add beer to queue
- tapOn: 'Settings'
- tapOn: 'Logout'
- assertVisible: 'Login'
# Verify app doesn't crash and state is clean
```

### 5.3 Manual Testing - CRITICAL

The manual testing checklist is comprehensive. **Most important tests**:

1. **Physical device only** - Simulator does not support Live Activities
2. **3+ hour test** - Must verify stale behavior works correctly
3. **Force quit test** - Verify `syncLiveActivityOnLaunch` recovers state

---

## 6. Documentation Quality

The implementation plan is **well-documented** with:

- Clear rationale for design decisions
- Comprehensive test cases (TDD approach)
- Edge case handling
- Rollback considerations
- File change summary

**Minor improvements**:

- Add links to the actual Apple documentation in the plan
- Add version requirements (iOS 16.1+ minimum)

---

## 7. Summary of Recommendations

### Must Do (Before Implementation)

1. None - plan is implementation-ready

### Should Do (During Implementation)

1. Use `jest.advanceTimersByTime()` instead of `jest.runAllTimers()` for debounce tests
2. Add activity state observation for better edge case handling
3. Consider semaphore pattern for app termination scenarios
4. Add mutex/lock in native module for thread safety

### Could Do (Future Enhancements)

1. Migrate to TurboModules or Expo Modules API
2. Add deep link support for Live Activity taps
3. Add analytics/monitoring for restart success rates
4. Consider expo-live-activity package if simpler API is desired

---

## 8. Sources and References

### Official Documentation

- [Apple ActivityKit Documentation](https://developer.apple.com/documentation/activitykit)
- [Apple Live Activities HIG](https://developer.apple.com/design/human-interface-guidelines/live-activities)
- [WWDC23 Meet ActivityKit](https://developer.apple.com/videos/play/wwdc2023/10184/)
- [React Native Native Modules (iOS)](https://reactnative.dev/docs/legacy/native-modules-ios)
- [Expo Modules API Overview](https://docs.expo.dev/modules/overview/)
- [Jest Timer Mocks](https://jestjs.io/docs/timer-mocks)

### Community Resources

- [GeekyAnts: iOS Live Activities in React Native](https://geekyants.com/en-us/blog/ios-live-activities-in-react-native-a-complete-guide)
- [Software Mansion expo-live-activity](https://github.com/software-mansion-labs/expo-live-activity)
- [Using Live Activities in React Native App (AddJam, Feb 2025)](https://addjam.com/blog/2025-02-04/using-live-activities-react-native-app/)
- [Maestro React Native Support](https://docs.maestro.dev/platform-support/react-native)
- [DEV Community: Maestro Best Practices](https://dev.to/retyui/best-tips-tricks-for-e2e-maestro-with-react-native-2kaa)
- [Medium: TurboModules with Swift](https://medium.com/@varunkukade999/build-native-and-turbo-modules-in-react-native-with-swift-e5d942226855)

### Stack Overflow / Developer Forums

- [staleDate limitation discussion](https://stackoverflow.com/questions/76036824/staledate-in-activitykit-ios-16-2-16-4-seems-to-have-no-effect)
- [Apple Forums: staleDate behavior](https://developer.apple.com/forums/thread/740406)
- [Dismiss Live Activities on App Termination](https://stackoverflow.com/questions/76541035/dismiss-live-activities-on-app-termination)
- [Jest debounce testing](https://stackoverflow.com/questions/52224447/jest-unit-test-for-a-debounce-function)

---

## Approval

**Status**: APPROVED FOR IMPLEMENTATION

The plan is technically sound and follows current best practices for React Native + iOS Live Activities integration. The minor recommendations above can be incorporated during implementation without blocking.

**Signed**: Claude (Mobile Development Expert)
**Date**: 2025-11-30
