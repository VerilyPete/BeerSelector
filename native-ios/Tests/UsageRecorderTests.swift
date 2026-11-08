import XCTest
@testable import BeerSelectorNative

final class UsageTestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var current = Date(timeIntervalSince1970:1_800_000_000)
    var now: Date { lock.withLock { current } }
    func advance(_ seconds: TimeInterval) { lock.withLock { current += seconds } }
}

final class UsageTestIDs: @unchecked Sendable {
    private let lock = NSLock()
    private var next = 0
    func make() -> UUID {
        lock.withLock {
            next += 1
            return UUID(uuidString:String(format:"00000000-0000-4000-8000-%012d",next))!
        }
    }
}

final class UsageRecorderTests: XCTestCase {
    private struct Sent: Equatable {
        let installID: String
        let batchID: String
        let appVersion: String
        let aiStatus: String
        let osMajor: Int
        let counts: [String:Int]
    }

    private static let current = UsageDimensions(appVersion:"1.1.0",aiStatus:.appleIntelligence,osMajor:26)
    private static let upgraded = UsageDimensions(appVersion:"1.2.0",aiStatus:.appleIntelligence,osMajor:26)

    private func stateURL() -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("UsageRecorderTests-\(UUID().uuidString)")
        addTeardownBlock { try? FileManager.default.removeItem(at:directory) }
        return directory.appendingPathComponent("Usage/state.json")
    }

    private func recorder(_ url: URL, clock: UsageTestClock = UsageTestClock(), ids: UsageTestIDs = UsageTestIDs()) -> UsageRecorder {
        UsageRecorder(url:url,now:{ clock.now },newID:{ ids.make() })
    }

    private func decode(_ batch: UsagePendingBatch) throws -> Sent {
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with:batch.body) as? [String:Any])
        let items = try XCTUnwrap(object["events"] as? [[String:Any]])
        return Sent(
            installID:try XCTUnwrap(object["install_id"] as? String),
            batchID:try XCTUnwrap(object["batch_id"] as? String),
            appVersion:try XCTUnwrap(object["app_version"] as? String),
            aiStatus:try XCTUnwrap(object["ai_status"] as? String),
            osMajor:try XCTUnwrap(object["os_major"] as? Int),
            counts:Dictionary(uniqueKeysWithValues:try items.map { (try XCTUnwrap($0["name"] as? String), try XCTUnwrap($0["count"] as? Int)) })
        )
    }

    private func record(_ recorder: UsageRecorder, _ event: UsageEvent, times: Int = 1, dimensions: UsageDimensions = current) async {
        for _ in 0..<times { await recorder.record(event,dimensions:dimensions) }
    }

    private func sendAll(_ recorder: UsageRecorder) async throws -> [Sent] {
        var sent: [Sent] = []
        while let batch = await recorder.nextBatch() {
            sent.append(try decode(batch))
            await recorder.acknowledge(batch.batchID)
            XCTAssertLessThan(sent.count,50,"nextBatch never ran dry")
            if sent.count >= 50 { break }
        }
        return sent
    }

    func testNothingRecordedMeansNothingToSend() async {
        let batch = await recorder(stateURL()).nextBatch()
        XCTAssertNil(batch)
    }

    func testRecordedEventsAreSentOnceWithTheirCountsAndDimensions() async throws {
        let recorder = recorder(stateURL())
        await record(recorder,.viewHome,times:3)
        await record(recorder,.checkinQueued)

        let sent = try await sendAll(recorder)

        XCTAssertEqual(sent.count,1)
        XCTAssertEqual(sent.first?.counts,["view_home":3,"checkin_queued":1])
        XCTAssertEqual(sent.first?.appVersion,"1.1.0")
        XCTAssertEqual(sent.first?.aiStatus,"apple_intelligence")
        XCTAssertEqual(sent.first?.osMajor,26)
    }

    func testABatchCarriesOneDimensionTupleAndTheOldestIsSentFirst() async throws {
        let clock = UsageTestClock()
        let recorder = recorder(stateURL(),clock:clock)
        await record(recorder,.viewHome,times:2)
        clock.advance(60)
        await record(recorder,.viewHome,dimensions:Self.upgraded)
        clock.advance(60)
        await record(recorder,.beerRated)

        let sent = try await sendAll(recorder)

        XCTAssertEqual(sent.map(\.appVersion),["1.1.0","1.2.0"])
        XCTAssertEqual(sent.map(\.counts),[["view_home":2,"beer_rated":1],["view_home":1]])
    }

    func testABatchSendsAtMost500OfAnEventAndCarriesTheRestForward() async throws {
        let recorder = recorder(stateURL())
        await record(recorder,.viewHome,times:1201)
        await record(recorder,.viewQueue,times:500)

        let sent = try await sendAll(recorder)

        XCTAssertEqual(sent.map(\.counts),[["view_home":500,"view_queue":500],["view_home":500],["view_home":201]])
    }

    func testAnUnacknowledgedBatchIsOfferedAgainUnchanged() async throws {
        let recorder = recorder(stateURL())
        await record(recorder,.viewHome)
        let first = await recorder.nextBatch()
        await record(recorder,.viewHome,times:4)

        let again = await recorder.nextBatch()

        XCTAssertEqual(again,first)
    }

    func testEventsRecordedWhileABatchIsPendingAreSentInTheNextBatch() async throws {
        let recorder = recorder(stateURL())
        await record(recorder,.viewHome)
        let pendingValue = await recorder.nextBatch()
        let pending = try XCTUnwrap(pendingValue)
        await record(recorder,.viewHome,times:2)
        await record(recorder,.untappdOpened)
        await recorder.acknowledge(pending.batchID)

        let sent = try await sendAll(recorder)

        XCTAssertEqual(try decode(pending).counts,["view_home":1])
        XCTAssertEqual(sent.map(\.counts),[["view_home":2,"untappd_opened":1]])
    }

    func testEveryBatchHasItsOwnBatchIDAndTheSameInstallID() async throws {
        let recorder = recorder(stateURL())
        await record(recorder,.viewHome,times:1001)

        let sent = try await sendAll(recorder)

        XCTAssertEqual(sent.count,3)
        XCTAssertEqual(Set(sent.map(\.batchID)).count,3)
        XCTAssertEqual(Set(sent.map(\.installID)).count,1)
        XCTAssertFalse(sent.contains { $0.batchID == $0.installID })
    }

    func testAcknowledgingAnotherBatchIDLeavesThePendingBatch() async throws {
        let recorder = recorder(stateURL())
        await record(recorder,.viewHome)
        let pending = await recorder.nextBatch()

        await recorder.acknowledge(UUID())

        let again = await recorder.nextBatch()
        XCTAssertEqual(again,pending)
    }

    func testAPendingBatchIsKeptForSevenDaysAndDroppedAfter() async throws {
        let clock = UsageTestClock()
        let recorder = recorder(stateURL(),clock:clock)
        await record(recorder,.viewHome)
        let pending = await recorder.nextBatch()
        await record(recorder,.beerRated)

        clock.advance(7 * 24 * 3600)
        let atSevenDays = await recorder.nextBatch()
        clock.advance(1)
        let afterSevenDaysValue = await recorder.nextBatch()
        let afterSevenDays = try XCTUnwrap(afterSevenDaysValue)

        XCTAssertEqual(atSevenDays,pending)
        XCTAssertNotEqual(afterSevenDays.batchID,pending?.batchID)
        XCTAssertEqual(try decode(afterSevenDays).counts,["beer_rated":1])
    }

    func testStateSurvivesARestartAfterEveryStep() async throws {
        let url = stateURL()
        let clock = UsageTestClock()
        let ids = UsageTestIDs()
        await record(recorder(url,clock:clock,ids:ids),.viewHome,times:2)

        let frozenValue = await recorder(url,clock:clock,ids:ids).nextBatch()

        let frozen = try XCTUnwrap(frozenValue)
        let resent = await recorder(url,clock:clock,ids:ids).nextBatch()
        await record(recorder(url,clock:clock,ids:ids),.beerRated)
        await recorder(url,clock:clock,ids:ids).acknowledge(frozen.batchID)
        let rest = try await sendAll(recorder(url,clock:clock,ids:ids))

        XCTAssertEqual(resent,frozen)
        XCTAssertEqual(try decode(frozen).counts,["view_home":2])
        XCTAssertEqual(rest.map(\.counts),[["beer_rated":1]])
        XCTAssertEqual(rest.first?.installID,try decode(frozen).installID)
    }

    func testAMissingSnapshotStartsAFreshInstallThatStaysStable() async throws {
        let url = stateURL()
        let ids = UsageTestIDs()
        await record(recorder(url,ids:ids),.viewHome)
        let first = try await sendAll(recorder(url,ids:ids))
        await record(recorder(url,ids:ids),.viewHome)
        let second = try await sendAll(recorder(url,ids:ids))

        XCTAssertEqual(first.count,1)
        XCTAssertEqual(first.map(\.installID),second.map(\.installID))
    }

    func testACorruptSnapshotStartsFreshWithoutThrowing() async throws {
        let url = stateURL()
        try FileManager.default.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true)
        try Data("not json".utf8).write(to:url)
        let recorder = recorder(url)
        await record(recorder,.viewHome)

        let sent = try await sendAll(recorder)

        XCTAssertEqual(sent.map(\.counts),[["view_home":1]])
    }

    func testNothingIsFrozenWhileTheSnapshotCannotBeWrittenAndNoCountIsLost() async throws {
        let url = stateURL()
        let recorder = recorder(url)
        await record(recorder,.viewHome)
        let directory = url.deletingLastPathComponent().path
        try FileManager.default.setAttributes([.posixPermissions:0o555],ofItemAtPath:directory)
        addTeardownBlock { try? FileManager.default.setAttributes([.posixPermissions:0o755],ofItemAtPath:directory) }

        let whileReadOnly = await recorder.nextBatch()
        let againWhileReadOnly = await recorder.nextBatch()
        try FileManager.default.setAttributes([.posixPermissions:0o755],ofItemAtPath:directory)
        let sent = try await sendAll(recorder)
        let afterRestart = try await sendAll(self.recorder(url))

        XCTAssertNil(whileReadOnly)
        XCTAssertNil(againWhileReadOnly,"a batch that never reached disk must not be offered")
        XCTAssertEqual(sent.map(\.counts),[["view_home":1]])
        XCTAssertEqual(afterRestart,[])
    }

    func testAnEventWhoseWriteFailedIsSavedByTheNextWrite() async throws {
        let url = stateURL()
        let recorder = recorder(url)
        await record(recorder,.beerRated)
        let directory = url.deletingLastPathComponent().path
        try FileManager.default.setAttributes([.posixPermissions:0o555],ofItemAtPath:directory)
        addTeardownBlock { try? FileManager.default.setAttributes([.posixPermissions:0o755],ofItemAtPath:directory) }

        await record(recorder,.viewHome)
        try FileManager.default.setAttributes([.posixPermissions:0o755],ofItemAtPath:directory)
        await record(recorder,.untappdOpened)
        let afterRestart = try await sendAll(self.recorder(url))

        XCTAssertEqual(afterRestart.map(\.counts),[["beer_rated":1,"view_home":1,"untappd_opened":1]])
    }
}
