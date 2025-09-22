# iOS LiveActivities Integration Plan

This document outlines the steps to add LiveActivity support for the BeerFinder queue on iOS. When a member queues beers, a LiveActivity on the lock screen will display up to 6 queued beers for quick ordering.

### 1. Completed

### 2.
- Define an `ActivityAttributes` type:
  ```swift
  struct BeerQueueAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
      var queuedBeers: [QueuedBeer]
    }
  }
  struct QueuedBeer: Codable, Hashable {
    let id: String
    let name: String
  }
  ```
- Implement `ActivityConfiguration` in the extension’s SwiftUI view.
  - Design the lock screen and Dynamic Island UI to list up to 6 beers.

## 3. Native Module for ActivityKit Interaction

- In the main app target, add a Swift class exposed to React Native / Expo:
  - Methods: `startBeerQueueActivity(initialState)`, `updateBeerQueueActivity(newState)`, `endBeerQueueActivity()`.
- Use `ActivityKit` to manage the activity:
  ```swift
  let activity = try Activity<BeerQueueAttributes>.request(
    attributes: BeerQueueAttributes(),
    contentState: initialState,
    pushType: nil
  )
  ```
- Update via `activity.update(using:)` and end with `activity.end(dismissalPolicy:)`.

## 4. Bridge Native Module to JavaScript

- Create a React Native module (Objective-C or Swift) that wraps the above methods.
- Register it under `NativeModules.BeerQueueActivity`.
- For Expo, implement a **config plugin** to register the module at build time.

## 5. Integrate with BeerFinder Logic

- In `Beerfinder.tsx`, after successfully queueing a beer:
  ```ts
  import { NativeModules } from 'react-native';
  const { BeerQueueActivity } = NativeModules;

  // When queue changes:
  const queuedBeers = await getMyBeersQueue(); // up to 6 items
  BeerQueueActivity.updateBeerQueueActivity(queuedBeers);
  ```
- On first queue, call `startBeerQueueActivity(queuedBeers)` instead.
- When the queue is cleared (e.g., order submitted), call `endBeerQueueActivity()`.

## 6. Handle Permissions and Entitlements

- Enable **Background Modes > Live Activities** in both main app and the LiveActivity extension targets.
- Add `com.apple.developer.activity-scheduling` entitlement to both targets.
- Prompt the user to allow Live Activities if needed (using `ActivityAuthorization` APIs).

## 7. Testing

- Build and run on an iOS 16.1+ device (Live Activities aren’t supported in Simulator before iOS 16.2).
- Queue beers in BeerFinder and observe the lock screen/ Dynamic Island.
- Test update scenarios: add, remove, or reorder beers in the queue.
- Verify ending the activity dismisses it cleanly.

## 8. Documentation

- Update `README.md` with instructions on enabling Live Activities.
- Add notes in `WARP.md` under **iOS** section:
  - How Live Activities are registered and managed.
  - Commands for building the extension.

---

*Review and adjust this plan before implementation.*
