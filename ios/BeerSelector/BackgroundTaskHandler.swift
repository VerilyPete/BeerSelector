//
//  BackgroundTaskHandler.swift
//  BeerSelector
//
//  Handles background task registration and execution for Live Activity cleanup.
//  This class is called from AppDelegate to register the background task handler
//  that will end Live Activities when the cleanup task runs.
//

import BackgroundTasks
import ActivityKit

@objc class BackgroundTaskHandler: NSObject {
  /// Background task identifier for Live Activity cleanup
  /// Must match the identifier in Info.plist BGTaskSchedulerPermittedIdentifiers
  static let cleanupTaskIdentifier = "org.verily.FSbeerselector.liveactivity.cleanup"

  /// Register the background task handler with iOS
  /// Must be called from AppDelegate didFinishLaunchingWithOptions before returning
  @objc static func registerTasks() {
    BGTaskScheduler.shared.register(
      forTaskWithIdentifier: cleanupTaskIdentifier,
      using: nil
    ) { task in
      handleCleanup(task: task as! BGAppRefreshTask)
    }
    print("[BackgroundTaskHandler] Registered cleanup task handler")
  }

  /// Handle the cleanup task when iOS executes it
  /// Ends all Live Activities immediately
  private static func handleCleanup(task: BGAppRefreshTask) {
    // End all Live Activities
    if #available(iOS 16.1, *) {
      let cleanupTask = Task {
        for activity in Activity<BeerQueueAttributes>.activities {
          await activity.end(dismissalPolicy: .immediate)
          print("[BackgroundTaskHandler] Ended activity: \(activity.id)")
        }
        task.setTaskCompleted(success: true)
        print("[BackgroundTaskHandler] Cleanup task completed successfully")
      }

      // Set expiration handler to cancel the async Task if iOS revokes background time
      task.expirationHandler = {
        cleanupTask.cancel()
        task.setTaskCompleted(success: false)
        print("[BackgroundTaskHandler] Cleanup task expired, cancelled")
      }
    } else {
      // No Live Activities on older iOS versions
      task.setTaskCompleted(success: true)
    }
  }
}
