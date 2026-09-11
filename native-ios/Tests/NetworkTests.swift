import XCTest
@testable import BeerSelectorNative

private final class FixtureProtocol: URLProtocol {
    @MainActor static var handler: ((URLRequest) async throws -> (Int,Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Task { @MainActor in
            do {
                guard let handler = Self.handler else { throw URLError(.unsupportedURL) }
                let (status,data) = try await handler(request)
                let response = HTTPURLResponse(url:request.url!,statusCode:status,httpVersion:nil,headerFields:nil)!
                client?.urlProtocol(self,didReceive:response,cacheStoragePolicy:.notAllowed)
                client?.urlProtocol(self,didLoad:data)
                client?.urlProtocolDidFinishLoading(self)
            } catch { client?.urlProtocol(self,didFailWithError:error) }
        }
    }
    override func stopLoading() {}
}

final class NetworkTests: XCTestCase {
    private func api(configuration: APIConfiguration = APIConfiguration()) -> BeerAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [FixtureProtocol.self]
        return BeerAPI(configuration:configuration,session:URLSession(configuration:config))
    }

    @MainActor private func exercisePostSync(syncBody: String, followupMissing: Bool = false) async throws -> ([Beer], [String]) {
        var configuration = APIConfiguration()
        configuration.enrichmentURL = URL(string:"https://enrichment.example.test")
        configuration.enrichmentKey = "fixture"
        let service = EnrichmentService(api:api(configuration:configuration))
        var paths: [String] = []
        var batches = 0
        FixtureProtocol.handler = { request in
            let path = request.url!.path
            paths.append(path)
            XCTAssertNil(request.value(forHTTPHeaderField:"Cookie"))
            if path == "/beers/sync" { return (200,Data(syncBody.utf8)) }
            XCTAssertEqual(path,"/beers/batch")
            batches += 1
            if batches == 1 || followupMissing {
                return (200,Data(#"{"enrichments":{},"missing":["1"],"requestId":"fixture"}"#.utf8))
            }
            return (200,Data(#"{"enrichments":{"1":{"enriched_abv":6.5,"enrichment_confidence":0.9,"enrichment_source":"description-fallback","brew_description":"Clean description","has_cleaned_description":true}},"missing":[],"requestId":"fixture"}"#.utf8))
        }
        defer { FixtureProtocol.handler = nil }
        let beers = [try Beer(row:["id":"1","brew_name":"Fixture","brew_description":"Original description"])]
        return (await service.enrich(beers),paths)
    }

    @MainActor func testSyncedBeerIsFetchedAndMergedImmediately() async throws {
        let (beers,paths) = try await exercisePostSync(syncBody:#"{"synced":1,"queued_for_cleanup":1,"requestId":"fixture"}"#)
        XCTAssertEqual(paths,["/beers/batch","/beers/sync","/beers/batch"])
        XCTAssertEqual(beers.first?.abv,6.5)
        XCTAssertEqual(beers.first?.enrichment_source,"description")
        XCTAssertEqual(beers.first?.brew_description,"Clean description")
    }

    @MainActor func testStillMissingAfterSyncDoesNotSyncAgain() async throws {
        let (beers,paths) = try await exercisePostSync(syncBody:#"{"synced":1,"queued_for_cleanup":1,"requestId":"fixture"}"#,followupMissing:true)
        XCTAssertEqual(paths,["/beers/batch","/beers/sync","/beers/batch"])
        XCTAssertEqual(beers.first?.brew_description,"Original description")
        XCTAssertNil(beers.first?.abv)
    }

    @MainActor func testInvalidOrUnsuccessfulSyncPreservesUpstreamBeerWithoutRefetch() async throws {
        for body in ["{}", #"{"synced":0,"queued_for_cleanup":0,"requestId":"fixture"}"#, #"{"synced":1,"queued_for_cleanup":1}"#] {
            let (beers,paths) = try await exercisePostSync(syncBody:body)
            XCTAssertEqual(paths,["/beers/batch","/beers/sync"])
            XCTAssertEqual(beers.first?.brew_description,"Original description")
        }
    }

    @MainActor func testPostFailureIsNotRetriedInsideHTTPClient() async throws {
        var calls = 0
        FixtureProtocol.handler = { _ in calls += 1; throw URLError(.networkConnectionLost) }
        defer { FixtureProtocol.handler = nil }
        let api = api()
        do {
            _ = try await api.request(api.configuration.endpoint("addToQueue.php"),method:"POST",fields:[:])
            XCTFail("Expected the network error")
        } catch { XCTAssertEqual((error as? URLError)?.code,.networkConnectionLost) }
        XCTAssertEqual(calls,1)
    }

    @MainActor func testMemberCookiesCannotBeSentToDataOrigin() async throws {
        var calls = 0
        FixtureProtocol.handler = { _ in calls += 1; return (200,Data()) }
        defer { FixtureProtocol.handler = nil }
        let member = MemberSession(memberId:"fixture",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        do {
            _ = try await api().request(URL(string:"https://fsbs.beerknurd.com/bk-store-json.php?sid=1")!,member:member)
            XCTFail("Expected origin rejection")
        } catch { XCTAssertEqual(calls,0) }
    }

    @MainActor func testFailedCheckInRemainsPendingAndSuccessfulRetryRemovesIt() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder); FixtureProtocol.handler = nil }
        let model = AppModel(api:api())
        model.db = try BeerDatabase(url:folder.appendingPathComponent("beers.db"))
        model.session = MemberSession(memberId:"fixture",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try model.db!.enqueue(type:"CHECK_IN_BEER",payload:["beerId":"1","beerName":"Beer","memberId":"fixture","storeId":"1"])
        var fail = true
        FixtureProtocol.handler = { request in
            if request.url!.path == "/addToQueue.php" {
                if fail { throw URLError(.networkConnectionLost) }
                return (200,Data())
            }
            return (200,Data("<html></html>".utf8))
        }
        model.offline = false
        await model.processOperations()
        XCTAssertEqual(model.operations.first?.status,"pending")
        XCTAssertEqual(model.operations.first?.retryCount,1)
        fail = false
        model.offline = false
        await model.processOperations()
        XCTAssertTrue(model.operations.isEmpty)
        XCTAssertTrue(model.tastedBeers.isEmpty)
    }

    @MainActor func testAccountSwitchDuringEnrichmentCannotReplaceRewards() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let unique = "native_test_" + UUID().uuidString
        let credentials = CredentialStore(prefix:unique,sessionStorageKey:unique + "_session")
        defer { try? FileManager.default.removeItem(at:folder); try? credentials.clear(); FixtureProtocol.handler = nil }
        var configuration = APIConfiguration()
        configuration.enrichmentURL = URL(string:"https://enrichment.example.test")
        configuration.enrichmentKey = "fixture"
        let model = AppModel(api:api(configuration:configuration),credentials:credentials)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db")); model.db = db
        model.session = MemberSession(memberId:"fixture",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        try db.setPreference("my_beers_api_url","https://fsbs.beerknurd.com/bk-member-json.php?uid=1")
        try db.replaceRewards([Reward(id:"saved",type:"Saved reward",redeemed:false)])
        FixtureProtocol.handler = { request in
            switch request.url!.path {
            case "/beers":
                return (200,Data(#"{"storeId":"1","beers":[{"id":"1","brew_name":"Beer"}]}"#.utf8))
            case "/bk-member-json.php":
                return (200,Data(#"[{},{"tasted_brew_current_round":[{"id":"tasted","brew_name":"Old tasting"}]},{"reward":[{"reward_id":"stale","reward_type":"Stale reward"}]}]"#.utf8))
            case "/beers/batch":
                await model.logout()
                return (200,Data(#"{"enrichments":{},"missing":[]}"#.utf8))
            case "/logout.php": return (200,Data())
            default: throw URLError(.unsupportedURL)
            }
        }
        await model.refresh()
        XCTAssertNil(model.session)
        XCTAssertEqual(try db.rewards().map(\.id),["saved"])
        XCTAssertTrue(try db.beers(tasted:true).isEmpty)
    }
}
