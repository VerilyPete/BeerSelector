import XCTest
@testable import BeerSelectorNative

private actor ScriptedTransport: UsageTransport {
    private var outcomes: [UsageSendOutcome]
    private(set) var bodies: [Data] = []
    private var gate: CheckedContinuation<Void,Never>?
    private var gated: Bool
    private var entered: CheckedContinuation<Void,Never>?

    init(_ outcomes: [UsageSendOutcome] = [], gated: Bool = false) { self.outcomes = outcomes; self.gated = gated }

    func send(_ body: Data) async -> UsageSendOutcome {
        bodies.append(body)
        if gated {
            gated = false
            entered?.resume(); entered = nil
            await withCheckedContinuation { gate = $0 }
        }
        return outcomes.isEmpty ? .accepted : outcomes.removeFirst()
    }
    func waitUntilSending() async {
        if !bodies.isEmpty { return }
        await withCheckedContinuation { entered = $0 }
    }
    func release() { gate?.resume(); gate = nil }
}

final class UsageSendingTests: XCTestCase {
    private static let current = UsageDimensions(appVersion:"1.1.0",aiStatus:.appleIntelligence,osMajor:26)

    private func recorder() -> UsageRecorder {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("UsageSendingTests-\(UUID().uuidString)")
        addTeardownBlock { try? FileManager.default.removeItem(at:directory) }
        return UsageRecorder(url:directory.appendingPathComponent("state.json"))
    }

    private func record(_ recorder: UsageRecorder, _ event: UsageEvent = .viewHome, times: Int = 1, appVersion: String = "1.1.0") async {
        let dimensions = UsageDimensions(appVersion:appVersion,aiStatus:.appleIntelligence,osMajor:26)
        for _ in 0..<times { await recorder.record(event,dimensions:dimensions) }
    }

    private func appVersions(_ bodies: [Data]) -> [String] {
        bodies.compactMap { (try? JSONSerialization.jsonObject(with:$0) as? [String:Any])?["app_version"] as? String }
    }

    func testAFlushWithNothingRecordedSendsNothing() async {
        let transport = ScriptedTransport()
        await recorder().flush(via:transport)
        let sent = await transport.bodies
        XCTAssertEqual(sent,[])
    }

    func testOneFlushDrainsEveryWaitingTupleAfterEachAcceptance() async {
        let recorder = recorder()
        await record(recorder,appVersion:"1.1.0")
        await record(recorder,appVersion:"1.2.0")
        let transport = ScriptedTransport()

        await recorder.flush(via:transport)

        let sent = await transport.bodies
        XCTAssertEqual(appVersions(sent),["1.1.0","1.2.0"])
        let left = await recorder.nextBatch()
        XCTAssertNil(left)
    }

    func testAFlushSendsAtMostFiveBatchesAndTheNextFlushSendsTheRest() async {
        let recorder = recorder()
        await record(recorder,times:2600)
        let first = ScriptedTransport()
        let second = ScriptedTransport()

        await recorder.flush(via:first)
        await recorder.flush(via:second)

        let firstCount = await first.bodies.count
        let secondCount = await second.bodies.count
        XCTAssertEqual(firstCount,5)
        XCTAssertEqual(secondCount,1)
    }

    func testAFailureEndsTheFlushAndTheSameBatchIsResentByTheNextFlush() async {
        let recorder = recorder()
        await record(recorder,appVersion:"1.1.0")
        await record(recorder,appVersion:"1.2.0")
        await record(recorder,appVersion:"1.3.0")
        let failing = ScriptedTransport([.accepted,.notAccepted])
        let next = ScriptedTransport()

        await recorder.flush(via:failing)
        await recorder.flush(via:next)

        let failed = await failing.bodies
        let resent = await next.bodies
        XCTAssertEqual(appVersions(failed),["1.1.0","1.2.0"])
        XCTAssertEqual(resent.first,failed.last,"the failed batch is resent byte for byte, with its batch_id")
        XCTAssertEqual(appVersions(resent),["1.2.0","1.3.0"])
    }

