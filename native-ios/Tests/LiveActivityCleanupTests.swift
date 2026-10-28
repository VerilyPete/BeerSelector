import XCTest
@testable import BeerSelectorNative

final class LiveActivityCleanupTests: XCTestCase {
    @MainActor private final class Run { var ended: [Int] = []; var completions: [Bool] = [] }

    @MainActor private func cleanup(_ activities: [Int], cancelAfterFirstEnd: Bool = false) async -> Run {
        let run = Run()
        await Task {
            await AppDelegate.endActivities(activities,end:{ activity in
                await MainActor.run { run.ended.append(activity) }
                // Stands in for the BGTask expiration handler cancelling the work mid-loop.
                if cancelAfterFirstEnd { withUnsafeCurrentTask { $0?.cancel() } }
            }) { run.completions.append($0) }
        }.value
        return run
    }

    @MainActor func testExpirationMidCleanupStillCompletesTheTaskAsUnsuccessful() async {
        let run = await cleanup([1,2,3],cancelAfterFirstEnd:true)
        XCTAssertEqual(run.ended,[1])
        XCTAssertEqual(run.completions,[false])
    }

    @MainActor func testUninterruptedCleanupEndsEveryActivityAndSucceeds() async {
        let run = await cleanup([1,2])
        XCTAssertEqual(run.ended,[1,2])
        XCTAssertEqual(run.completions,[true])
    }
}
