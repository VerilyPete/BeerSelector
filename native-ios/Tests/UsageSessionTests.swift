import XCTest
@testable import BeerSelectorNative

/// The worker plan's session rule: a new session after 3+ hours away from the foreground,
/// across cold launches, decided once per return to the foreground.
final class UsageSessionTests: XCTestCase {
    private static let dimensions = UsageDimensions(appVersion:"1.1.0",aiStatus:.appleIntelligence,osMajor:26)
    private static let hour: TimeInterval = 3600

    private struct Device {
        let url: URL
        let clock = UsageTestClock()
        let ids = UsageTestIDs()
        func launch() -> UsageRecorder { UsageRecorder(url:url,now:{ clock.now },newID:{ ids.make() }) }
    }

    private func device() -> Device {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("UsageSessionTests-\(UUID().uuidString)")
        addTeardownBlock { try? FileManager.default.removeItem(at:directory) }
        return Device(url:directory.appendingPathComponent("state.json"))
    }

    private func sessions(_ device: Device) async -> Int {
        let recorder = device.launch()
        var total = 0
        while let batch = await recorder.nextBatch() {
            let object = (try? JSONSerialization.jsonObject(with:batch.body)) as? [String:Any]
            let events = object?["events"] as? [[String:Any]] ?? []
            total += events.first { $0["name"] as? String == "session_started" }?["count"] as? Int ?? 0
            await recorder.acknowledge(batch.batchID)
        }
        return total
    }

    private func returnToForeground(_ recorder: UsageRecorder) async {
        await recorder.phaseChanged(.inactive,dimensions:Self.dimensions)
        await recorder.phaseChanged(.active,dimensions:Self.dimensions)
    }

    private func leave(_ recorder: UsageRecorder) async {
        await recorder.phaseChanged(.inactive,dimensions:Self.dimensions)
        await recorder.phaseChanged(.background,dimensions:Self.dimensions)
    }

    func testTheFirstLaunchEverStartsOneSession() async {
        let device = device()
        let recorder = device.launch()
        await recorder.phaseChanged(.active,dimensions:Self.dimensions)
        let started = await sessions(device)
        XCTAssertEqual(started,1)
    }

    func testLaunchingAndBecomingActiveDecidesOnceAndInterruptionsStartNothing() async {
        let device = device()
        let recorder = device.launch()
        await recorder.phaseChanged(.inactive,dimensions:Self.dimensions)
        await recorder.phaseChanged(.active,dimensions:Self.dimensions)
        for _ in 0..<3 {
            device.clock.advance(4 * Self.hour)
            await returnToForeground(recorder)
        }
        let started = await sessions(device)
        XCTAssertEqual(started,1)
    }

    func testAWarmReturnWithinThreeHoursContinuesTheSession() async {
        let device = device()
        let recorder = device.launch()
        await recorder.phaseChanged(.active,dimensions:Self.dimensions)
        await leave(recorder)
        device.clock.advance(3 * Self.hour - 1)
        await returnToForeground(recorder)
        let started = await sessions(device)
        XCTAssertEqual(started,1)
    }

    func testAWarmReturnAfterThreeHoursStartsOneNewSession() async {
        let device = device()
        let recorder = device.launch()
        await recorder.phaseChanged(.active,dimensions:Self.dimensions)
        await leave(recorder)
        device.clock.advance(3 * Self.hour)
        await returnToForeground(recorder)
        await returnToForeground(recorder)
        let started = await sessions(device)
        XCTAssertEqual(started,2)
    }

    func testAColdReturnIsMeasuredFromTheLastForegroundMoment() async {
        let device = device()
        let first = device.launch()
        await first.phaseChanged(.active,dimensions:Self.dimensions)
        await leave(first)

        device.clock.advance(1 * Self.hour)
        let killedDuringTrivia = device.launch()
        await killedDuringTrivia.phaseChanged(.active,dimensions:Self.dimensions)
        await leave(killedDuringTrivia)

        device.clock.advance(3 * Self.hour)
        let nextDay = device.launch()
        await nextDay.phaseChanged(.active,dimensions:Self.dimensions)

        let started = await sessions(device)
        XCTAssertEqual(started,2)
    }

    func testAnEventRecordedAtTheMomentOfReturnDoesNotHideAThreeHourGap() async {
        let device = device()
        let recorder = device.launch()
        await recorder.phaseChanged(.active,dimensions:Self.dimensions)
        await leave(recorder)
        device.clock.advance(3 * Self.hour)
        await recorder.record(.viewHome,dimensions:Self.dimensions,whileActive:true)
        await returnToForeground(recorder)
        let started = await sessions(device)
        XCTAssertEqual(started,2)
    }