    func testALostResponseResendsTheSamePayloadInsteadOfANewBatch() async {
        let recorder = recorder()
        await record(recorder,times:3)
        let lost = ScriptedTransport([.notAccepted])
        let next = ScriptedTransport()

        await recorder.flush(via:lost)
        await record(recorder,.beerRated)
        await recorder.flush(via:next)

        let lostBodies = await lost.bodies
        let nextBodies = await next.bodies
        XCTAssertEqual(lostBodies.count,1)
        XCTAssertEqual(nextBodies.first,lostBodies.first)
        XCTAssertEqual(nextBodies.count,2,"the event recorded meanwhile goes in the following batch")
    }

    func testAFlushStartedWhileOneIsSendingDoesNothing() async {
        let recorder = recorder()
        await record(recorder,appVersion:"1.1.0")
        await record(recorder,appVersion:"1.2.0")
        let transport = ScriptedTransport(gated:true)

        let running = Task { await recorder.flush(via:transport) }
        await transport.waitUntilSending()
        await recorder.flush(via:transport)
        let duringOverlap = await transport.bodies.count
        await transport.release()
        await running.value

        let total = await transport.bodies.count
        XCTAssertEqual(duringOverlap,1)
        XCTAssertEqual(total,2)
    }
}

@MainActor
final class UsageHTTPTransportTests: XCTestCase {
    private let fixture = HTTPFixture()

    private func configuration(enabled: String? = "true", url: String? = "https://worker.example/api", key: String? = "fixture") -> APIConfiguration {
        var values: [String:String] = [:]
        values["UsageTelemetryEnabled"] = enabled
        values["EnrichmentURL"] = url
        values["EnrichmentKey"] = key
        return APIConfiguration.from(values:values)
    }

    func testTheTransportExistsOnlyWhenSwitchedOnAndTheWorkerIsConfigured() {
        XCTAssertNotNil(UsageHTTPTransport(api:fixture.api(configuration:configuration())))
        XCTAssertNil(UsageHTTPTransport(api:fixture.api(configuration:configuration(enabled:nil))))
        XCTAssertNil(UsageHTTPTransport(api:fixture.api(configuration:configuration(enabled:"false"))))
        XCTAssertNil(UsageHTTPTransport(api:fixture.api(configuration:configuration(url:nil))))
        XCTAssertNil(UsageHTTPTransport(api:fixture.api(configuration:configuration(url:"http://worker.example/api"))))
        XCTAssertNil(UsageHTTPTransport(api:fixture.api(configuration:configuration(key:""))))
    }

    func testTheBatchIsPostedAsIsToTheWorkersUsageRouteWithTheAPIKey() async throws {
        var seen: [URLRequest] = []
        fixture.handler = { request in seen.append(request); return (204,Data()) }
        let transport = try XCTUnwrap(UsageHTTPTransport(api:fixture.api(configuration:configuration())))
        let body = Data(#"{"install_id":"x"}"#.utf8)

        let outcome = await transport.send(body)

        XCTAssertEqual(outcome,.accepted)
        XCTAssertEqual(seen.count,1)
        XCTAssertEqual(seen.first?.url?.absoluteString,"https://worker.example/api/usage")
        XCTAssertEqual(seen.first?.httpMethod,"POST")
        XCTAssertEqual(seen.first?.value(forHTTPHeaderField:"X-API-Key"),"fixture")
        XCTAssertEqual(seen.first?.value(forHTTPHeaderField:"Content-Type"),"application/json")
        XCTAssertEqual(seen.first.flatMap(Self.body),body)
    }

    func testOnly204AcceptsTheBatchAndNothingIsRetriedImmediately() async throws {
        for status in [200, 400, 429, 500, 503] {
            var calls = 0
            fixture.handler = { _ in calls += 1; return (status,Data()) }
            let transport = try XCTUnwrap(UsageHTTPTransport(api:fixture.api(configuration:configuration())))
            let outcome = await transport.send(Data("{}".utf8))
            XCTAssertEqual(outcome,.notAccepted,"\(status)")
            XCTAssertEqual(calls,1,"\(status)")
        }
        fixture.handler = { _ in throw URLError(.timedOut) }
        let transport = try XCTUnwrap(UsageHTTPTransport(api:fixture.api(configuration:configuration())))
        let outcome = await transport.send(Data("{}".utf8))
        XCTAssertEqual(outcome,.notAccepted)
    }

    private static func body(_ request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open(); defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating:0,count:4096)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer,maxLength:buffer.count)
            guard read > 0 else { break }
            data.append(buffer,count:read)
        }
        return data
    }
}
