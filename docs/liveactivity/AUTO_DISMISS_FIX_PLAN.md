# Live Activity Auto-Dismiss Fix Plan

**Issue:** Live Activities persist beyond 8 hours due to staleDate being reset on every update
**Date:** 2025-12-04
**Status:** Finalized - Ready for Implementation

---

## 1. Problem Statement

### Current Bug

The `updateActivity()` function in `LiveActivityModule.swift:86` resets the `staleDate` to 3 hours from now on every call:

```swift
let staleDate = Date().addingTimeInterval(3 * 60 * 60) // BUG: Resets timer!
let content = ActivityContent(state: contentState, staleDate: staleDate)
```

Combined with `syncLiveActivityOnLaunch()` being called on every app foreground (`app/_layout.tsx:251`), this creates a loop where the staleDate is continuously pushed forward.

### Expected Behavior

- Activity should auto-dismiss 3 hours after the **last queue change** (check-in or deletion)
- Syncing on foreground should NOT reset the timer
- If app is backgrounded, a background task should attempt cleanup at the 3-hour mark

---

## 2. Solution Architecture

### Two-Layer Cleanup Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER 1: Background Task                      │
│  Schedule BGAppRefreshTask when activity starts/restarts        │
│  Task runs ~3 hours later to end the activity                   │
│  (Best effort - iOS may delay execution)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER 2: Foreground Cleanup                   │
│  On app foreground, check if activity is past staleDate        │
│  If stale → end activity immediately + cancel background task   │
│  (Guaranteed when user opens app)                               │
└─────────────────────────────────────────────────────────────────┘
```

### Key Changes

1. **Fix `updateActivity()`** - Remove staleDate, only update content
2. **Add background task scheduling** - Schedule cleanup when starting/restarting
3. **Add foreground cleanup** - End stale activities and cancel pending tasks
4. **Track staleDate in JS** - Store timestamp to check staleness on foreground

---

## 3. Work Items

### Work Item 1: Fix updateActivity() - Remove staleDate Reset

**Estimated Complexity:** Low
**Files:** `modules/live-activity/ios/LiveActivityModule.swift`

#### Changes

```swift
// BEFORE (lines 79-98)
AsyncFunction("updateActivity") { (activityId: String, data: UpdateActivityRecord) -> Bool in
  let beers = data.beers.map { QueuedBeer(id: $0.id, name: $0.name) }
  let contentState = BeerQueueAttributes.ContentState(beers: beers)
  let staleDate = Date().addingTimeInterval(3 * 60 * 60) // DELETE THIS
  let content = ActivityContent(state: contentState, staleDate: staleDate) // CHANGE THIS

  for activity in Activity<BeerQueueAttributes>.activities {
    if activity.id == activityId {
      await activity.update(content)
      return true
    }
  }
  throw ActivityNotFoundException(activityId)
}

// AFTER
AsyncFunction("updateActivity") { (activityId: String, data: UpdateActivityRecord) -> Bool in
  let beers = data.beers.map { QueuedBeer(id: $0.id, name: $0.name) }
  let contentState = BeerQueueAttributes.ContentState(beers: beers)

  for activity in Activity<BeerQueueAttributes>.activities {
    if activity.id == activityId {
      // Update content only - preserve existing staleDate
      await activity.update(using: contentState)
      return true
    }
  }
  throw ActivityNotFoundException(activityId)
}
```

#### Tests

- Unit test: Verify `updateActivity()` does not change staleDate
- Manual test: Start activity, wait 1 hour, foreground app, verify staleDate unchanged

---

### Work Item 2: Add Background Task Infrastructure (Swift)

**Estimated Complexity:** Medium
**Files:**

- `modules/live-activity/ios/LiveActivityModule.swift`
- `ios/BeerSelector/Info.plist`

#### Info.plist Changes

Add to existing plist:

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>org.verily.FSbeerselector.liveactivity.cleanup</string>
</array>
```

Update UIBackgroundModes (add `fetch`):

```xml
<key>UIBackgroundModes</key>
<array>
  <string>remote-notification</string>
  <string>fetch</string>
</array>
```

#### Swift Module Changes

Add new functions to `LiveActivityModule.swift`:

```swift
import BackgroundTasks

// Add at module level
private let cleanupTaskIdentifier = "org.verily.FSbeerselector.liveactivity.cleanup"

// Add to definition()
AsyncFunction("scheduleCleanupTask") { (delaySeconds: Double) -> Bool in
  let request = BGAppRefreshTaskRequest(identifier: cleanupTaskIdentifier)
  request.earliestBeginDate = Date().addingTimeInterval(delaySeconds)

  do {
    try BGTaskScheduler.shared.submit(request)
    print("[LiveActivityModule] Scheduled cleanup task for \(delaySeconds)s from now")
    return true
  } catch {
    print("[LiveActivityModule] Failed to schedule cleanup task: \(error)")
    return false
  }
}

Function("cancelCleanupTask") { () -> Bool in
  BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: self.cleanupTaskIdentifier)
  print("[LiveActivityModule] Cancelled cleanup task")
  return true
}

AsyncFunction("getActivityStaleDate") { (activityId: String) -> Double? in
  for activity in Activity<BeerQueueAttributes>.activities {
    if activity.id == activityId {
      return activity.content.staleDate?.timeIntervalSince1970
    }
  }
  return nil
}
```

