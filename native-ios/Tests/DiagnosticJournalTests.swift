import XCTest
@testable import BeerSelectorNative

final class DiagnosticJournalTests: XCTestCase {
    private func location() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("recent.json")
    }
    func testUnfinishedOperationSurvivesRestartWithoutInventingACrash() async throws {
        let url = location(); defer { try? FileManager.default.removeItem(at:url.deletingLastPathComponent()) }
        let first = DiagnosticJournal(url:url)
        let id = UUID()
        first.record(.launch)
        first.record(.operationBegan,operation:.refresh,interval:id)
        try await first.flush()
        let restarted = DiagnosticJournal(url:url)
        restarted.record(.launch)
        let saved = await restarted.report()
        XCTAssertEqual(saved.entries.map(\.kind),[.launch,.operationBegan,.launch])
        XCTAssertEqual(saved.entries[1].interval,id)
        XCTAssertNil(saved.entries[1].outcome)
        XCTAssertNotEqual(saved.entries.first?.session,saved.entries.last?.session)
    }
    func testCompletedOperationExportsMatchingOutcomeAfterRestart() async throws {
        let url = location(); defer { try? FileManager.default.removeItem(at:url.deletingLastPathComponent()) }
        let journal = DiagnosticJournal(url:url)
        let diagnostics = Diagnostics(journal:journal)
        diagnostics.begin(.refresh).finish(.cancelled)
        try await journal.flush()
        let restored = DiagnosticJournal(url:url)
        let export = try await restored.export()
        let report = try JSONDecoder().decode(DiagnosticJournal.Report.self,from:Data(contentsOf:export))
        XCTAssertEqual(report.entries.map(\.kind),[.operationBegan,.operationEnded])
        XCTAssertEqual(report.entries.first?.interval,report.entries.last?.interval)
        XCTAssertEqual(report.entries.last?.outcome,.cancelled)
        XCTAssertNotNil(report.entries.last?.seconds)
    }
    func testHistoryIsBoundedAcrossRestartsAndClearRemovesExport() async throws {
        let url = location(); defer { try? FileManager.default.removeItem(at:url.deletingLastPathComponent()) }
        let journal = DiagnosticJournal(url:url,capacity:3)
        for count in 0..<10 { journal.record(.networkMetrics,seconds:1,count:count) }
        try await journal.flush()
        let restarted = DiagnosticJournal(url:url,capacity:3)
        let report = await restarted.report()
        XCTAssertEqual(report.entries.compactMap(\.count),[7,8,9])
        let export = try await restarted.export()
        try await restarted.clear()
        XCTAssertFalse(FileManager.default.fileExists(atPath:export.path))
        let next = DiagnosticJournal(url:url,capacity:3)
        let cleared = await next.report()
        XCTAssertTrue(cleared.entries.isEmpty)
    }
    func testCorruptHistoryDoesNotPreventNewReports() async throws {
        let url = location(); defer { try? FileManager.default.removeItem(at:url.deletingLastPathComponent()) }
        try FileManager.default.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true)
        try Data("incomplete write".utf8).write(to:url)
        let journal = DiagnosticJournal(url:url)
        journal.record(.launch,seconds:.infinity)
        let export = try await journal.export()
        let restored = try JSONDecoder().decode(DiagnosticJournal.Report.self,from:Data(contentsOf:export))
        XCTAssertEqual(restored.entries.count,1)
        XCTAssertEqual(restored.entries.first?.kind,.launch)
        XCTAssertNil(restored.entries.first?.seconds)
    }
    func testMainThreadDelayReportsOnceAndRecoveryResetsProbe() {
        var probe = MainThreadMonitor.Probe()
        probe.begin(at:10)
        XCTAssertNil(probe.delayed(at:11))
        XCTAssertEqual(probe.delayed(at:12),2)
        XCTAssertNil(probe.delayed(at:13))
        XCTAssertEqual(probe.acknowledge(at:14),4)
        XCTAssertNil(probe.pendingSince)
        probe.begin(at:20)
        XCTAssertNil(probe.acknowledge(at:20.01))
        XCTAssertNil(probe.delayed(at:30))
    }
}
