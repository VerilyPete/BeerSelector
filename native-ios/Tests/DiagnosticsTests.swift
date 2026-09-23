import XCTest
@testable import BeerSelectorNative

final class DiagnosticsTests: XCTestCase {
    func testBalancedOutcomesAndDuplicateCompletion() throws {
        let diagnostics = Diagnostics()
        let interval = diagnostics.begin(.refresh)
        interval.finish(.success); interval.finish(.failure)
        XCTAssertThrowsError(try diagnostics.measure(.parsing) { throw URLError(.cancelled) })
        XCTAssertThrowsError(try diagnostics.measure(.transaction) { throw HTTPFailure(status: 500) })
        let snapshot = diagnostics.snapshot()
        XCTAssertEqual(snapshot[.refresh]?.count, 1)
        XCTAssertEqual(snapshot[.refresh]?.successes, 1)
        XCTAssertEqual(snapshot[.parsing]?.cancellations, 1)
        XCTAssertEqual(snapshot[.transaction]?.failures, 1)
    }
    func testConcurrentAggregationDoesNotLoseCompletions() {
        let diagnostics = Diagnostics()
        DispatchQueue.concurrentPerform(iterations: 200) { _ in diagnostics.begin(.network).finish(.success) }
        XCTAssertEqual(diagnostics.snapshot()[.network]?.successes, 200)
        XCTAssertEqual(diagnostics.snapshot().count, 1)
    }
    func testAbandonedIntervalClosesAsCancelled() {
        let diagnostics = Diagnostics()
        autoreleasepool { _ = diagnostics.begin(.login) }
        XCTAssertEqual(diagnostics.snapshot()[.login]?.cancellations, 1)
    }
}
