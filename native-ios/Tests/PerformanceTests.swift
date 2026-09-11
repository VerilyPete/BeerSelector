import XCTest
@testable import BeerSelectorNative

/// Opt-in measurements, excluded from the fast correctness plans. No timing gates.
final class PerformanceTests: XCTestCase {
    func testSnapshotParsingAndPersistence() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let db = try BeerDatabase(url: folder.appendingPathComponent("beers.db"))
        let rows = (0..<1000).map { ["id": String($0), "brew_name": "Fixture beer \($0)", "brew_description": String(repeating: "A descriptive tasting note. ", count: 20)] }
        let data = try JSONSerialization.data(withJSONObject: rows)
        measure(metrics: [XCTClockMetric(), XCTCPUMetric(), XCTMemoryMetric()]) {
            do {
                let beers = try BeerAPI.parseBeers(data)
                try db.transaction { try db.replaceBeers(beers) }
                XCTAssertEqual(try db.beers().count, 1000)
            } catch { XCTFail("Snapshot failed: \(error)") }
        }
    }
    func testContendedWriterPreservesSnapshot() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("beers.db")
        let db = try BeerDatabase(url: url)
        let other = try BeerDatabase(url: url)
        try db.transaction { try db.replaceBeers([Beer(id: "saved", name: "Saved")]) }
        try other.execute("BEGIN IMMEDIATE")
        defer { try? other.execute("ROLLBACK") }
        let start = ProcessInfo.processInfo.systemUptime
        XCTAssertThrowsError(try db.transaction { try db.replaceBeers([Beer(id: "new", name: "New")]) })
        print("SQLite contended writer wait seconds: \(ProcessInfo.processInfo.systemUptime - start)")
        XCTAssertEqual(try db.beers().map(\.id), ["saved"])
    }
}
