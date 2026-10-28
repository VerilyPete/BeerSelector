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
    func testConcurrentTaskAndReportTotalsAppearInReportAndRejectInvalidValues() {
        let diagnostics = Diagnostics()
        DispatchQueue.concurrentPerform(iterations: 100) { _ in
            diagnostics.recordTask(seconds: 0.5, redirects: 1)
            diagnostics.recordReports(metrics: 2, diagnostics: 1, cpuSeconds: 0.25)
        }
        diagnostics.recordTask(seconds: -1, redirects: 1)
        diagnostics.recordTask(seconds: .infinity, redirects: 1)
        diagnostics.recordTask(seconds: 1, redirects: -1)
        diagnostics.recordReports(metrics: 1, cpuSeconds: .nan)
        diagnostics.begin(.queue).finish(.failure)
        let lines = diagnostics.report().components(separatedBy: "\n")
        XCTAssertEqual(lines.first, "Session performance aggregates (seconds)")
        XCTAssertEqual(lines.count, Diagnostics.Operation.allCases.count + 3)
        XCTAssertTrue(lines.contains { $0.hasPrefix("queue: count=1 ok=0 failed=1 cancelled=0 ") })
        XCTAssertEqual(lines[lines.count - 2], "URLSession tasks=100 seconds=50.0 redirects=100")
        XCTAssertEqual(lines.last, "MetricKit reports=201 diagnostics=100 CPU seconds=25.0")
    }
}