    func testWorkFinishingAfterBackgroundingDoesNotExtendTheSession() async {
        let device = device()
        let recorder = device.launch()
        await recorder.phaseChanged(.active,dimensions:Self.dimensions)
        await leave(recorder)
        device.clock.advance(20)
        await recorder.record(.rewardQueued,dimensions:Self.dimensions,whileActive:false)
        device.clock.advance(3 * Self.hour - 20)
        await returnToForeground(recorder)
        let started = await sessions(device)
        XCTAssertEqual(started,2)
    }

    func testACrashWhileActiveIsMeasuredFromTheLastRefresh() async {
        let within = device()
        let crashed = within.launch()
        await crashed.phaseChanged(.active,dimensions:Self.dimensions)
        within.clock.advance(50 * 60)
        await crashed.refreshActivity()
        within.clock.advance(3 * Self.hour - 1)
        await within.launch().phaseChanged(.active,dimensions:Self.dimensions)
        let sameSession = await sessions(within)

        let after = device()
        let crashedAgain = after.launch()
        await crashedAgain.phaseChanged(.active,dimensions:Self.dimensions)
        await crashedAgain.record(.viewHome,dimensions:Self.dimensions,whileActive:true)
        after.clock.advance(3 * Self.hour)
        await after.launch().phaseChanged(.active,dimensions:Self.dimensions)
        let newSession = await sessions(after)

        XCTAssertEqual(sameSession,1)
        XCTAssertEqual(newSession,2)
    }

    func testTheRefreshDoesNothingWhileTheDecisionIsPending() async {
        let device = device()
        let recorder = device.launch()
        await recorder.phaseChanged(.active,dimensions:Self.dimensions)
        await leave(recorder)
        device.clock.advance(3 * Self.hour)
        await recorder.refreshActivity()
        await returnToForeground(recorder)
        let started = await sessions(device)
        XCTAssertEqual(started,2)
    }

    func testBecomingActiveReportsWhetherASessionStarted() async {
        let device = device()
        let recorder = device.launch()
        let first = await recorder.phaseChanged(.active,dimensions:Self.dimensions)
        await leave(recorder)
        device.clock.advance(60)
        await recorder.phaseChanged(.inactive,dimensions:Self.dimensions)
        let quickReturn = await recorder.phaseChanged(.active,dimensions:Self.dimensions)
        XCTAssertTrue(first)
        XCTAssertFalse(quickReturn)
    }
}

private actor CountingTransport: UsageTransport {
    private(set) var bodies: [Data] = []
    func send(_ body: Data) async -> UsageSendOutcome { bodies.append(body); return .accepted }
}

@MainActor
final class UsageTelemetryTests: XCTestCase {
    private func telemetry(transport: (any UsageTransport)?) -> UsageTelemetry {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("UsageTelemetryTests-\(UUID().uuidString)")
        addTeardownBlock { try? FileManager.default.removeItem(at:directory) }
        return UsageTelemetry(
            recorder:UsageRecorder(url:directory.appendingPathComponent("state.json")),
            transport:transport,
            dimensions:{ UsageDimensions(appVersion:"1.1.0",aiStatus:.appleIntelligence,osMajor:26) },
            backgroundTask:{ work in await work() }
        )
    }

    private func names(_ bodies: [Data]) -> [[String]] {
        bodies.map { body in
            let object = (try? JSONSerialization.jsonObject(with:body)) as? [String:Any]
            return (object?["events"] as? [[String:Any]] ?? []).compactMap { $0["name"] as? String }
        }
    }

    func testStartingASessionFlushes() async {
        let transport = CountingTransport()
        let telemetry = telemetry(transport:transport)

        telemetry.scenePhase(.active)
        await telemetry.idle()

        let sent = await transport.bodies
        XCTAssertEqual(names(sent),[["session_started"]])
    }

    func testMovingToTheBackgroundFlushesEventsRecordedInOrder() async {
        let transport = CountingTransport()
        let telemetry = telemetry(transport:transport)
        telemetry.scenePhase(.active)
        await telemetry.idle()

        telemetry.record(.viewHome)
        telemetry.record(.viewQueue)
        telemetry.scenePhase(.inactive)
        telemetry.scenePhase(.background)
        await telemetry.idle()

        let sent = await transport.bodies
        XCTAssertEqual(names(sent),[["session_started"],["view_home","view_queue"]])
    }

    func testWithoutATransportEventsAreKeptAndNothingIsSent() async {
        let telemetry = telemetry(transport:nil)
        telemetry.scenePhase(.active)
        telemetry.record(.viewHome)
        telemetry.scenePhase(.background)
        await telemetry.idle()
        let pending = await telemetry.recorder.nextBatch()
        XCTAssertNotNil(pending)
    }
}
