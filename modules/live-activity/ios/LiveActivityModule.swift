//
//  LiveActivityModule.swift
//  BeerSelector
//
//  Expo Modules API implementation for iOS Live Activity functionality.
//  This replaces the legacy Native Modules implementation with pure Swift.
//
//  Features:
//  - Type-safe Expo Modules DSL
//  - Thread safety with NSLock
//  - Activity state observation
//  - End-and-restart pattern for auto-dismiss
//  - Semaphore-based sync ending for app termination
//

import ExpoModulesCore
import ActivityKit

// MARK: - Module Definition

public class LiveActivityModule: Module {
  /// Track the current activity ID
  private var currentActivityId: String?

  /// Lock for thread-safe activity operations
  private let activityLock = NSLock()

  // MARK: - Module Configuration

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

    AsyncFunction("startActivity") { (data: StartActivityRecord) -> String in
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
      let staleDate = Date().addingTimeInterval(3 * 60 * 60) // 3 hours

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

    AsyncFunction("updateActivity") { (activityId: String, data: UpdateActivityRecord) -> Bool in
      guard #available(iOS 16.1, *) else {
        throw LiveActivityUnsupportedException()
      }

      let beers = data.beers.map { QueuedBeer(id: $0.id, name: $0.name) }
      let contentState = BeerQueueAttributes.ContentState(beers: beers)
      let staleDate = Date().addingTimeInterval(3 * 60 * 60) // 3 hours
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

      // Activity not found is OK - it might have already ended
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

    // MARK: - Restart Activity (End-and-Restart Pattern)

    AsyncFunction("restartActivity") { (data: StartActivityRecord) -> String? in
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

      // Immediately start new activity with fresh 3-hour staleDate
      let attributes = BeerQueueAttributes(
        memberId: data.memberId,
        storeId: data.storeId
      )

      let beers = data.beers.map { QueuedBeer(id: $0.id, name: $0.name) }
      let contentState = BeerQueueAttributes.ContentState(beers: beers)
      let staleDate = Date().addingTimeInterval(3 * 60 * 60) // 3 hours

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
        // Fallback for iOS 16.1 - end all activities
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
      var completed = false

      Task {
        self.activityLock.lock()
        defer { self.activityLock.unlock() }

        for activity in Activity<BeerQueueAttributes>.activities {
          await activity.end(dismissalPolicy: .immediate)
          print("[LiveActivityModule] Sync ended activity: \(activity.id)")
        }
        self.currentActivityId = nil
        completed = true
        semaphore.signal()
      }

      // Wait up to 1 second for completion
      _ = semaphore.wait(timeout: .now() + 1.0)
      return completed
    }
  }

  // MARK: - Private Helpers

  /// Internal method to end all activities without locking (caller must hold lock)
  private func endAllActivitiesInternal() async {
    if #available(iOS 16.1, *) {
      for activity in Activity<BeerQueueAttributes>.activities {
        await activity.end(dismissalPolicy: .immediate)
        print("[LiveActivityModule] Ended activity: \(activity.id)")
      }
      self.currentActivityId = nil
    }
  }

  /// Observe activity state changes (user dismissals, system end)
  @available(iOS 16.1, *)
  private func observeActivityState(_ activity: Activity<BeerQueueAttributes>) {
    Task {
      for await state in activity.activityStateUpdates {
        switch state {
        case .dismissed:
          // User manually dismissed the activity
          if self.currentActivityId == activity.id {
            self.currentActivityId = nil
          }
          print("[LiveActivityModule] Activity dismissed by user: \(activity.id)")
        case .ended:
          // Activity was ended by system or app
          if self.currentActivityId == activity.id {
            self.currentActivityId = nil
          }
          print("[LiveActivityModule] Activity ended: \(activity.id)")
        case .stale:
          // Activity became stale (past staleDate)
          print("[LiveActivityModule] Activity became stale: \(activity.id)")
        case .active:
          // Activity is active
          print("[LiveActivityModule] Activity is active: \(activity.id)")
        @unknown default:
          print("[LiveActivityModule] Unknown activity state for: \(activity.id)")
        }
      }
    }
  }
}

// MARK: - Data Records

/// Record type for data passed to startActivity and restartActivity
struct StartActivityRecord: Record {
  @Field var memberId: String = ""
  @Field var storeId: String = ""
  @Field var beers: [BeerRecord] = []
}

/// Record type for data passed to updateActivity
struct UpdateActivityRecord: Record {
  @Field var beers: [BeerRecord] = []
}

/// Record type for individual beer data
struct BeerRecord: Record {
  @Field var id: String = ""
  @Field var name: String = ""
}

// MARK: - Exceptions

/// Exception thrown when Live Activities are not supported (iOS < 16.1)
class LiveActivityUnsupportedException: Exception {
  override var reason: String {
    "Live Activities require iOS 16.1+"
  }
}

/// Exception thrown when Live Activities are disabled in Settings
class LiveActivityDisabledException: Exception {
  override var reason: String {
    "Live Activities are disabled in Settings"
  }
}

/// Exception thrown when an activity ID is not found
class ActivityNotFoundException: GenericException<String> {
  override var reason: String {
    "Activity not found with ID: \(param)"
  }
}
