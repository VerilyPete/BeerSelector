import ActivityKit
import UIKit
import BackgroundTasks

@MainActor
final class LiveActivityController {
    private var pending: Task<Void,Never>?
    func update(member: MemberSession, queue: [QueueEntry]) async {
        pending?.cancel()
        guard !member.isVisitor, !queue.isEmpty else { await endAll(); return }
        pending = Task { @MainActor in
            do { try await Task.sleep(for:.milliseconds(500)) } catch { return }
            guard !Task.isCancelled, ActivityAuthorizationInfo().areActivitiesEnabled, UIApplication.shared.applicationState == .active else { return }
            // Restart after queue changes, matching the reference's stale-timer reset.
            let beers = queue.map { QueuedBeer(id:$0.id,name:$0.name.replacingOccurrences(of:#"\s*\([^)]*\)\s*$"#,with:"",options:.regularExpression)) }
            let existing = Activity<BeerQueueAttributes>.activities
            if existing.count == 1, let activity = existing.first, activity.attributes.memberId == member.memberId, activity.attributes.storeId == member.storeId, activity.content.state.beers == beers, activity.content.staleDate.map({ $0 > Date() }) == true { return }
            for activity in existing { await activity.end(nil,dismissalPolicy:.immediate) }
            guard !Task.isCancelled else { return }
            do {
                _ = try Activity.request(attributes:BeerQueueAttributes(memberId:member.memberId,storeId:member.storeId),content:ActivityContent(state:BeerQueueAttributes.ContentState(beers:beers),staleDate:Date().addingTimeInterval(3 * 3600)),pushType:nil)
                AppDelegate.scheduleCleanup()
            } catch { /* Activity availability must not change the success of a beer check-in. */ }
        }
    }
    func expireIfNeeded() async {
        for activity in Activity<BeerQueueAttributes>.activities where activity.content.staleDate.map({ $0 <= Date() }) == true { await activity.end(nil,dismissalPolicy:.immediate) }
    }
    func endAll() async {
        pending?.cancel(); pending = nil
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier:AppDelegate.cleanupIdentifier)
        for activity in Activity<BeerQueueAttributes>.activities { await activity.end(nil,dismissalPolicy:.immediate) }
    }
}
