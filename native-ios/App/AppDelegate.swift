import UIKit
import BackgroundTasks
import ActivityKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    static let cleanupIdentifier = "org.verily.FSbeerselector.liveactivity.cleanup"
    func application(_ application: UIApplication,didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey:Any]? = nil) -> Bool {
        BGTaskScheduler.shared.register(forTaskWithIdentifier:Self.cleanupIdentifier,using:nil) { task in
            let work = Task {
                for activity in Activity<BeerQueueAttributes>.activities where activity.content.staleDate.map({ $0 <= Date() }) == true {
                    guard !Task.isCancelled else { return }
                    await activity.end(nil,dismissalPolicy:.immediate)
                }
                task.setTaskCompleted(success:!Task.isCancelled)
            }
            task.expirationHandler = { work.cancel() }
        }
        return true
    }
    static func scheduleCleanup() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier:cleanupIdentifier)
        let request = BGAppRefreshTaskRequest(identifier:cleanupIdentifier)
        request.earliestBeginDate = Date().addingTimeInterval(3 * 3600)
        // Scheduling is best effort; foreground expiry and staleDate also protect stale content.
        try? BGTaskScheduler.shared.submit(request)
    }
}
