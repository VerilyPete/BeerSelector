import XCTest
@testable import BeerSelectorNative

/// The app's half of the POST /usage request contract. ufobeer's contract test parses
/// usage-report.request.json with the worker's parser and compares it with
/// usage-report.expected.json. Only this target can see `UsageEvent`, so it proves the
/// fixtures cover every event the app can send.
final class UsageContractTests: XCTestCase {
    private static let shuffledCounts = [7, 19, 2, 24, 11, 15, 1, 22, 9, 17, 4, 25, 13, 6, 20, 3, 10, 23, 16, 8, 21, 5, 14, 18, 12]

    private static func canonicalBatch() throws -> UsageBatch {
        guard UsageEvent.allCases.count == shuffledCounts.count else {
            XCTFail("Give every event a count: make shuffledCounts a shuffle of 1...\(UsageEvent.allCases.count)")
            throw CocoaError(.validationMultipleErrors)
        }
        return UsageBatch(
            installID:try XCTUnwrap(UUID(uuidString:"3F2B8C1E-5D4A-4E7B-9C0F-1A2B3C4D5E6F")),
            batchID:try XCTUnwrap(UUID(uuidString:"9A8B7C6D-1E2F-4A3B-8C4D-5E6F7A8B9C0D")),
            appVersion:"1.1.0",
            aiStatus:.appleIntelligence,
            osMajor:26,
            events:zip(UsageEvent.allCases,shuffledCounts).map { UsageEventCount(event:$0,count:$1) }
        )
    }

    private func fixture(_ name: String) throws -> Data {
        let url = try XCTUnwrap(Bundle(for:Self.self).url(forResource:name,withExtension:"json"),"\(name).json is missing from the test bundle")
        return try Data(contentsOf:url)
    }

    private func jsonObject(_ data: Data) throws -> NSDictionary {
        try XCTUnwrap(JSONSerialization.jsonObject(with:data) as? NSDictionary)
    }

    func testTheEncoderWritesExactlyTheCommittedRequestFixture() throws {
        let encoded = try Self.canonicalBatch().encoded()
        let committed = try fixture("usage-report.request")
        XCTAssertEqual(
            try jsonObject(encoded), try jsonObject(committed),
            "Encoder output changed. If intended, replace usage-report.request.json with:\n\(String(decoding:encoded,as:UTF8.self))"
        )
    }

    func testTheCanonicalBatchSendsEveryEventOnceWithCountsOneToN() throws {
        let batch = try Self.canonicalBatch()
        XCTAssertEqual(batch.events.map(\.event), UsageEvent.allCases)
        XCTAssertEqual(batch.events.map(\.count).sorted(), Array(1...UsageEvent.allCases.count))
    }

    func testTheHandWrittenExpectedFixtureMatchesTheEventListAndCanonicalBatch() throws {
        let batch = try Self.canonicalBatch()
        let expected = try jsonObject(try fixture("usage-report.expected"))
        XCTAssertEqual(Set(expected.allKeys.compactMap { $0 as? String }), ["install_id","batch_id","app_version","ai_status","os_major","events"])
        XCTAssertEqual((expected["install_id"] as? String)?.lowercased(), batch.installID.uuidString.lowercased())
        XCTAssertEqual((expected["batch_id"] as? String)?.lowercased(), batch.batchID.uuidString.lowercased())
        XCTAssertEqual(expected["app_version"] as? String, batch.appVersion)
        XCTAssertEqual(expected["ai_status"] as? String, batch.aiStatus.rawValue)
        XCTAssertEqual(expected["os_major"] as? Int, batch.osMajor)
        let items = try XCTUnwrap(expected["events"] as? [[String:Any]])
        let names = items.compactMap { $0["name"] as? String }
        XCTAssertEqual(names.count, items.count)
        XCTAssertEqual(names.sorted(), UsageEvent.allCases.map(\.rawValue).sorted(), "Each event in the app's list must appear exactly once")
        let counts = Dictionary(uniqueKeysWithValues:items.compactMap { item in (item["name"] as? String).map { ($0, item["count"] as? Int) } })
        for entry in batch.events {
            XCTAssertEqual(counts[entry.event.rawValue] ?? nil, entry.count, entry.event.rawValue)
        }
    }

    func testEveryCompatibilityMapsToItsWireStatus() {
        let expected: [(RecommendationCompatibility, String)] = [
            (.appleIntelligence, "apple_intelligence"),
            (.requiresNewerOS, "requires_newer_os"),
            (.deviceNotEligible, "device_not_eligible"),
            (.notEnabled, "not_enabled"),
            (.modelNotReady, "model_not_ready"),
            (.unsupportedLocale, "unsupported_locale"),
            (.unavailable, "unavailable"),
        ]
        for (compatibility, wire) in expected {
            XCTAssertEqual(UsageAIStatus(compatibility).rawValue, wire, "\(compatibility)")
        }
    }

    func testTheEncoderLowerCasesIdentifiersAndUsesWireFieldNames() throws {
        let object = try jsonObject(try Self.canonicalBatch().encoded())
        XCTAssertEqual(object["install_id"] as? String, "3f2b8c1e-5d4a-4e7b-9c0f-1a2b3c4d5e6f")
        XCTAssertEqual(object["batch_id"] as? String, "9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d")
        XCTAssertEqual((object["events"] as? [[String:Any]])?.first?["name"] as? String, "session_started")
    }
}
