import XCTest
@testable import BeerSelectorNative

final class NetworkTests: XCTestCase {
    @MainActor private let fixture = HTTPFixture()
    @MainActor private func api(configuration: APIConfiguration = APIConfiguration()) -> BeerAPI {
        fixture.api(configuration: configuration)
    }

    private func enrichmentJSON(_ request: URLRequest) throws -> [String:Any] {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating:0,count:4096)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer,maxLength:buffer.count)
                guard count >= 0 else { throw URLError(.cannotDecodeRawData) }
                if count == 0 { break }
                data.append(contentsOf:buffer.prefix(count))
            }
        }
        return try XCTUnwrap(JSONSerialization.jsonObject(with:data) as? [String:Any])
    }
    private var enrichmentConfiguration: APIConfiguration {
        var c = APIConfiguration()
        c.enrichmentURL = URL(string:"https://enrichment.example.test")
        c.enrichmentKey = "fixture"
        return c
    }
    @MainActor func testEnrichmentChunkLimitsAndPostSyncMergeAcrossChunks() async throws {
        let service = EnrichmentService(api:api(configuration:enrichmentConfiguration))
        let beers = (0..<101).map { Beer(id:String($0),name:"Beer \($0)") }
        var batchSizes: [Int] = [], syncSizes: [Int] = []
        var synced = Set<String>()
        fixture.handler = { request in
            let body = try self.enrichmentJSON(request)
            if request.url!.path == "/beers/sync" {
                let rows = try XCTUnwrap(body["beers"] as? [[String:String]])
                syncSizes.append(rows.count)
                synced.formUnion(rows.compactMap { $0["id"] })
                return (200,try JSONSerialization.data(withJSONObject:["synced":rows.count,"queued_for_cleanup":rows.count,"requestId":"fixture"]))
            }
            let ids = try XCTUnwrap(body["ids"] as? [String])
            batchSizes.append(ids.count)
            var rows: [String:Any] = [:]
            for id in ids where synced.contains(id) {
                rows[id] = ["enriched_abv":6.5,"enrichment_confidence":0.9,"enrichment_source":"manual","brew_description":"Clean","has_cleaned_description":true]
            }
            return (200,try JSONSerialization.data(withJSONObject:["enrichments":rows,"missing":ids.filter { !synced.contains($0) },"requestId":"fixture"]))
        }
        defer { fixture.handler = nil }
        let result = await service.enrich(beers + [beers[0]])
        XCTAssertEqual(batchSizes,[100,1,100,1])
        XCTAssertEqual(syncSizes,[50,50,1])
        XCTAssertEqual(result.map(\.id),(beers + [beers[0]]).map(\.id))
        XCTAssertTrue(result.allSatisfy { $0.abv == 6.5 && $0.brew_description == "Clean" })
        XCTAssertEqual(service.metrics.requests,7)
    }
    @MainActor func testBatchReservesRemainingBudgetBeforeConcurrentHealthRequest() async throws {
        let service = EnrichmentService(api:api(configuration:enrichmentConfiguration))
        var batches = 0
        fixture.handler = { request in
            if request.url!.path == "/health" { return (200,Data(#"{"status":"ok","database":"connected"}"#.utf8)) }
            batches += 1
            if batches == 1 {
                do { _ = try await service.health(); XCTFail("Both remaining slots belong to the batch") }
                catch { XCTAssertEqual((error as? HTTPFailure)?.status,429) }
            }
            return (200,Data(#"{"enrichments":{},"missing":[],"requestId":"fixture"}"#.utf8))
        }
        defer { fixture.handler = nil }
        for _ in 0..<8 { _ = try await service.health() }
        _ = await service.enrich((0..<101).map { Beer(id:String($0),name:"Beer") })
        XCTAssertEqual(batches,2)
        XCTAssertEqual(service.metrics.requests,10)
        XCTAssertEqual(service.metrics.rateLimited,1)
    }
    @MainActor func testInsufficientBatchBudgetSendsNothingAndRecoversAfterWindow() async throws {
        var time = Date(timeIntervalSince1970:1000)
        let service = EnrichmentService(api:api(configuration:enrichmentConfiguration),now:{ time })
        var batches = 0
        fixture.handler = { request in
            if request.url!.path == "/health" { return (200,Data(#"{"status":"ok","database":"connected"}"#.utf8)) }
            batches += 1
            return (200,Data(#"{"enrichments":{},"missing":[],"requestId":"fixture"}"#.utf8))
        }
        defer { fixture.handler = nil }
        for _ in 0..<9 { _ = try await service.health() }
        let beers = (0..<101).map { Beer(id:String($0),name:"Beer") }
        let unchanged = await service.enrich(beers)
        XCTAssertEqual(unchanged,beers)
        XCTAssertEqual(batches,0)
        service.resetMetrics()
        _ = await service.enrich(beers)
        XCTAssertEqual(batches,0,"Resetting diagnostics must not reset the rate limit")
        time = time.addingTimeInterval(60)
        _ = await service.enrich(beers)
        XCTAssertEqual(batches,2)
    }
    @MainActor func testSyncBudgetIsReservedBeforeAnySyncChunkIsSent() async throws {
        let service = EnrichmentService(api:api(configuration:enrichmentConfiguration))
        var syncCalls = 0
        fixture.handler = { request in
            if request.url!.path == "/health" { return (200,Data(#"{"status":"ok","database":"connected"}"#.utf8)) }
            if request.url!.path == "/beers/sync" { syncCalls += 1; throw URLError(.unsupportedURL) }
            let ids = try XCTUnwrap(self.enrichmentJSON(request)["ids"] as? [String])
            return (200,try JSONSerialization.data(withJSONObject:["enrichments":[:],"missing":ids,"requestId":"fixture"]))
        }
        defer { fixture.handler = nil }
        for _ in 0..<7 { _ = try await service.health() }
        let beers = (0..<101).map { Beer(id:String($0),name:"Beer") }
        let result = await service.enrich(beers)
        XCTAssertEqual(result,beers)
        XCTAssertEqual(syncCalls,0,"One remaining slot cannot fund three sync chunks")
        XCTAssertEqual(service.metrics.requests,9)
        XCTAssertEqual(service.metrics.rateLimited,1)
    }
    @MainActor func testNullableEnrichmentAndHealthContractValidation() async throws {
        let service = EnrichmentService(api:api(configuration:enrichmentConfiguration))
        fixture.handler = { request in
            if request.url!.path == "/health" { return (200,Data(#"{"status":"ok"}"#.utf8)) }
            return (200,Data(#"{"enrichments":{"1":{"enriched_abv":null,"enrichment_confidence":null,"enrichment_source":null,"brew_description":null,"has_cleaned_description":false}},"missing":[],"requestId":"fixture"}"#.utf8))
        }
        defer { fixture.handler = nil }
        let beer = Beer(id:"1",name:"Upstream")
        let result = await service.enrich([beer])
        XCTAssertEqual(result,[beer])
        XCTAssertEqual(service.metrics.successes,1)
        do { _ = try await service.health(); XCTFail("Health requires database status") } catch {}
        XCTAssertEqual(service.metrics.failures,1)
    }

    @MainActor func testMalformedBatchRowsPreserveUpstreamAndCountAsFailures() async throws {
        let bodies = [
            #"{"enrichments":{"1":{"enriched_abv":true,"enrichment_confidence":0.9,"enrichment_source":"manual","brew_description":"Wrong","has_cleaned_description":true}},"missing":[],"requestId":"fixture"}"#,
            #"{"enrichments":{"1":{"enriched_abv":8}},"missing":[],"requestId":"fixture"}"#,
            #"{"enrichments":{"1":{"enriched_abv":8,"enrichment_confidence":0.9,"enrichment_source":"unknown","brew_description":null,"has_cleaned_description":false}},"missing":[],"requestId":"fixture"}"#,
            #"{"enrichments":{},"missing":["1"]}"#
        ]
        for body in bodies {
            let service = EnrichmentService(api:api(configuration:enrichmentConfiguration))
            fixture.handler = { _ in (200,Data(body.utf8)) }
            var beer = Beer(id:"1",name:"Upstream")
            beer.abv = 5; beer.brew_description = "Original"
            let result = await service.enrich([beer])
            XCTAssertEqual(result,[beer])
            XCTAssertEqual(service.metrics.requests,1)
            XCTAssertEqual(service.metrics.failures,1)
            XCTAssertEqual(service.metrics.successes,0)
        }
        fixture.handler = nil
    }

    @MainActor func testPollingWaitsForCleanupAfterABVAndStopsWhenCleaned() async throws {
        var time = Date(timeIntervalSince1970:1000)
        var delays: [Double] = [], calls = 0, descriptions: [String?] = []
        let service = EnrichmentService(api:api(configuration:enrichmentConfiguration),now:{ time },sleep:{ delay in
            delays.append(delay); time = time.addingTimeInterval(delay)
        })
        fixture.handler = { request in
            XCTAssertEqual(request.url!.path,"/beers/batch")
            calls += 1
            let row: [String:Any] = ["enriched_abv":6.5,"enrichment_confidence":0.9,"enrichment_source":"manual","brew_description":calls == 1 ? NSNull() : "Clean","has_cleaned_description":calls > 1]
            return (200,try JSONSerialization.data(withJSONObject:["enrichments":["1":row],"missing":[],"requestId":"fixture"]))
        }
        defer { fixture.handler = nil }
        await service.poll(.init(ids:["1"],cleanupIDs:["1"]),isCurrent:{ true }) { updates in
            descriptions.append(updates["1"]?.applying(to:Beer(id:"1",name:"Beer")).brew_description)
        }
        XCTAssertEqual(delays,[5,10])
        XCTAssertEqual(calls,2)
        XCTAssertEqual(descriptions,["","Clean"])
    }
    @MainActor func testPollingIsBoundedAndHonorsSharedBudget() async throws {
        var time = Date(timeIntervalSince1970:1000)
        var delays: [Double] = [], batches = 0
        let service = EnrichmentService(api:api(configuration:enrichmentConfiguration),now:{ time },sleep:{ delay in
            delays.append(delay); time = time.addingTimeInterval(delay)
        })
        fixture.handler = { request in
            if request.url!.path == "/health" { return (200,Data(#"{"status":"ok","database":"connected"}"#.utf8)) }
            batches += 1
            XCTAssertGreaterThanOrEqual(time.timeIntervalSince1970,1060)
            return (200,Data(#"{"enrichments":{},"missing":["1"],"requestId":"fixture"}"#.utf8))
        }
        defer { fixture.handler = nil }
        for _ in 0..<10 { _ = try await service.health() }
        await service.poll(.init(ids:["1"]),isCurrent:{ true }) { _ in XCTFail("Missing results must not publish") }
        XCTAssertEqual(delays,[5,10,15,20,20,20,20])
        XCTAssertEqual(batches,3)
        XCTAssertEqual(time.timeIntervalSince1970,1110)
    }
    @MainActor func testPollingRejectsResponseAfterOwnershipChanges() async throws {
        let service = EnrichmentService(api:api(configuration:enrichmentConfiguration),sleep:{ _ in })
        var current = true
        fixture.handler = { _ in
            current = false
            return (200,Data(#"{"enrichments":{"1":{"enriched_abv":6,"enrichment_confidence":null,"enrichment_source":null,"brew_description":null,"has_cleaned_description":false}},"missing":[],"requestId":"fixture"}"#.utf8))
        }
        defer { fixture.handler = nil }
        await service.poll(.init(ids:["1"]),isCurrent:{ current }) { _ in XCTFail("Late response must not publish") }
        XCTAssertEqual(service.metrics.requests,1)
    }
    @MainActor private func withPausedCleanup(_ body: (AppModel,BeerDatabase,() -> Void,Task<Void,Never>) async throws -> Void) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let database = try BeerDatabase(url:folder.appendingPathComponent("beers.db"))
        let model = AppModel(api:api(configuration:enrichmentConfiguration),monitorConnectivity:false)
        model.db = database
        model.session = MemberSession(memberId:"1",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try database.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        try database.setPreference("my_beers_api_url","https://fsbs.beerknurd.com/bk-member-json.php?uid=1")
        let paused = expectation(description:"Cleanup waits after initial refresh")
        var continuation: CheckedContinuation<Void,Error>?
        model.enrichment = EnrichmentService(api:model.api,sleep:{ _ in
            try await withCheckedThrowingContinuation { continuation = $0; paused.fulfill() }
        })
        var batches = 0
        fixture.handler = { request in
            switch request.url!.path {
            case "/beers": return (200,Data(#"{"storeId":"1","beers":[{"id":"1","brew_name":"Tap beer"}]}"#.utf8))
            case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[{"id":"1","brew_name":"Tasted beer","tasted_date":"09/01/2026","review_rating":"4"}]},{"reward":[]}]"#.utf8))
            case "/beers/sync": return (200,Data(#"{"synced":1,"queued_for_cleanup":1,"requestId":"fixture"}"#.utf8))
            case "/beers/batch":
                batches += 1
                if batches <= 2 { return (200,Data(#"{"enrichments":{},"missing":["1"],"requestId":"fixture"}"#.utf8)) }
                return (200,Data(#"{"enrichments":{"1":{"enriched_abv":6.5,"enrichment_confidence":0.9,"enrichment_source":"manual","brew_description":"Clean","has_cleaned_description":true}},"missing":[],"requestId":"fixture"}"#.utf8))
            default: throw URLError(.unsupportedURL)
            }
        }
        defer { fixture.handler = nil; try? FileManager.default.removeItem(at:folder) }
        await model.refresh()
        XCTAssertFalse(model.refreshing,"Refresh must complete while polling is paused")
        XCTAssertEqual(model.tastedBeers.first?.brew_name,"Tasted beer")
        await fulfillment(of:[paused],timeout:2)
        let task = try XCTUnwrap(model.enrichmentTask)
        let resume = { continuation?.resume(); continuation = nil }
        do { try await body(model,database,resume,task) }
        catch { model.invalidatePreviewWork(); resume(); await task.value; throw error }
        model.invalidatePreviewWork(); resume(); await task.value
    }
    @MainActor func testDelayedCleanupUpdatesPublishedListsAndPreservesCurrentMetadata() async throws {
        try await withPausedCleanup { model,database,resume,task in
            let timestamp = try database.preference("last_my_beers_refresh")
            try database.execute("UPDATE tasted_brew_current_round SET review_rating='5',brew_name='Current name' WHERE id='1'")
            resume(); await task.value
            XCTAssertEqual(model.allBeers.first?.abv,6.5)
            XCTAssertEqual(model.tastedBeers.first?.brew_description,"Clean")
            XCTAssertEqual(model.tastedBeers.first?.brew_name,"Current name")
            XCTAssertEqual(model.tastedBeers.first?.review_rating,"5")
            XCTAssertEqual(try database.beers(tasted:true).first?.tasted_date,"09/01/2026")
            XCTAssertEqual(try database.preference("last_my_beers_refresh"),timestamp)
            XCTAssertNil(model.enrichmentTask)
        }
    }
    @MainActor func testDelayedCleanupCannotResurrectRemovedBeer() async throws {
        try await withPausedCleanup { model,database,resume,task in
            try database.execute("DELETE FROM allbeers WHERE id='1'")
            resume(); await task.value
            XCTAssertTrue(model.allBeers.isEmpty)
            XCTAssertTrue(try database.beers().isEmpty)
            XCTAssertEqual(model.tastedBeers.first?.abv,6.5)
        }
    }
    @MainActor func testDelayedCleanupStopsOnStoreChangeAndNewRefresh() async throws {
        try await withPausedCleanup { model,database,resume,task in
            model.session = MemberSession(memberId:"2",storeId:"2",storeName:"Other",sessionId:"other")
            resume(); await task.value
            XCTAssertNil(try database.beers().first?.abv)
            XCTAssertNil(try database.beers(tasted:true).first?.abv)
        }
        try await withPausedCleanup { model,_,resume,task in
            await model.refresh()
            XCTAssertTrue(task.isCancelled)
            resume(); await task.value
            XCTAssertEqual(model.tastedBeers.first?.abv,6.5)
        }
    }

    @MainActor func testCancelledRefreshCallerStillUpdatesCache() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder); fixture.handler = nil }
        let model = AppModel(api:api(),monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db")); model.db = db
        model.session = MemberSession(memberId:"fixture",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        var calls = 0
        fixture.handler = { _ in
            calls += 1
            return (200,Data(#"[{"id":"fresh","brew_name":"Fresh beer"}]"#.utf8))
        }
        let caller = Task { await model.refresh() }
        caller.cancel()
        await caller.value
        XCTAssertEqual(calls,1)
        XCTAssertEqual(model.allBeers.map(\.id),["fresh"])
        XCTAssertEqual(try db.beers().map(\.id),["fresh"])
        XCTAssertNil(model.error)
        XCTAssertFalse(model.refreshing)
    }

    @MainActor func testCancelledProxyDoesNotFallbackOrShowErrorsAndCanRefreshAgain() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder); fixture.handler = nil }
        var configuration = APIConfiguration()
        configuration.enrichmentURL = URL(string:"https://enrichment.example.test")
        configuration.enrichmentKey = "fixture"
        let model = AppModel(api:api(configuration:configuration),monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db")); model.db = db
        model.session = MemberSession(memberId:"fixture",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        try db.setPreference("my_beers_api_url","https://fsbs.beerknurd.com/bk-member-json.php?uid=1")
        try db.replaceBeers([try Beer(row:["id":"saved","brew_name":"Saved beer"])])
        try db.setPreference("last_all_beers_refresh","123")
        try model.reload()
        var paths: [String] = []
        fixture.handler = { request in
            paths.append(request.url!.path)
            throw URLError(.cancelled)
        }
        await model.refresh()
        XCTAssertEqual(paths,["/beers"])
        XCTAssertEqual(model.enrichment.metrics.fallbacks,0)
        XCTAssertEqual(model.allBeers.map(\.id),["saved"])
        XCTAssertEqual(try db.preference("last_all_beers_refresh"),"123")
        XCTAssertNil(model.error)
        XCTAssertFalse(model.refreshing)
        fixture.handler = { request in
            if request.url!.path == "/beers" {
                return (200,Data(#"{"storeId":"1","beers":[{"id":"fresh","brew_name":"Fresh beer"}]}"#.utf8))
            }
            return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
        }
        await model.refresh()
        XCTAssertEqual(model.allBeers.map(\.id),["fresh"])
        XCTAssertNil(model.error)
        XCTAssertFalse(model.refreshing)
    }

    @MainActor private func assertForeignOperationIsNotSubmitted(memberID: String, storeID: String) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder); fixture.handler = nil }
        let model = AppModel(api:api(),monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db"))
        model.db = db
        model.session = MemberSession(memberId:"current",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try db.enqueue(type:"CHECK_IN_BEER",payload:["beerId":"beer","beerName":"Saved beer","memberId":memberID,"storeId":storeID])
        var submissions = 0
        fixture.handler = { request in
            if request.url!.path == "/addToQueue.php" { submissions += 1 }
            return (200,Data("<html></html>".utf8))
        }
        await model.processOperations()
        XCTAssertEqual(submissions,0,"An account/store mismatch must not submit a live operation")
        XCTAssertEqual(try db.operations().count,1,"Keep the foreign operation available for review")
        XCTAssertEqual(try db.operations().first?.status,"pending")
    }

    @MainActor func testPreviousMembersPendingCheckInIsNotReplayed() async throws {
        try await assertForeignOperationIsNotSubmitted(memberID:"previous",storeID:"1")
    }

    @MainActor func testPreviousStoresPendingCheckInIsNotReplayed() async throws {
        try await assertForeignOperationIsNotSubmitted(memberID:"current",storeID:"2")
    }

    @MainActor func testMalformedTaplistPreservesCacheWhileValidMemberDataRefreshes() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder); fixture.handler = nil }
        let model = AppModel(api:api(),monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db")); model.db = db
        model.session = MemberSession(memberId:"fixture",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        try db.setPreference("my_beers_api_url","https://fsbs.beerknurd.com/bk-member-json.php?uid=1")
        try db.setPreference("last_all_beers_refresh","123")
        try db.replaceBeers([Beer(id:"cached",name:"Saved taplist")])
        fixture.handler = { request in
            if request.url!.path == "/bk-store-json.php" { return (200,Data(#"[{},{"brewInStock":[]}]"#.utf8)) }
            return (200,Data(#"[{},{"tasted_brew_current_round":[{"id":"fresh","brew_name":"New tasting"}]},{"reward":[]}]"#.utf8))
        }
        await model.refresh()
        XCTAssertEqual(try db.beers().map(\.id),["cached"])
        XCTAssertEqual(try db.preference("last_all_beers_refresh"),"123")
        XCTAssertEqual(model.tastedBeers.map(\.id),["fresh"])
        XCTAssertNotNil(model.error)
    }

    @MainActor func testMalformedRewardsDoNotPreventAuthoritativeEmptyTastings() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder); fixture.handler = nil }
        let model = AppModel(api:api(),monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db")); model.db = db
        model.session = MemberSession(memberId:"fixture",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        try db.setPreference("my_beers_api_url","https://fsbs.beerknurd.com/bk-member-json.php?uid=1")
        try db.replaceBeers([Beer(id:"old",name:"Old round")],tasted:true)
        let reward = Reward(id:"saved",type:"Saved reward",redeemed:false)
        try db.replaceRewards([reward])
        fixture.handler = { request in
            if request.url!.path == "/bk-store-json.php" { return (200,Data(#"[{"id":"1","brew_name":"Taplist"}]"#.utf8)) }
            return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":"broken"}]"#.utf8))
        }
        await model.refresh()
        XCTAssertTrue(try db.beers(tasted:true).isEmpty)
        XCTAssertTrue(model.tastedBeers.isEmpty)
        XCTAssertEqual(model.rewards,[reward])
        XCTAssertNotNil(model.error)
    }

    @MainActor func testMalformedEnrichmentIsAFailureNotASuccess() async throws {
        var configuration = APIConfiguration()
        configuration.enrichmentURL = URL(string:"https://enrichment.example.test")
        configuration.enrichmentKey = "fixture"
        let service = EnrichmentService(api:api(configuration:configuration))
        fixture.handler = { _ in (200,Data(#"{"storeId":"1","beers":"broken"}"#.utf8)) }
        defer { fixture.handler = nil }
        do { _ = try await service.taplist(storeID:"1",etag:nil); XCTFail("Expected invalid payload rejection") }
        catch {}
        XCTAssertEqual(service.metrics.requests,1)
        XCTAssertEqual(service.metrics.successes,0)
        XCTAssertEqual(service.metrics.failures,1)
    }

    @MainActor func testCancelledEnrichmentDoesNotCountAsFailure() async throws {
        var configuration = APIConfiguration()
        configuration.enrichmentURL = URL(string:"https://enrichment.example.test")
        configuration.enrichmentKey = "fixture"
        let service = EnrichmentService(api:api(configuration:configuration))
        fixture.handler = { _ in throw URLError(.cancelled) }
        defer { fixture.handler = nil }
        do { _ = try await service.taplist(storeID:"1",etag:nil); XCTFail("Expected cancellation") }
        catch { XCTAssertEqual((error as? URLError)?.code,.cancelled) }
        XCTAssertEqual(service.metrics.successes,0)
        XCTAssertEqual(service.metrics.failures,0)
        XCTAssertEqual(service.metrics.cancellations,1)
    }

    @MainActor func testCacheHitRequiresValidatorAndValidatedResponse() async throws {
        var configuration = APIConfiguration()
        configuration.enrichmentURL = URL(string:"https://enrichment.example.test")
        configuration.enrichmentKey = "fixture"
        let service = EnrichmentService(api:api(configuration:configuration))
        fixture.handler = { _ in (304, Data()) }
        defer { fixture.handler = nil }
        do { _ = try await service.taplist(storeID:"1",etag:nil); XCTFail("Missing validator") } catch {}
        let result = try await service.taplist(storeID:"1",etag:"fixture-tag")
        XCTAssertNil(result.beers)
        XCTAssertEqual(result.etag,"fixture-tag")
        XCTAssertEqual(service.metrics.requests,2)
        XCTAssertEqual(service.metrics.successes,1)
        XCTAssertEqual(service.metrics.failures,1)
        XCTAssertEqual(service.metrics.cacheHits,1)
    }

    @MainActor func testServerRateLimitBlocksNextAttemptWithoutAnotherRequest() async throws {
        var configuration = APIConfiguration()
        configuration.enrichmentURL = URL(string:"https://enrichment.example.test")
        configuration.enrichmentKey = "fixture"
        let service = EnrichmentService(api:api(configuration:configuration))
        var calls = 0
        fixture.handler = { _ in calls += 1; return (429,Data()) }
        defer { fixture.handler = nil }
        for _ in 0..<2 {
            do { _ = try await service.health(); XCTFail("Expected rate limit") }
            catch { XCTAssertEqual((error as? HTTPFailure)?.status,429) }
        }
        XCTAssertEqual(calls,1)
        XCTAssertEqual(service.metrics.requests,1)
        XCTAssertEqual(service.metrics.failures,1)
        XCTAssertEqual(service.metrics.rateLimited,2)
    }

    func testMetricsDelegateRetainsRedirectOriginProtection() {
        let session = URLSession(configuration:.ephemeral)
        defer { session.invalidateAndCancel() }
        let task = session.dataTask(with:URL(string:"https://origin.example.test/start")!)
        let response = HTTPURLResponse(url:task.originalRequest!.url!,statusCode:302,httpVersion:nil,headerFields:nil)!
        let policy = RedirectPolicy()
        for (url, allowed) in [("https://origin.example.test/next",true),
                               ("https://other.example.test/next",false),
                               ("http://origin.example.test/next",false),
                               ("https://origin.example.test:444/next",false)] {
            var called = false
            policy.urlSession(session,task:task,willPerformHTTPRedirection:response,newRequest:URLRequest(url:URL(string:url)!)) { request in
                called = true
                XCTAssertEqual(request != nil,allowed)
            }
            XCTAssertTrue(called)
        }
    }

    @MainActor func testBusyRefreshPreservesSnapshotAndCanRetryAfterUnlock() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder); fixture.handler = nil }
        let model = AppModel(api:api(),monitorConnectivity:false)
        let url = folder.appendingPathComponent("beers.db")
        let db = try BeerDatabase(url:url)
        let writer = try BeerDatabase(url:url)
        model.db = db
        model.session = MemberSession(memberId:"visitor",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        try db.setPreference("last_all_beers_refresh","123")
        try db.transaction { try db.replaceBeers([Beer(id:"saved",name:"Saved")]) }
        try model.reload()
        XCTAssertEqual(try db.rows("PRAGMA busy_timeout").first?["timeout"],"0")
        fixture.handler = { _ in (200,Data(#"[{"id":"fresh","brew_name":"Fresh"}]"#.utf8)) }
        try writer.execute("BEGIN IMMEDIATE")
        defer { try? writer.execute("ROLLBACK") }
        await model.refresh()
        XCTAssertEqual(model.allBeers.map(\.id),["saved"])
        XCTAssertEqual(try db.beers().map(\.id),["saved"])
        XCTAssertEqual(try db.preference("last_all_beers_refresh"),"123")
        XCTAssertNotNil(model.error)
        XCTAssertFalse(model.refreshing)
        try writer.execute("ROLLBACK")
        await model.refresh()
        XCTAssertEqual(model.allBeers.map(\.id),["fresh"])
        XCTAssertNil(model.error)
    }

    @MainActor private func exercisePostSync(syncBody: String, followupMissing: Bool = false) async throws -> ([Beer], [String]) {
        var configuration = APIConfiguration()
        configuration.enrichmentURL = URL(string:"https://enrichment.example.test")
        configuration.enrichmentKey = "fixture"
        let service = EnrichmentService(api:api(configuration:configuration))
        var paths: [String] = []
        var batches = 0
        fixture.handler = { request in
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
        defer { fixture.handler = nil }
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
        fixture.handler = { _ in calls += 1; throw URLError(.networkConnectionLost) }
        defer { fixture.handler = nil }
        let api = api()
        do {
            _ = try await api.request(api.configuration.endpoint("addToQueue.php"),method:"POST",fields:[:])
            XCTFail("Expected the network error")
        } catch { XCTAssertEqual((error as? URLError)?.code,.networkConnectionLost) }
        XCTAssertEqual(calls,1)
    }

    @MainActor func testMemberCookiesCannotBeSentToDataOrigin() async throws {
        var calls = 0
        fixture.handler = { _ in calls += 1; return (200,Data()) }
        defer { fixture.handler = nil }
        let member = MemberSession(memberId:"fixture",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        do {
            _ = try await api().request(URL(string:"https://fsbs.beerknurd.com/bk-store-json.php?sid=1")!,member:member)
            XCTFail("Expected origin rejection")
        } catch { XCTAssertEqual(calls,0) }
    }

    @MainActor func testFailedCheckInRemainsPendingAndSuccessfulRetryRemovesIt() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder); fixture.handler = nil }
        let model = AppModel(api:api(),monitorConnectivity:false)
        model.db = try BeerDatabase(url:folder.appendingPathComponent("beers.db"))
        model.session = MemberSession(memberId:"fixture",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try model.db!.enqueue(type:"CHECK_IN_BEER",payload:["beerId":"1","beerName":"Beer","memberId":"fixture","storeId":"1"])
        var fail = true
        fixture.handler = { request in
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
        defer { try? FileManager.default.removeItem(at:folder); try? credentials.clear(); fixture.handler = nil }
        var configuration = APIConfiguration()
        configuration.enrichmentURL = URL(string:"https://enrichment.example.test")
        configuration.enrichmentKey = "fixture"
        let model = AppModel(api:api(configuration:configuration),credentials:credentials,monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db")); model.db = db
        model.session = MemberSession(memberId:"fixture",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        try db.setPreference("my_beers_api_url","https://fsbs.beerknurd.com/bk-member-json.php?uid=1")
        try db.replaceRewards([Reward(id:"saved",type:"Saved reward",redeemed:false)])
        fixture.handler = { request in
            switch request.url!.path {
            case "/beers":
                return (200,Data(#"{"storeId":"1","beers":[{"id":"1","brew_name":"Beer"}]}"#.utf8))
            case "/bk-member-json.php":
                return (200,Data(#"[{},{"tasted_brew_current_round":[{"id":"tasted","brew_name":"Old tasting"}]},{"reward":[{"reward_id":"stale","reward_type":"Stale reward"}]}]"#.utf8))
            case "/beers/batch":
                await model.logout()
                return (200,Data(#"{"enrichments":{},"missing":[],"requestId":"fixture"}"#.utf8))
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