#### Tests

- Unit test: Verify `scheduleCleanupTask()` returns true
- Unit test: Verify `cancelCleanupTask()` returns true
- Manual test: Schedule task, check iOS Settings > Developer > Background Tasks

---

### Work Item 3: Register Background Task Handler

**Estimated Complexity:** Medium
**Files:**

- `ios/BeerSelector/AppDelegate.mm` (or create new Swift file)
- `modules/live-activity/ios/LiveActivityModule.swift`

#### Selected Approach: Swift AppDelegate Extension

Create `ios/BeerSelector/BackgroundTaskHandler.swift`:

```swift
import BackgroundTasks
import ActivityKit

@objc class BackgroundTaskHandler: NSObject {
  static let cleanupTaskIdentifier = "org.verily.FSbeerselector.liveactivity.cleanup"

  @objc static func registerTasks() {
    BGTaskScheduler.shared.register(
      forTaskWithIdentifier: cleanupTaskIdentifier,
      using: nil
    ) { task in
      handleCleanup(task: task as! BGAppRefreshTask)
    }
  }

  private static func handleCleanup(task: BGAppRefreshTask) {
    task.expirationHandler = {
      task.setTaskCompleted(success: false)
    }

    Task {
      for activity in Activity<BeerQueueAttributes>.activities {
        await activity.end(dismissalPolicy: .immediate)
      }
      task.setTaskCompleted(success: true)
    }
  }
}
```

Then in `AppDelegate.mm`:

```objc
#import "BeerSelector-Swift.h"

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  [BackgroundTaskHandler registerTasks];
  // ... rest of method
}
```

#### Tests

- Manual test: Trigger background task via Xcode debugger
- Manual test: Verify activity ends when background task runs

---

### Work Item 4: Update TypeScript Interface

**Estimated Complexity:** Low
**Files:** `modules/live-activity/src/index.ts`

#### Changes

```typescript
export interface LiveActivityModuleInterface {
  // ... existing methods ...

  // New methods for cleanup task management
  scheduleCleanupTask(delaySeconds: number): Promise<boolean>;
  cancelCleanupTask(): boolean;
  getActivityStaleDate(activityId: string): Promise<number | null>;
}
```

#### Tests

- Type check: Ensure new methods are typed correctly

---

### Work Item 5: Update Service Layer

**Estimated Complexity:** Medium
**Files:** `src/services/liveActivityService.ts`

#### Changes

1. **Track staleDate locally:**

```typescript
// Module-level state
let activityStaleTimestamp: number | null = null;
const STALE_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours
```

2. **Update startLiveActivity():**

```typescript
export async function startLiveActivity(...) {
  // ... existing code ...

  const activityId = await LiveActivityModule.startActivity(data);
  currentActivityId = activityId;
  activityStaleTimestamp = Date.now() + STALE_DURATION_MS;

  // Schedule background cleanup task
  await LiveActivityModule.scheduleCleanupTask(3 * 60 * 60); // 3 hours

  return activityId;
}
```

3. **Update restartLiveActivity():**

```typescript
async function restartLiveActivity(...) {
  // Cancel any pending cleanup task before restart
  LiveActivityModule.cancelCleanupTask();

  const newActivityId = await LiveActivityModule.restartActivity(data);

  if (newActivityId) {
    currentActivityId = newActivityId;
    activityStaleTimestamp = Date.now() + STALE_DURATION_MS;

    // Schedule new cleanup task
    await LiveActivityModule.scheduleCleanupTask(3 * 60 * 60);
  } else {
    currentActivityId = null;
    activityStaleTimestamp = null;
  }

  return newActivityId;
}
```

4. **Add foreground cleanup function:**

```typescript
export async function cleanupStaleActivityOnForeground(): Promise<void> {
  if (!currentActivityId || !activityStaleTimestamp) return;

  const now = Date.now();
  if (now >= activityStaleTimestamp) {
    console.log('[LiveActivity] Activity is stale, ending...');
    await endLiveActivity();
    LiveActivityModule.cancelCleanupTask();
  }
}
```

5. **Update syncLiveActivityOnLaunch():**

```typescript
export async function syncLiveActivityOnLaunch(...) {
  // First, check for and cleanup stale activities
  await cleanupStaleActivityOnForeground();

  // If activity was cleaned up, we may need to start a new one
  if (!currentActivityId && queuedBeers.length > 0) {
    await startLiveActivity(data);
  }
  // If activity exists and queue matches, do nothing (don't reset timer!)
  // Only restart if queue actually changed
}
```

#### Tests

- Unit test: `cleanupStaleActivityOnForeground()` ends activity when stale
- Unit test: `cleanupStaleActivityOnForeground()` does nothing when not stale
- Unit test: `startLiveActivity()` schedules cleanup task
- Unit test: `restartLiveActivity()` cancels old task and schedules new one

