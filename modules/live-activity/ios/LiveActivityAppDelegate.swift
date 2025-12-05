//
//  LiveActivityAppDelegate.swift
//  LiveActivity
//
//  Expo App Delegate Subscriber for registering background task handlers.
//  This is called automatically by Expo during app launch.
//

import ExpoModulesCore
import BackgroundTasks
import ActivityKit

/// Background task identifier for Live Activity cleanup
/// Must match the identifier in Info.plist BGTaskSchedulerPermittedIdentifiers
private let cleanupTaskIdentifier = "org.verily.FSbeerselector.liveactivity.cleanup"

public class LiveActivityAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Register background task handler for Live Activity cleanup
    BGTaskScheduler.shared.register(
      forTaskWithIdentifier: cleanupTaskIdentifier,
      using: nil
    ) { task in
      Self.handleCleanup(task: task as! BGAppRefreshTask)
    }
    print("[LiveActivityAppDelegate] Registered cleanup task handler")

    return true
  }

  /// Handle the cleanup task when iOS executes it
  private static func handleCleanup(task: BGAppRefreshTask) {
    if #available(iOS 16.1, *) {
      let cleanupTask = Task {
        for activity in Activity<BeerQueueAttributes>.activities {
          await activity.end(dismissalPolicy: .immediate)
          print("[LiveActivityAppDelegate] Ended activity: \(activity.id)")
        }
        task.setTaskCompleted(success: true)
        print("[LiveActivityAppDelegate] Cleanup task completed successfully")
      }

      task.expirationHandler = {
        cleanupTask.cancel()
        task.setTaskCompleted(success: false)
        print("[LiveActivityAppDelegate] Cleanup task expired")
      }
    } else {
      task.setTaskCompleted(success: true)
    }
  }
}
