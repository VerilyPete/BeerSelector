# Live Activity Auto-Dismiss Implementation Plan

## End-and-Restart Pattern with Expo Modules API

**Version**: 2.1
**Created**: 2025-11-30
**Updated**: 2025-11-30
**Status**: COMPLETED
**Feature**: Auto-dismiss Live Activity 3 hours after last queue update

> **Implementation Complete**: All work items have been implemented. See `IMPLEMENTATION_COMPLETE.md` for a summary of the final implementation.

---

## Table of Contents

1. [Overview and Changes from v1.0](#1-overview-and-changes-from-v10)
2. [Architecture: Expo Modules API Migration](#2-architecture-expo-modules-api-migration)
3. [Work Item Breakdown](#3-work-item-breakdown)
4. [Implementation Details](#4-implementation-details)
5. [Edge Cases and Error Handling](#5-edge-cases-and-error-handling)
6. [Testing Checklist](#6-testing-checklist)
7. [Rollback Considerations](#7-rollback-considerations)

---

## 1. Overview and Changes from v1.0

### What Changed

This v2.0 plan incorporates feedback from the architecture review and code review:

| Area            | v1.0 Approach                       | v2.0 Approach                               |
| --------------- | ----------------------------------- | ------------------------------------------- |
| Native Module   | Legacy Native Modules (ObjC bridge) | Expo Modules API (pure Swift)               |
| Module Location | `ios/BeerSelector/`                 | `modules/live-activity/`                    |
| Timer Testing   | Generic fake timers                 | `jest.advanceTimersByTime()` pattern        |
| Activity State  | No observation                      | Activity state listener for user dismissals |
| App Termination | Async Task                          | Semaphore pattern for sync termination      |
| Thread Safety   | None                                | NSLock mutex in native module               |
| Deep Linking    | Was a task                          | Already enabled (removed from scope)        |

### Why Expo Modules API?

1. **Already using Expo SDK 52** - `expo-modules-core` is installed
2. **Pure Swift** - No Objective-C bridge file needed (eliminates 47 lines)
3. **Better DX** - SwiftUI-like declarative DSL
4. **Future-proof** - Used by all official Expo packages
5. **No codegen** - Avoids TurboModules' brittle code generation

### End-and-Restart Pattern Rationale

iOS `staleDate` only dims activities - it does NOT auto-dismiss. The end-and-restart pattern:

1. Ends current activity immediately
2. Starts new activity with fresh 3-hour `staleDate`
3. Debounced to prevent flicker from rapid updates

---

## 2. Architecture: Expo Modules API Migration

### New File Structure

```
modules/
  live-activity/
    ios/
      LiveActivityModule.swift        # Main Expo module (pure Swift)
    src/
      index.ts                        # TypeScript interface
      __tests__/
        index.test.ts                 # Module type tests
    expo-module.config.json           # Module configuration

src/
  services/
    liveActivityService.ts            # Updated service layer
    liveActivityDebounce.ts           # Extracted debounce utility
    __tests__/
      liveActivityService.test.ts     # Service unit tests
      liveActivityDebounce.test.ts    # Debounce unit tests
  types/
    liveActivity.ts                   # Updated type definitions

.maestro/
  live-activity-restart.yaml          # E2E test
  live-activity-debounce.yaml         # E2E test
  live-activity-logout.yaml           # E2E test
```

### Files to Delete After Migration

```
ios/BeerSelector/LiveActivityModule.swift   # Replaced by Expo module
ios/BeerSelector/LiveActivityModule.m       # No longer needed
```

---

## 3. Work Item Breakdown

### Work Item 1: Create Expo Module Structure (COMPLETED)

**Estimated effort**: 1-2 hours
**Prerequisites**: None
**Tests to write first**: TypeScript type tests

#### Tests to Write First

```typescript
// modules/live-activity/src/__tests__/index.test.ts
import LiveActivityModule from '../index';

describe('LiveActivityModule types', () => {
  it('should export the correct function signatures', () => {
    // Type-level tests - these verify the interface exists
    expect(typeof LiveActivityModule.areActivitiesEnabled).toBe('function');
    expect(typeof LiveActivityModule.startActivity).toBe('function');
    expect(typeof LiveActivityModule.updateActivity).toBe('function');
    expect(typeof LiveActivityModule.endActivity).toBe('function');
    expect(typeof LiveActivityModule.endAllActivities).toBe('function');
    expect(typeof LiveActivityModule.restartActivity).toBe('function');
    expect(typeof LiveActivityModule.getAllActivityIds).toBe('function');
  });
});
```

#### Implementation Steps

1. Create directory structure: `mkdir -p modules/live-activity/ios modules/live-activity/src/__tests__`
2. Create `modules/live-activity/expo-module.config.json`:
   ```json
   {
     "platforms": ["ios"],
     "ios": {
       "modules": ["LiveActivityModule"]
     }
   }
   ```
3. Create `modules/live-activity/src/index.ts` with TypeScript interface
4. Run type tests to verify interface compiles

#### Acceptance Criteria

- [x] Directory structure exists
- [x] `expo-module.config.json` is valid JSON
- [x] TypeScript interface compiles without errors
- [x] Type tests pass (may mock native module)

#### Files Created

| File                                                | Status  |
| --------------------------------------------------- | ------- |
| `modules/live-activity/expo-module.config.json`     | Created |
| `modules/live-activity/src/index.ts`                | Created |
| `modules/live-activity/src/__tests__/index.test.ts` | Created |
| `modules/live-activity/package.json`                | Created |

---

### Work Item 2: Implement Expo Module Swift Code (COMPLETED)

**Estimated effort**: 2-3 hours
**Prerequisites**: Work Item 1
**Tests to write first**: None (Swift module tested via E2E)

#### Implementation Steps

1. Create `modules/live-activity/ios/LiveActivityModule.swift` using Expo Modules DSL
2. Implement all existing methods:
   - `areActivitiesEnabled()`
   - `startActivity(data:)`
   - `updateActivity(activityId:data:)`
   - `endActivity(activityId:)`
   - `endAllActivities()`
   - `getAllActivityIds()`
   - `endActivitiesOlderThan(maxAgeSeconds:)`
3. Add new `restartActivity(data:)` method
4. Add thread safety with `NSLock`
5. Add activity state observer
6. Add semaphore-based sync ending for app termination

#### Swift Implementation

```swift
// modules/live-activity/ios/LiveActivityModule.swift
import ExpoModulesCore
import ActivityKit

public class LiveActivityModule: Module {
  private var currentActivityId: String?
  private let activityLock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    // MARK: - Query Functions

    AsyncFunction("areActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.1, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("getAllActivityIds") { () -> [String] in
      guard #available(iOS 16.1, *) else { return [] }
      return Activity<BeerQueueAttributes>.activities.map { $0.id }
    }

    // MARK: - Activity Lifecycle

    AsyncFunction("startActivity") { (data: StartActivityData) -> String in
      guard #available(iOS 16.1, *) else {
        throw LiveActivityUnsupportedException()
      }

      self.activityLock.lock()
      defer { self.activityLock.unlock() }

      let attributes = BeerQueueAttributes(
        memberId: data.memberId,
        storeId: data.storeId
      )

      let beers = data.beers.map { QueuedBeer(id: $0.id, name: $0.name) }
      let contentState = BeerQueueAttributes.ContentState(beers: beers)
      let staleDate = Date().addingTimeInterval(3 * 60 * 60)

      let activity = try Activity<BeerQueueAttributes>.request(
        attributes: attributes,
        content: ActivityContent(state: contentState, staleDate: staleDate),
        pushType: nil
      )

      self.currentActivityId = activity.id
      self.observeActivityState(activity)

      print("[LiveActivityModule] Started activity: \(activity.id)")
      return activity.id
    }

    AsyncFunction("updateActivity") { (activityId: String, data: UpdateActivityData) -> Bool in
      guard #available(iOS 16.1, *) else {
        throw LiveActivityUnsupportedException()
      }

      let beers = data.beers.map { QueuedBeer(id: $0.id, name: $0.name) }
      let contentState = BeerQueueAttributes.ContentState(beers: beers)
      let staleDate = Date().addingTimeInterval(3 * 60 * 60)
      let content = ActivityContent(state: contentState, staleDate: staleDate)

      for activity in Activity<BeerQueueAttributes>.activities {
        if activity.id == activityId {
          await activity.update(content)
          print("[LiveActivityModule] Updated activity: \(activityId)")
          return true
        }
      }

      throw ActivityNotFoundException(activityId)
    }

    AsyncFunction("endActivity") { (activityId: String) -> Bool in
      guard #available(iOS 16.1, *) else { return true }

      self.activityLock.lock()
      defer { self.activityLock.unlock() }

      for activity in Activity<BeerQueueAttributes>.activities {
        if activity.id == activityId {
          await activity.end(dismissalPolicy: .immediate)
          if self.currentActivityId == activityId {
            self.currentActivityId = nil
          }
          print("[LiveActivityModule] Ended activity: \(activityId)")
          return true
        }
      }
      return true
    }

    AsyncFunction("endAllActivities") { () -> Bool in
      guard #available(iOS 16.1, *) else { return true }

      self.activityLock.lock()
      defer { self.activityLock.unlock() }

      for activity in Activity<BeerQueueAttributes>.activities {
        await activity.end(dismissalPolicy: .immediate)
        print("[LiveActivityModule] Ended activity: \(activity.id)")
      }
      self.currentActivityId = nil
      return true
    }

    // MARK: - New: Restart Activity (End-and-Restart Pattern)

    AsyncFunction("restartActivity") { (data: StartActivityData) -> String? in
      guard #available(iOS 16.1, *) else {
        throw LiveActivityUnsupportedException()
      }

      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        throw LiveActivityDisabledException()
      }

      self.activityLock.lock()
      defer { self.activityLock.unlock() }

      // If beers is empty, just end activity
      if data.beers.isEmpty {
        await self.endAllActivitiesInternal()
        print("[LiveActivityModule] Restart with empty queue - ended activity")
        return nil
      }

      // End existing activities (same Task block for minimal gap)
      await self.endAllActivitiesInternal()

      // Immediately start new activity
      let attributes = BeerQueueAttributes(
        memberId: data.memberId,
        storeId: data.storeId
      )

      let beers = data.beers.map { QueuedBeer(id: $0.id, name: $0.name) }
      let contentState = BeerQueueAttributes.ContentState(beers: beers)
      let staleDate = Date().addingTimeInterval(3 * 60 * 60)

      let activity = try Activity<BeerQueueAttributes>.request(
        attributes: attributes,
        content: ActivityContent(state: contentState, staleDate: staleDate),
        pushType: nil
      )

      self.currentActivityId = activity.id
      self.observeActivityState(activity)

      print("[LiveActivityModule] Restarted activity: \(activity.id)")
      return activity.id
    }

    // MARK: - Stale Activity Cleanup

    AsyncFunction("endActivitiesOlderThan") { (maxAgeSeconds: Double) -> Int in
      guard #available(iOS 16.2, *) else {
        // Fallback for iOS 16.1 - end all
        if #available(iOS 16.1, *) {
          let count = Activity<BeerQueueAttributes>.activities.count
          for activity in Activity<BeerQueueAttributes>.activities {
            await activity.end(dismissalPolicy: .immediate)
          }
          self.currentActivityId = nil
          return count
        }
        return 0
      }

      var endedCount = 0
      let now = Date()

      for activity in Activity<BeerQueueAttributes>.activities {
        if let staleDate = activity.content.staleDate, staleDate < now {
          await activity.end(dismissalPolicy: .immediate)
          print("[LiveActivityModule] Ended stale activity: \(activity.id)")
          endedCount += 1
        }
      }

      if endedCount > 0 {
        self.currentActivityId = nil
      }

      return endedCount
    }

    // MARK: - Synchronous End (for app termination)

    Function("endAllActivitiesSync") { () -> Bool in
      guard #available(iOS 16.1, *) else { return true }

      let semaphore = DispatchSemaphore(value: 0)

      Task {
        self.activityLock.lock()
        defer { self.activityLock.unlock() }

        for activity in Activity<BeerQueueAttributes>.activities {
          await activity.end(dismissalPolicy: .immediate)
        }
        self.currentActivityId = nil
        semaphore.signal()
      }

      // Wait up to 1 second for completion
      _ = semaphore.wait(timeout: .now() + 1.0)
      return true
    }
  }

  // MARK: - Private Helpers

  private func endAllActivitiesInternal() async {
    if #available(iOS 16.1, *) {
      for activity in Activity<BeerQueueAttributes>.activities {
        await activity.end(dismissalPolicy: .immediate)
        print("[LiveActivityModule] Ended activity: \(activity.id)")
      }
      self.currentActivityId = nil
    }
  }

  @available(iOS 16.1, *)
  private func observeActivityState(_ activity: Activity<BeerQueueAttributes>) {
    Task {
      for await state in activity.activityStateUpdates {
        switch state {
        case .dismissed:
          // User dismissed the activity
          if self.currentActivityId == activity.id {
            self.currentActivityId = nil
          }
          print("[LiveActivityModule] Activity dismissed by user: \(activity.id)")
        case .ended:
          // Activity was ended by system
          if self.currentActivityId == activity.id {
            self.currentActivityId = nil
          }
          print("[LiveActivityModule] Activity ended by system: \(activity.id)")
        default:
          break
        }
      }
    }
  }
}

// MARK: - Data Records

struct StartActivityData: Record {
  @Field var memberId: String
  @Field var storeId: String
  @Field var beers: [BeerData]
}

struct UpdateActivityData: Record {
  @Field var beers: [BeerData]
}

struct BeerData: Record {
  @Field var id: String
  @Field var name: String
}

// MARK: - Exceptions

class LiveActivityUnsupportedException: Exception {
  override var reason: String {
    "Live Activities require iOS 16.1+"
  }
}

class LiveActivityDisabledException: Exception {
  override var reason: String {
    "Live Activities are disabled in Settings"
  }
}

class ActivityNotFoundException: GenericException<String> {
  override var reason: String {
    "Activity not found with ID: \(param)"
  }
}
```

#### Acceptance Criteria

- [x] Swift file compiles without errors
- [x] All existing methods implemented
- [x] New `restartActivity()` method implemented
- [x] Thread safety with `NSLock`
- [x] Activity state observer added
- [x] Semaphore-based `endAllActivitiesSync()` added
- [x] `pod install` succeeds

**Implementation Note**: The podspec required `DEFINES_MODULE = YES` and `SWIFT_COMPILATION_MODE = wholemodule` in `pod_target_xcconfig` for proper module compilation. See `EXPO_MODULE_FIX_PLAN.md` for details on this fix.

#### Files Created

| File                                                   | Status  |
| ------------------------------------------------------ | ------- |
| `modules/live-activity/ios/LiveActivityModule.swift`   | Created |
| `modules/live-activity/ios/BeerQueueSharedTypes.swift` | Created |
| `modules/live-activity/ios/LiveActivity.podspec`       | Created |

---

### Work Item 3: Implement Debounce Utility (TDD) (COMPLETED)

**Estimated effort**: 1-2 hours
**Prerequisites**: None (pure TypeScript)
**Tests to write first**: All debounce tests

#### Tests to Write First

```typescript
// src/services/__tests__/liveActivityDebounce.test.ts
import { createDebouncer, type Debouncer } from '../liveActivityDebounce';

describe('createDebouncer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should create a debouncer with specified delay', () => {
    const fn = jest.fn();
    const debouncer = createDebouncer(fn, 500);

    expect(debouncer).toHaveProperty('call');
    expect(debouncer).toHaveProperty('cancel');
    expect(debouncer).toHaveProperty('isPending');
  });

  it('should track pending state correctly', () => {
    const fn = jest.fn().mockResolvedValue('result');
    const debouncer = createDebouncer(fn, 500);

    expect(debouncer.isPending()).toBe(false);

    debouncer.call('arg1');
    expect(debouncer.isPending()).toBe(true);

    jest.advanceTimersByTime(500);
    expect(debouncer.isPending()).toBe(false);
  });

  it('should debounce rapid calls within window', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const debouncer = createDebouncer(fn, 500);

    debouncer.call('arg1');
    debouncer.call('arg2');
    debouncer.call('arg3');

    // Use advanceTimersByTime (not runAllTimers)
    jest.advanceTimersByTime(500);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('arg3');
  });

  it('should use latest arguments for debounced execution', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const debouncer = createDebouncer(fn, 500);

    debouncer.call('first');
    jest.advanceTimersByTime(200);
    debouncer.call('second');
    jest.advanceTimersByTime(200);
    debouncer.call('third');
    jest.advanceTimersByTime(500);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('third');
  });

  it('should allow cancellation of pending call', () => {
    const fn = jest.fn().mockResolvedValue('result');
    const debouncer = createDebouncer(fn, 500);

    debouncer.call('arg1');
    expect(debouncer.isPending()).toBe(true);

    debouncer.cancel();
    expect(debouncer.isPending()).toBe(false);

    jest.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });

  it('should resolve all pending promises with final result', async () => {
    const fn = jest.fn().mockResolvedValue('final-result');
    const debouncer = createDebouncer(fn, 500);

    const promise1 = debouncer.call('arg1');
    const promise2 = debouncer.call('arg2');
    const promise3 = debouncer.call('arg3');

    jest.advanceTimersByTime(500);

    // All promises should resolve with the same result
    await expect(promise1).resolves.toBe('final-result');
    await expect(promise2).resolves.toBe('final-result');
    await expect(promise3).resolves.toBe('final-result');
  });

  it('should reject pending promises when cancelled', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const debouncer = createDebouncer(fn, 500);

    const promise = debouncer.call('arg1');
    debouncer.cancel();

    await expect(promise).rejects.toThrow('Debounced call cancelled');
  });

  it('should handle function errors correctly', async () => {
    const error = new Error('Function failed');
    const fn = jest.fn().mockRejectedValue(error);
    const debouncer = createDebouncer(fn, 500);

    const promise = debouncer.call('arg1');
    jest.advanceTimersByTime(500);

    await expect(promise).rejects.toThrow('Function failed');
  });

  it('should allow new calls after execution completes', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const debouncer = createDebouncer(fn, 500);

    debouncer.call('first');
    jest.advanceTimersByTime(500);

    debouncer.call('second');
    jest.advanceTimersByTime(500);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'first');
    expect(fn).toHaveBeenNthCalledWith(2, 'second');
  });
});
```

#### Implementation Steps

1. Run tests (they will fail - TDD red phase)
2. Implement `createDebouncer` in `src/services/liveActivityDebounce.ts`
3. Run tests again (should pass - TDD green phase)
4. Refactor if needed (TDD refactor phase)

#### Implementation

```typescript
// src/services/liveActivityDebounce.ts

/**
 * Debouncer interface for type-safe debounced function calls
 */
export interface Debouncer<TArgs extends any[], TResult> {
  /** Call the debounced function with arguments */
  call: (...args: TArgs) => Promise<TResult>;

  /** Cancel any pending debounced call */
  cancel: () => void;

  /** Check if a call is pending */
  isPending: () => boolean;
}

interface PendingResolver<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Creates a debouncer that coalesces rapid function calls.
 *
 * - Only the last call within the delay window executes
 * - All callers receive the result from the final execution
 * - Cancellation rejects all pending promises
 *
 * @param fn - The async function to debounce
 * @param delayMs - Debounce delay in milliseconds
 * @returns Debouncer interface
 */
export function createDebouncer<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  delayMs: number
): Debouncer<TArgs, TResult> {
  let timeoutId: NodeJS.Timeout | null = null;
  let latestArgs: TArgs | null = null;
  let pendingResolvers: PendingResolver<TResult>[] = [];

  const isPending = (): boolean => timeoutId !== null;

  const cancel = (): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    // Reject all pending promises
    const error = new Error('Debounced call cancelled');
    pendingResolvers.forEach(({ reject }) => reject(error));
    pendingResolvers = [];
    latestArgs = null;
  };

  const call = (...args: TArgs): Promise<TResult> => {
    return new Promise((resolve, reject) => {
      // Store latest args and add resolver
      latestArgs = args;
      pendingResolvers.push({ resolve, reject });

      // Clear existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Set new timeout
      timeoutId = setTimeout(async () => {
        timeoutId = null;
        const argsToUse = latestArgs;
        const resolvers = [...pendingResolvers];

        // Clear state before execution
        pendingResolvers = [];
        latestArgs = null;

        if (!argsToUse) {
          return;
        }

        try {
          const result = await fn(...argsToUse);
          resolvers.forEach(({ resolve }) => resolve(result));
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          resolvers.forEach(({ reject }) => reject(err));
        }
      }, delayMs);
    });
  };

  return { call, cancel, isPending };
}
```

#### Acceptance Criteria

- [x] All debounce tests pass
- [x] No lint errors
- [x] Uses `jest.advanceTimersByTime()` pattern (not `runAllTimers`)
- [x] Handles cancellation correctly
- [x] Handles errors correctly

**Note**: The debounce utility was implemented directly in the liveActivityService.ts rather than as a separate file for simplicity.

#### Files Created/Modified

| File                                                 | Status                             |
| ---------------------------------------------------- | ---------------------------------- |
| `src/services/liveActivityService.ts`                | Modified (includes debounce logic) |
| `src/services/__tests__/liveActivityService.test.ts` | Modified                           |

---

### Work Item 4: Update liveActivityService.ts (TDD) (COMPLETED)

**Estimated effort**: 2-3 hours
**Prerequisites**: Work Items 1, 2, 3
**Tests to write first**: All service tests for new functionality

#### Tests to Write First

```typescript
// src/services/__tests__/liveActivityService.test.ts
// Add these new test cases to existing file

describe('restartActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should end existing activity and start new one with same state', async () => {
    // Mock native module
    const mockRestartActivity = jest.fn().mockResolvedValue('new-activity-id');
    jest.doMock('@/modules/live-activity', () => ({
      default: {
        areActivitiesEnabled: jest.fn().mockResolvedValue(true),
        restartActivity: mockRestartActivity,
      },
    }));

    const { restartActivity } = require('../liveActivityService');

    const queueState = { beers: [{ id: '1', name: 'Test Beer' }] };
    const attributes = { memberId: 'M123', storeId: 'S456' };

    const result = await restartActivity(queueState, attributes);

    expect(mockRestartActivity).toHaveBeenCalledWith({
      memberId: 'M123',
      storeId: 'S456',
      beers: [{ id: '1', name: 'Test Beer' }],
    });
    expect(result).toBe('new-activity-id');
  });

  it('should return null if queue is empty', async () => {
    const mockRestartActivity = jest.fn().mockResolvedValue(null);
    jest.doMock('@/modules/live-activity', () => ({
      default: {
        areActivitiesEnabled: jest.fn().mockResolvedValue(true),
        restartActivity: mockRestartActivity,
      },
    }));

    const { restartActivity } = require('../liveActivityService');

    const queueState = { beers: [] };
    const attributes = { memberId: 'M123', storeId: 'S456' };

    const result = await restartActivity(queueState, attributes);

    expect(result).toBeNull();
  });

  it('should handle restart when activities not supported', async () => {
    jest.doMock('@/modules/live-activity', () => ({
      default: {
        areActivitiesEnabled: jest.fn().mockResolvedValue(false),
      },
    }));

    const { restartActivity } = require('../liveActivityService');

    const result = await restartActivity(
      { beers: [{ id: '1', name: 'Test' }] },
      { memberId: 'M123', storeId: 'S456' }
    );

    expect(result).toBeNull();
  });

  it('should handle native errors gracefully', async () => {
    jest.doMock('@/modules/live-activity', () => ({
      default: {
        areActivitiesEnabled: jest.fn().mockResolvedValue(true),
        restartActivity: jest.fn().mockRejectedValue(new Error('Native error')),
      },
    }));

    const { restartActivity } = require('../liveActivityService');

    // Should not throw, should return null
    const result = await restartActivity(
      { beers: [{ id: '1', name: 'Test' }] },
      { memberId: 'M123', storeId: 'S456' }
    );

    expect(result).toBeNull();
  });

  it('should handle foreground requirement error', async () => {
    jest.doMock('@/modules/live-activity', () => ({
      default: {
        areActivitiesEnabled: jest.fn().mockResolvedValue(true),
        restartActivity: jest
          .fn()
          .mockRejectedValue(
            new Error('The operation could not be completed because the target is not foreground')
          ),
      },
    }));

    const { restartActivity } = require('../liveActivityService');
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await restartActivity(
      { beers: [{ id: '1', name: 'Test' }] },
      { memberId: 'M123', storeId: 'S456' }
    );

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not in foreground'));
  });
});

describe('debouncedRestartActivity', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should debounce rapid restart calls (500ms window)', async () => {
    const mockRestartActivity = jest.fn().mockResolvedValue('activity-id');
    jest.doMock('@/modules/live-activity', () => ({
      default: {
        areActivitiesEnabled: jest.fn().mockResolvedValue(true),
        restartActivity: mockRestartActivity,
      },
    }));

    const { debouncedRestartActivity } = require('../liveActivityService');

    const session = { memberId: 'M123', storeId: 'S456' };

    // Multiple rapid calls
    debouncedRestartActivity([{ id: '1', name: 'Beer 1' }], session);
    debouncedRestartActivity([{ id: '2', name: 'Beer 2' }], session);
    debouncedRestartActivity([{ id: '3', name: 'Beer 3' }], session);

    // Use advanceTimersByTime (per review recommendation)
    jest.advanceTimersByTime(500);

    // Only one native call should have been made
    expect(mockRestartActivity).toHaveBeenCalledTimes(1);
  });

  it('should use latest state for debounced execution', async () => {
    const mockRestartActivity = jest.fn().mockResolvedValue('activity-id');
    jest.doMock('@/modules/live-activity', () => ({
      default: {
        areActivitiesEnabled: jest.fn().mockResolvedValue(true),
        restartActivity: mockRestartActivity,
      },
    }));

    const { debouncedRestartActivity } = require('../liveActivityService');

    const session = { memberId: 'M123', storeId: 'S456' };

    debouncedRestartActivity([{ id: '1', name: 'First' }], session);
    debouncedRestartActivity([{ id: '2', name: 'Second' }], session);
    debouncedRestartActivity([{ id: '3', name: 'Third' }], session);

    jest.advanceTimersByTime(500);

    // Should be called with the latest (third) state
    expect(mockRestartActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        beers: [{ id: '3', name: 'Third' }],
      })
    );
  });

  it('should handle empty queue during debounce correctly', async () => {
    const mockRestartActivity = jest.fn().mockResolvedValue(null);
    const mockEndAllActivities = jest.fn().mockResolvedValue(true);

    jest.doMock('@/modules/live-activity', () => ({
      default: {
        areActivitiesEnabled: jest.fn().mockResolvedValue(true),
        restartActivity: mockRestartActivity,
        endAllActivities: mockEndAllActivities,
      },
    }));

    const { debouncedRestartActivity } = require('../liveActivityService');

    const session = { memberId: 'M123', storeId: 'S456' };

    // First call with beers, then call with empty
    debouncedRestartActivity([{ id: '1', name: 'Beer' }], session);
    debouncedRestartActivity([], session);

    jest.advanceTimersByTime(500);

    // Should call with empty array, which ends activity
    expect(mockRestartActivity).toHaveBeenCalledWith(expect.objectContaining({ beers: [] }));
  });
});

describe('cancelPendingRestart', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should cancel pending debounced restart', async () => {
    const mockRestartActivity = jest.fn().mockResolvedValue('activity-id');
    jest.doMock('@/modules/live-activity', () => ({
      default: {
        areActivitiesEnabled: jest.fn().mockResolvedValue(true),
        restartActivity: mockRestartActivity,
      },
    }));

    const { debouncedRestartActivity, cancelPendingRestart } = require('../liveActivityService');

    const session = { memberId: 'M123', storeId: 'S456' };

    debouncedRestartActivity([{ id: '1', name: 'Beer' }], session);
    cancelPendingRestart();

    jest.advanceTimersByTime(500);

    expect(mockRestartActivity).not.toHaveBeenCalled();
  });
});

describe('updateLiveActivityWithQueue (restart pattern)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should use restart pattern instead of simple update', async () => {
    const mockRestartActivity = jest.fn().mockResolvedValue('activity-id');
    jest.doMock('@/modules/live-activity', () => ({
      default: {
        areActivitiesEnabled: jest.fn().mockResolvedValue(true),
        restartActivity: mockRestartActivity,
      },
    }));

    const { updateLiveActivityWithQueue } = require('../liveActivityService');

    const session = { memberId: 'M123', storeId: 'S456' };
    const beers = [{ id: '1', name: 'Test Beer' }];

    await updateLiveActivityWithQueue(beers, session, false);

    jest.advanceTimersByTime(500);

    // Should call restartActivity (restart pattern)
    expect(mockRestartActivity).toHaveBeenCalled();
  });

  it('should skip for visitor mode', async () => {
    const mockRestartActivity = jest.fn();
    jest.doMock('@/modules/live-activity', () => ({
      default: {
        areActivitiesEnabled: jest.fn().mockResolvedValue(true),
        restartActivity: mockRestartActivity,
      },
    }));

    const { updateLiveActivityWithQueue } = require('../liveActivityService');

    await updateLiveActivityWithQueue(
      [{ id: '1', name: 'Beer' }],
      { memberId: 'M123', storeId: 'S456' },
      true // visitor mode
    );

    jest.advanceTimersByTime(500);

    expect(mockRestartActivity).not.toHaveBeenCalled();
  });

  it('should skip if no session data', async () => {
    const mockRestartActivity = jest.fn();
    jest.doMock('@/modules/live-activity', () => ({
      default: {
        areActivitiesEnabled: jest.fn().mockResolvedValue(true),
        restartActivity: mockRestartActivity,
      },
    }));

    const { updateLiveActivityWithQueue } = require('../liveActivityService');

    await updateLiveActivityWithQueue(
      [{ id: '1', name: 'Beer' }],
      null, // no session
      false
    );

    jest.advanceTimersByTime(500);

    expect(mockRestartActivity).not.toHaveBeenCalled();
  });
});
```

#### Implementation Steps

1. Run tests (they will fail - TDD red phase)
2. Update import in `liveActivityService.ts` to use new Expo module
3. Implement `restartActivity()` function
4. Implement `debouncedRestartActivity()` using the debounce utility
5. Implement `cancelPendingRestart()` and `isRestartPending()`
6. Update `updateLiveActivityWithQueue()` to use restart pattern
7. Run tests (should pass - TDD green phase)
8. Refactor and clean up

#### Acceptance Criteria

- [x] All new service tests pass
- [x] All existing tests still pass
- [x] Import updated to use `@/modules/live-activity`
- [x] `restartActivity()` implemented
- [x] `debouncedRestartActivity()` implemented with 500ms debounce
- [x] `updateLiveActivityWithQueue()` uses restart pattern
- [x] No lint errors

#### Files Modified

| File                                                 | Status   |
| ---------------------------------------------------- | -------- |
| `src/services/liveActivityService.ts`                | Modified |
| `src/services/__tests__/liveActivityService.test.ts` | Modified |

---

### Work Item 5: Update Type Definitions (COMPLETED)

**Estimated effort**: 30 minutes
**Prerequisites**: Work Items 3, 4
**Tests to write first**: None (type definitions)

#### Implementation Steps

1. Add new types to `src/types/liveActivity.ts`
2. Verify all types are exported

#### New Types

```typescript
// Add to src/types/liveActivity.ts

/**
 * Configuration for restart debouncing
 */
export interface RestartDebounceConfig {
  /** Debounce window in milliseconds */
  delayMs: number;

  /** Whether debouncing is enabled */
  enabled: boolean;
}

/**
 * Result of a restart operation
 */
export interface RestartResult {
  /** Whether the restart was successful */
  success: boolean;

  /** New activity ID if successful */
  activityId: string | null;

  /** Error message if failed */
  error?: string;

  /** Whether this was a debounced call */
  wasDebounced: boolean;
}

/**
 * Activity state from iOS ActivityKit
 */
export type ActivityState = 'active' | 'ended' | 'dismissed' | 'stale';
```

#### Acceptance Criteria

- [x] New types compile without errors
- [x] All types exported from module

**Note**: Types were defined in the module's `src/index.ts` file for better encapsulation and to avoid circular dependencies.

#### Files Modified

| File                                 | Status                        |
| ------------------------------------ | ----------------------------- |
| `modules/live-activity/src/index.ts` | Contains all type definitions |
| `src/types/liveActivity.ts`          | Modified                      |

---

### Work Item 6: Delete Legacy Native Module Files (COMPLETED)

**Estimated effort**: 30 minutes
**Prerequisites**: Work Items 1-5 complete and tested
**Tests to write first**: None

#### Implementation Steps

1. Verify new Expo module works (run existing tests)
2. Delete `ios/BeerSelector/LiveActivityModule.swift`
3. Delete `ios/BeerSelector/LiveActivityModule.m`
4. Delete `ios/LiveActivityModule.swift` (duplicate in root ios folder)
5. Delete `ios/LiveActivityModule.m` (duplicate in root ios folder)
6. Remove `react-native-live-activities` dependency from `package.json`
7. Run `npm install` to update lock file
8. Update Xcode project to remove references to deleted files
9. Run `pod install`
10. Build and test on device

#### Acceptance Criteria

- [x] Legacy Swift files deleted (both locations)
- [x] Legacy Objective-C files deleted (both locations)
- [x] `react-native-live-activities` removed from package.json (was not in use)
- [x] `npm install` completes without errors
- [x] Xcode project builds without errors
- [x] App runs on physical device
- [x] Live Activity functionality works

**Note**: The legacy files in `ios/BeerSelector/` were the only ones that existed. The files in root `ios/` directory were created during development and also cleaned up.

#### Files Deleted

| File                                        | Status                            |
| ------------------------------------------- | --------------------------------- |
| `ios/BeerSelector/LiveActivityModule.swift` | Deleted (replaced by Expo module) |
| `ios/BeerSelector/LiveActivityModule.m`     | Deleted (no longer needed)        |
| `ios/LiveActivityModule.swift`              | Deleted (duplicate)               |
| `ios/LiveActivityModule.m`                  | Deleted (duplicate)               |

---

### Work Item 7: Create Maestro E2E Tests (DEFERRED)

**Estimated effort**: 1-2 hours
**Prerequisites**: Work Items 1-6
**Tests to write first**: N/A (E2E tests)

#### Implementation Steps

1. Create `.maestro/live-activity-restart.yaml`
2. Create `.maestro/live-activity-debounce.yaml`
3. Create `.maestro/live-activity-logout.yaml`
4. Run tests on physical device

#### Maestro Tests

```yaml
# .maestro/live-activity-restart.yaml
appId: org.verily.FSbeerselector
---
- launchApp
- assertVisible: 'All Beers'

# Login (assumes test account)
- tapOn: 'Settings'
- assertVisible: 'Login'
# ... login flow ...

# Add first beer to queue
- tapOn: 'Beerfinder'
- tapOn:
    text: '.*IPA.*'
    index: 0
- tapOn: 'Check Me In!'
- assertVisible: 'queued for check-in'

# Add second beer (triggers restart)
- tapOn:
    text: '.*Stout.*'
    index: 0
- tapOn: 'Check Me In!'
- assertVisible: 'queued for check-in'

# Verify queue shows both beers
- tapOn: 'View Queue'
- assertVisible:
    text: '.*IPA.*'
- assertVisible:
    text: '.*Stout.*'

# App should not crash
- assertVisible: 'Beerfinder'
```

```yaml
# .maestro/live-activity-debounce.yaml
appId: org.verily.FSbeerselector
---
- launchApp

# Login and navigate to Beerfinder
# ... login flow ...

- tapOn: 'Beerfinder'

# Rapid check-ins (simulating quick user actions)
- tapOn:
    text: '.*Beer 1.*'
    index: 0
- tapOn: 'Check Me In!'

- tapOn:
    text: '.*Beer 2.*'
    index: 0
- tapOn: 'Check Me In!'

# Wait for debounce to settle
- wait: 2000

# Verify both beers queued, app stable
- tapOn: 'View Queue'
- assertVisible: '2 beers'
- assertVisible: 'Beerfinder'
```

```yaml
# .maestro/live-activity-logout.yaml
appId: org.verily.FSbeerselector
---
- launchApp

# Login and add beer
# ... login and check-in flow ...

# Logout
- tapOn: 'Settings'
- tapOn: 'Logout'
- assertVisible: 'Login'

# App should not crash, state should be clean
- assertNotVisible: 'Error'
```

#### Acceptance Criteria

- [ ] All three Maestro tests created
- [ ] Tests pass on physical iOS device
- [ ] No crashes during test execution

**Status**: DEFERRED - Maestro tests will be implemented as part of a separate testing initiative (MP-5). The manual testing was completed successfully.

#### Files to Create (Future)

| File                                   | Action |
| -------------------------------------- | ------ |
| `.maestro/live-activity-restart.yaml`  | Future |
| `.maestro/live-activity-debounce.yaml` | Future |
| `.maestro/live-activity-logout.yaml`   | Future |

---

### Work Item 8: Manual Testing and Documentation (COMPLETED)

**Estimated effort**: 2-3 hours
**Prerequisites**: All previous work items
**Tests to write first**: N/A

#### Manual Testing Checklist

**On physical iOS device (Live Activities don't work in simulator)**:

- [x] Add first beer - Live Activity appears
- [x] Add second beer - Activity restarts (minimal flicker)
- [x] Add third beer quickly - Debouncing prevents flicker
- [x] Delete beer - Activity restarts with updated count
- [x] Delete all beers - Activity ends
- [ ] Lock phone for 3+ hours - Activity should be stale/dimmed (requires extended testing)
- [ ] Open app after 3+ hours - `syncLiveActivityOnLaunch` should end stale and restart fresh (requires extended testing)
- [x] Background app during check-in - No crash, activity updates when foregrounded
- [x] Force quit app - Activity remains, cleaned up on next launch
- [x] User manually dismisses activity - JS state updated via observer
- [x] Logout while activity exists - Activity ended, state cleaned

#### Documentation Updates

1. Update `CLAUDE.md` with new module location
2. Update any imports in documentation
3. Add migration notes for future reference
4. Create `IMPLEMENTATION_COMPLETE.md` summary document

#### Acceptance Criteria

- [x] Core manual tests pass
- [x] No flicker visible during restart (or minimal <100ms)
- [x] Documentation updated
- [x] IMPLEMENTATION_COMPLETE.md created

#### Files Created/Modified

| File        | Status                                      |
| ----------- | ------------------------------------------- |
| `CLAUDE.md` | Modify (update iOS Live Activities section) |

---

## 4. Implementation Details

### Debounce Configuration

```typescript
// Debounce window in milliseconds
const RESTART_DEBOUNCE_MS = 500;
```

**Rationale for 500ms**:

- Fast enough to feel responsive (sub-second)
- Slow enough to coalesce rapid check-ins
- Matches common UI debounce patterns

### Flicker Mitigation

The implementation minimizes flicker through:

1. **Same Task Block**: End and start happen in the same Swift `Task` block
2. **Immediate Dismissal**: `.immediate` policy removes old activity instantly
3. **Debouncing**: 500ms window coalesces rapid updates
4. **Thread Safety**: `NSLock` prevents race conditions

### Activity State Observer

The Swift module observes activity state changes:

```swift
@available(iOS 16.1, *)
private func observeActivityState(_ activity: Activity<BeerQueueAttributes>) {
  Task {
    for await state in activity.activityStateUpdates {
      switch state {
      case .dismissed:
        // User manually dismissed
        self.currentActivityId = nil
      case .ended:
        // System ended (e.g., after 8 hours)
        self.currentActivityId = nil
      default:
        break
      }
    }
  }
}
```

This handles edge cases where the user manually dismisses the activity.

### Semaphore Pattern for App Termination

For app termination scenarios, a synchronous end method is provided:

```swift
Function("endAllActivitiesSync") { () -> Bool in
  let semaphore = DispatchSemaphore(value: 0)

  Task {
    // End all activities
    for activity in Activity<BeerQueueAttributes>.activities {
      await activity.end(dismissalPolicy: .immediate)
    }
    semaphore.signal()
  }

  // Wait up to 1 second
  _ = semaphore.wait(timeout: .now() + 1.0)
  return true
}
```

---

## 5. Edge Cases and Error Handling

### Foreground Requirement

iOS requires the app to be in foreground to START a new activity.

**Handling**:

- Catch the error and log
- Return gracefully (don't crash)
- `syncLiveActivityOnLaunch()` will retry when app comes to foreground

### Activity Already Ended by User

**Handling**:

- Activity state observer updates `currentActivityId` to nil
- Next restart will simply start a new activity (no end needed)

### Session Expiration

**Handling**:

- Check for valid session before any Live Activity operations
- Skip gracefully if no session (log but don't crash)

### Rapid Check-ins

**Handling**:

- Debouncer coalesces multiple calls
- Only the final state is used for restart
- All pending promises resolve with the same result

### App Backgrounding During Debounce

**Handling**:

- Debounce timer fires, but restart may fail (foreground requirement)
- `syncLiveActivityOnLaunch()` recovers state on next foreground

---

## 6. Testing Checklist

### Unit Tests (Jest)

| Test                                               | Status |
| -------------------------------------------------- | ------ |
| `createDebouncer` creates with specified delay     | [ ]    |
| `createDebouncer` tracks pending state             | [ ]    |
| `createDebouncer` debounces rapid calls            | [ ]    |
| `createDebouncer` uses latest arguments            | [ ]    |
| `createDebouncer` allows cancellation              | [ ]    |
| `createDebouncer` resolves all pending promises    | [ ]    |
| `createDebouncer` rejects on cancellation          | [ ]    |
| `createDebouncer` handles function errors          | [ ]    |
| `restartActivity` ends existing and starts new     | [ ]    |
| `restartActivity` returns null for empty queue     | [ ]    |
| `restartActivity` handles unsupported gracefully   | [ ]    |
| `restartActivity` handles native errors            | [ ]    |
| `restartActivity` handles foreground requirement   | [ ]    |
| `debouncedRestartActivity` debounces within 500ms  | [ ]    |
| `debouncedRestartActivity` uses latest state       | [ ]    |
| `debouncedRestartActivity` handles empty queue     | [ ]    |
| `cancelPendingRestart` cancels pending             | [ ]    |
| `updateLiveActivityWithQueue` uses restart pattern | [ ]    |
| `updateLiveActivityWithQueue` skips visitor mode   | [ ]    |
| `updateLiveActivityWithQueue` skips no session     | [ ]    |

### E2E Tests (Maestro)

| Test                                 | Status |
| ------------------------------------ | ------ |
| `live-activity-restart.yaml` passes  | [ ]    |
| `live-activity-debounce.yaml` passes | [ ]    |
| `live-activity-logout.yaml` passes   | [ ]    |

### Manual Tests

| Test                                  | Status |
| ------------------------------------- | ------ |
| Add first beer - Activity appears     | [ ]    |
| Add second beer - Activity restarts   | [ ]    |
| Rapid check-ins - No flicker          | [ ]    |
| Delete beer - Activity updates        | [ ]    |
| Delete all beers - Activity ends      | [ ]    |
| 3+ hour lock - Activity stale         | [ ]    |
| Open after 3+ hours - Fresh restart   | [ ]    |
| Background during check-in - No crash | [ ]    |
| Force quit - Cleaned on next launch   | [ ]    |
| User dismisses - State updated        | [ ]    |
| Logout - Activity ended               | [ ]    |

---

## 7. Rollback Considerations

### Feature Flag

Consider adding a feature flag:

```typescript
const USE_RESTART_PATTERN = true;

export async function updateLiveActivityWithQueue(...) {
  if (USE_RESTART_PATTERN) {
    await debouncedRestartActivity(queuedBeers, sessionData);
  } else {
    // Fallback to simple update (old behavior)
    await updateLiveActivity(queueState);
  }
}
```

### Rollback Steps

1. **Quick disable**: Set `USE_RESTART_PATTERN = false`
2. **Restore legacy module**: Git revert the migration PR
3. **Full revert**: Restore all files from before implementation

### Known Limitations of Rollback

If rolled back to simple update pattern:

- `staleDate` is refreshed on updates (good)
- But activity won't auto-dismiss after 3 hours (iOS limitation)
- User would need to manually dismiss or wait for 8-hour iOS limit

---

## Appendix A: File Changes Summary

| File                                                  | Action | Work Item |
| ----------------------------------------------------- | ------ | --------- |
| `modules/live-activity/expo-module.config.json`       | Create | 1         |
| `modules/live-activity/src/index.ts`                  | Create | 1         |
| `modules/live-activity/src/__tests__/index.test.ts`   | Create | 1         |
| `modules/live-activity/ios/LiveActivityModule.swift`  | Create | 2         |
| `src/services/liveActivityDebounce.ts`                | Create | 3         |
| `src/services/__tests__/liveActivityDebounce.test.ts` | Create | 3         |
| `src/services/liveActivityService.ts`                 | Modify | 4         |
| `src/services/__tests__/liveActivityService.test.ts`  | Modify | 4         |
| `src/types/liveActivity.ts`                           | Modify | 5         |
| `ios/BeerSelector/LiveActivityModule.swift`           | Delete | 6         |
| `ios/BeerSelector/LiveActivityModule.m`               | Delete | 6         |
| `.maestro/live-activity-restart.yaml`                 | Create | 7         |
| `.maestro/live-activity-debounce.yaml`                | Create | 7         |
| `.maestro/live-activity-logout.yaml`                  | Create | 7         |
| `CLAUDE.md`                                           | Modify | 8         |

## Appendix B: Related Documentation

- `/workspace/BeerSelector/docs/liveactivity/NATIVE_MODULE_ARCHITECTURE.md` - Expo Modules API decision
- `/workspace/BeerSelector/docs/liveactivity/AUTO_DISMISS_REVIEW.md` - Code review with recommendations
- `/workspace/BeerSelector/docs/liveactivity/REQUIREMENTS.md` - Feature requirements
- `/workspace/BeerSelector/CLAUDE.md` - Project conventions and testing guidelines

## Appendix C: Apple Documentation References

- [ActivityKit](https://developer.apple.com/documentation/activitykit)
- [Live Activities HIG](https://developer.apple.com/design/human-interface-guidelines/live-activities)
- [Displaying live data with Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)

## Appendix D: Expo Modules API References

- [Expo Modules Overview](https://docs.expo.dev/modules/overview/)
- [Module API Reference](https://docs.expo.dev/modules/module-api/)
- [Native Module Tutorial](https://docs.expo.dev/modules/native-module-tutorial/)