---

### Work Item 6: Update App Lifecycle Handler

**Estimated Complexity:** Low
**Files:** `app/_layout.tsx`

#### Changes

Update the foreground handler (around line 244-256):

```typescript
} else if (nextAppState === 'active') {
  if (Platform.OS === 'ios') {
    try {
      // Sync activity ID from native (in case app was killed)
      await syncActivityIdFromNative();

      // Clean up stale activity first (this also cancels pending background task)
      await cleanupStaleActivityOnForeground();

      // Only sync if we have an active (non-stale) activity or need to start one
      const sessionData = await getSessionData();
      const isVisitor = await checkIsVisitorMode(false);
      await syncLiveActivityOnLaunch(getQueuedBeers, sessionData, isVisitor);
    } catch (liveActivityError) {
      console.log('[_layout] Live Activity sync failed:', liveActivityError);
    }
  }
}
```

#### Tests

- Manual test: Start activity, wait 3+ hours, foreground app, verify activity ends

---

## 4. Testing Strategy

### Unit Tests (Jest)

| Test                                | File                          | Description                                   |
| ----------------------------------- | ----------------------------- | --------------------------------------------- |
| updateActivity preserves staleDate  | `liveActivityService.test.ts` | Mock native module, verify no staleDate reset |
| cleanupStaleActivity ends stale     | `liveActivityService.test.ts` | Mock timestamp, verify endActivity called     |
| cleanupStaleActivity skips fresh    | `liveActivityService.test.ts` | Mock timestamp, verify no action              |
| scheduleCleanupTask called on start | `liveActivityService.test.ts` | Verify task scheduled with 3hr delay          |

### Manual Tests (Physical Device)

| Test                          | Steps                                                                       | Expected Result           |
| ----------------------------- | --------------------------------------------------------------------------- | ------------------------- |
| Timer not reset on foreground | 1. Check in beer 2. Wait 1 hour 3. Lock/unlock phone 4. Check staleDate     | staleDate unchanged       |
| Timer reset on queue change   | 1. Check in beer 2. Wait 1 hour 3. Check in another beer 4. Check staleDate | staleDate = now + 3hr     |
| Background cleanup            | 1. Check in beer 2. Background app 3. Wait 3+ hours 4. Check Dynamic Island | Activity ended            |
| Foreground cleanup            | 1. Check in beer 2. Background app 3. Wait 3+ hours 4. Open app             | Activity ends immediately |

### Maestro E2E Tests

Update existing tests in `.maestro/`:

- `live-activity-restart.yaml` - Verify timer reset behavior
- Add new: `live-activity-stale-cleanup.yaml` - Test cleanup (requires simulated time)

---

## 5. Rollback Plan

If issues arise after deployment:

1. **Quick Fix:** Revert Work Item 1 (add staleDate back to updateActivity)
2. **Disable Background Tasks:** Remove task scheduling calls in service layer
3. **Full Rollback:** Revert all commits, return to current behavior

---

## 6. Known Limitations

1. **Background Task Timing:** iOS does not guarantee exact execution time for `BGAppRefreshTask`. The task may run minutes to hours after the scheduled time, depending on:
   - Device battery level
   - User's app usage patterns
   - System resource availability

2. **App Not Opened:** If user never opens the app after 3 hours, the activity will persist until:
   - Background task eventually runs (up to several hours late)
   - iOS auto-dismisses (staleDate + 4 hours max)

3. **Force Quit:** If user force-quits the app, background tasks are cancelled. Activity will persist until iOS auto-dismisses.

4. **iOS Version Requirements:**
   - Background tasks: iOS 13+
   - Live Activities: iOS 16.1+
   - `activity.content.staleDate` access: iOS 16.2+

---

## 7. Implementation Order (Parallelization)

Work items can be parallelized based on dependencies:

```
┌─────────────────────────────────────────────────────────────┐
│  PARALLEL GROUP A (no dependencies)                         │
│  • Work Item 1 - Fix updateActivity (Swift)                 │
│  • Work Item 2 - Background task infra (Swift + Info.plist) │
│  • Work Item 4 - TypeScript interface                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  PARALLEL GROUP B (after Group A)                           │
│  • Work Item 3 - Register handler (depends on 2)            │
│  • Work Item 5 - Service layer (depends on 4)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  SEQUENTIAL (after Group B)                                 │
│  • Work Item 6 - App lifecycle (depends on 5)               │
└─────────────────────────────────────────────────────────────┘
```

**Agent Assignment:**

- Agent 1: Work Items 1, 3 (Swift native module changes)
- Agent 2: Work Items 2 (Swift + Info.plist)
- Agent 3: Work Items 4, 5, 6 (TypeScript changes)

---

## 8. Open Questions

1. Should we also end activities when the user logs out? (Currently handled separately)
2. Should we show a notification when the activity is about to expire?
3. Should we allow users to configure the 3-hour timeout in settings?
