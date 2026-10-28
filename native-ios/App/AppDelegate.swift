import UIKit
import BackgroundTasks
import ActivityKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    static let cleanupIdentifier = "org.verily.FSbeerselector.liveactivity.cleanup"
    func application(_ application: UIApplication,didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey:Any]? = nil) -> Bool {
        guard ProcessInfo.processInfo.environment["BEERSELECTOR_TEST_HOST"] != "1",
              ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil else { return true }
        DiagnosticJournal.shared.record(.launch)
        DeviceMetrics.shared.start()
        BGTaskScheduler.shared.register(forTaskWithIdentifier:Self.cleanupIdentifier,using:.main) { task in
            let work = Task {
                let now = Date()
                let stale = Activity<BeerQueueAttributes>.activities.filter { @Sendable in $0.content.staleDate.map({ $0 <= now }) == true }
                await Self.endActivities(stale,end:{ await $0.end(nil,dismissalPolicy:.immediate) }) { task.setTaskCompleted(success:$0) }
            }
            task.expirationHandler = { @Sendable in work.cancel() }
        }
        return true
    }
    nonisolated static func endActivities<A>(_ activities: [A], end: @Sendable (A) async -> Void, completion: @MainActor (Bool) -> Void) async {
        for activity in activities {
            guard !Task.isCancelled else { break }
            await end(activity)
        }
        await completion(!Task.isCancelled)
    }
    static func scheduleCleanup() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier:cleanupIdentifier)
        let request = BGAppRefreshTaskRequest(identifier:cleanupIdentifier)
        request.earliestBeginDate = Date().addingTimeInterval(3 * 3600)
        // Scheduling is best effort; foreground expiry and staleDate also protect stale content.
        try? BGTaskScheduler.shared.submit(request)
    }
}
