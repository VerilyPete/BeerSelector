import XCTest
@testable import BeerSelectorNative

final class RecommendationIntegrationTests: XCTestCase {
    @MainActor private func withModel(_ body: (AppModel,BeerDatabase,HTTPFixture) async throws -> Void) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let key = UUID().uuidString
        let credentials = CredentialStore(prefix:key,sessionStorageKey:key)
        let fixture = HTTPFixture()
        let model = AppModel(api:fixture.api(configuration:APIConfiguration()),credentials:credentials,monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db"))
        model.db = db
        model.session = MemberSession(memberId:"1",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try credentials.save(session:model.session!,cookies:[:])
        model.activityUpdate = { _,_ in }; model.activityCleanup = {}; model.webCookieCleanup = {}
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        try db.setPreference("my_beers_api_url","https://fsbs.beerknurd.com/bk-member-json.php?uid=1")
        fixture.handler = { request in
            switch request.url!.path {
            case "/bk-store-json.php": return (200,Data(#"[{"id":"new","brew_name":"New beer","brew_style":"IPA"}]"#.utf8))
            case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
            case "/memberQueues.php": return (200,Data("No brew in queue".utf8))
            default: return (200,Data())
            }
        }
        defer { fixture.handler = nil; try? credentials.clear(); try? FileManager.default.removeItem(at:folder) }
        try await body(model,db,fixture)
    }
    @MainActor func testFirstRefreshArchivesPreviousRoundBeforeEmptyReplacement() async throws {
        try await withModel { model,db,_ in
            var old = Beer(id:"old",name:"Old beer"); old.roh_lap = "7"; old.tasted_date = "09/12/2026"
            try db.replaceBeers([old],tasted:true)
            await model.refresh()
            XCTAssertTrue(try db.beers(tasted:true).isEmpty)
            XCTAssertEqual(try db.recentTastings(account:"tapthatapp.beerknurd.com:1:1").map(\.id),["old"])
            await model.logout()
            XCTAssertTrue(try db.recentTastings(account:"tapthatapp.beerknurd.com:1:1").isEmpty)
        }
    }
    @MainActor func testQueueAcceptanceDoesNotEnterTastingHistory() async throws {
        try await withModel { model,db,_ in
            let result = await model.checkIn(Beer(id:"new",name:"New beer"))
            XCTAssertEqual(result,.added)
            let choice = try XCTUnwrap(db.choiceContexts(account:model.recommendationAccount!).first)
            XCTAssertEqual(choice.selected,["new"])
            XCTAssertEqual(choice.queued,["new"])
            XCTAssertTrue(choice.laterTasted.isEmpty)
            XCTAssertEqual(choice.taplist.first?.id,"new")
            XCTAssertTrue(try db.recentTastings(account:"tapthatapp.beerknurd.com:1:1").isEmpty)
        }
    }
    @MainActor func testOfflineChoiceBecomesAcknowledgedOnlyAfterDelivery() async throws {
        try await withModel { model,db,_ in
            model.offline = true
            let result = await model.checkIn(Beer(id:"new",name:"New beer"))
            XCTAssertEqual(result,.savedForRetry)
            let account = try XCTUnwrap(model.recommendationAccount)
            XCTAssertEqual(try db.choiceContexts(account:account).first?.selected,["new"])
            XCTAssertEqual(try db.choiceContexts(account:account).first?.queued,[])
            model.offline = false
            await model.processOperations()
            XCTAssertEqual(try db.choiceContexts(account:account).first?.queued,["new"])
            XCTAssertEqual(try db.choiceContexts(account:account).first?.laterTasted,[])
        }
    }
    @MainActor func testSuggestionPresentationAndSubmissionShareOneContext() async throws {
        try await withModel { model,db,_ in
            let controller = RecommendationController(model:model,provider:FakeProvider())
            await controller.generate()
            let account = try XCTUnwrap(model.recommendationAccount)
            let original = try XCTUnwrap(db.choiceContexts(account:account).first)
            XCTAssertEqual(original.shown,["new"])
            controller.recordSelection(id:"new",selected:true)
            controller.recordSelection(id:"new",selected:false)
            XCTAssertEqual(try db.choiceContexts(account:account).first?.selected,[])
            await controller.submit(ids:["new"])
            let contexts = try db.choiceContexts(account:account)
            XCTAssertEqual(contexts.count,1)
            XCTAssertEqual(contexts.first?.taplist,original.taplist)
            XCTAssertEqual(contexts.first?.queued,["new"])
        }
    }
    @MainActor func testOfflineRecommendationsNeverCallProvider() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider()
            let controller = RecommendationController(model:model,provider:fake)
            model.offline = true
            await controller.generate()
            XCTAssertEqual(fake.calls,0); XCTAssertTrue(controller.suggestions.isEmpty)
            XCTAssertNotNil(controller.message)
        }
    }
    @MainActor func testFallbackRecommendationsRevalidateBeforeAnyQueueWrite() async throws {
        try await withModel { model,_,fixture in
            let controller = RecommendationController(model:model,provider:FakeProvider())
            await controller.generate()
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
            var writes = 0
            fixture.handler = { request in
                if request.url!.path == "/addToQueue.php" { writes += 1 }
                if request.url!.path == "/bk-store-json.php" { return (200,Data(#"[{"id":"different","brew_name":"Different beer"}]"#.utf8)) }
                if request.url!.path == "/bk-member-json.php" { return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8)) }
                return (200,Data("No brew in queue".utf8))
            }
            await controller.submit(ids:["new"])
            XCTAssertEqual(writes,0); XCTAssertEqual(controller.outcomes["new"],.unavailable)
        }
    }
    @MainActor func testAnotherSelectionKeepsLowerAndHigherBandsSubmittable() async throws {
        for preference in [SuggestionABV.lower,.higher] {
            try await withModel { model,db,fixture in
                let beers = (1...8).map { value -> Beer in
                    var beer = Beer(id:String(value),name:"Beer \(value)"); beer.abv = Double(value); return beer
                }
                try db.replaceBeers(beers)
                let data = try JSONSerialization.data(withJSONObject:beers.map { ["id":$0.id,"brew_name":$0.brew_name,"abv":String($0.abv!)] })
                var writes = 0
                fixture.handler = { request in
                    switch request.url!.path {
                    case "/bk-store-json.php": return (200,data)
                    case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
                    case "/addToQueue.php": writes += 1; return (200,Data())
                    default: return (200,Data("No brew in queue".utf8))
                    }
                }
                let provider = FakeProvider()
                let controller = RecommendationController(model:model,provider:provider)
                controller.setPreferences(.init(abv:preference))
                await controller.generate()
                let firstIDs = controller.suggestions.map(\.id)
                provider.action = { firstIDs }
                await controller.generate()
                XCTAssertFalse(controller.usedModel,"A model repeating the entire previous selection must fail closed to the refreshed shortlist")
                let expected = Set(preference == .lower ? ["1","2","3","4"] : ["5","6","7","8"])
                XCTAssertEqual(controller.suggestions.count,3)
                XCTAssertTrue(controller.suggestions.contains { $0.id == (preference == .lower ? "4" : "5") },"Another selection must preserve the remaining unseen eligible beer")
                XCTAssertTrue(Set(controller.suggestions.map(\.id)).isSubset(of:expected))
                let ids = Set(controller.suggestions.map(\.id))
                await controller.submit(ids:ids)
                XCTAssertEqual(writes,3)
                for id in ids { XCTAssertEqual(controller.outcomes[id],.added) }
            }
        }
    }
    @MainActor func testPreferenceChangeRejectsOldGenerationAndClearsActionableCards() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider()
            let controller = RecommendationController(model:model,provider:fake)
            fake.action = {
                controller.setPreferences(.init(container:.bottle,abv:.lower))
                return ["new"]
            }
            await controller.generate()
            XCTAssertTrue(controller.suggestions.isEmpty)
            XCTAssertFalse(controller.generating)
            XCTAssertEqual(controller.preferences.container,.bottle)
        }
    }
    @MainActor func testLateProviderCannotPublishAfterAccountChange() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider()
            fake.action = {
                model.session = MemberSession(memberId:"other",storeId:"2",storeName:"Other",sessionId:"other")
                return ["new"]
            }
            let controller = RecommendationController(model:model,provider:fake)
            await controller.generate()
            XCTAssertTrue(controller.suggestions.isEmpty)
        }
    }
    @MainActor func testAmbiguousRecommendationWriteRequiresReviewInsteadOfAutomaticRetry() async throws {
        try await withModel { model,db,fixture in
            try db.replaceBeers([Beer(id:"new",name:"New beer")]); try model.reload()
            fixture.handler = { request in
                if request.url!.path == "/addToQueue.php" { throw URLError(.timedOut) }
                return (200,Data("No brew in queue".utf8))
            }
            let result = await model.checkIn(Beer(id:"new",name:"New beer"),recommendation:true)
            XCTAssertEqual(result,.needsReview)
            XCTAssertEqual(try db.operations().first?.status,"failed")
            XCTAssertTrue(try db.recentTastings(account:model.recommendationAccount!).isEmpty)
        }
    }

    @MainActor func testBatchPartialSuccessDoesNotRetryTheFirstBeerOrClaimTheSecondSucceeded() async throws {
        try await withModel { model,db,fixture in
            var writes: [String] = []
            fixture.handler = { request in
                switch request.url!.path {
                case "/bk-store-json.php": return (200,Data(#"[{"id":"a","brew_name":"First"},{"id":"b","brew_name":"Second"},{"id":"c","brew_name":"Third"}]"#.utf8))
                case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
                case "/addToQueue.php":
                    writes.append(request.httpBody.map { String(decoding:$0,as:UTF8.self) } ?? "write")
                    if writes.count == 2 { return (200,Data("<html>Sign in</html>".utf8)) }
                    return (200,Data())
                default: return (200,Data("No brew in queue".utf8))
                }
            }
            let controller = RecommendationController(model:model,provider:FakeProvider())
            await controller.generate()
            XCTAssertEqual(controller.suggestions.count,3)
            await controller.submit(ids:["a","b"])
            XCTAssertEqual(writes.count,2)
            XCTAssertEqual(controller.outcomes["a"],.added)
            XCTAssertEqual(controller.outcomes["b"],.needsReview)
            XCTAssertEqual(try db.operations().map(\.status),["failed"])
            await controller.submit(ids:["a","b"])
            await model.processOperations()
            XCTAssertEqual(writes.count,2,"An ambiguous batch result must require explicit review")
        }
    }
    @MainActor func testAccountChangeDuringBatchStopsRemainingWritesAndResults() async throws {
        try await withModel { model,_,fixture in
            var writes = 0
            fixture.handler = { request in
                switch request.url!.path {
                case "/bk-store-json.php": return (200,Data(#"[{"id":"a","brew_name":"First"},{"id":"b","brew_name":"Second"},{"id":"c","brew_name":"Third"}]"#.utf8))
                case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
                case "/addToQueue.php":
                    writes += 1
                    await model.logout()
                    return (200,Data())
                default: return (200,Data("No brew in queue".utf8))
                }
            }
            let controller = model.recommendations
            controller.provider = FakeProvider()
            await controller.generate()
            await controller.submit(ids:["a","b"])
            XCTAssertEqual(writes,1)
            XCTAssertTrue(controller.suggestions.isEmpty)
            XCTAssertTrue(controller.outcomes.isEmpty)
        }
    }
    @MainActor func testFailedFreshnessCheckCannotUsePreviouslyValidatedData() async throws {
        try await withModel { model,_,fixture in
            let controller = RecommendationController(model:model,provider:FakeProvider())
            await controller.generate()
            XCTAssertFalse(controller.suggestions.isEmpty)
            fixture.handler = { _ in throw URLError(.notConnectedToInternet) }
            await controller.submit(ids:["new"])
            XCTAssertTrue(controller.outcomes.isEmpty)
            XCTAssertNotNil(controller.message)
        }
    }

    @MainActor func testRefreshAfterSubmissionKeepsPerBeerReceipts() async throws {
        try await withModel { model,_,_ in
            let controller = RecommendationController(model:model,provider:FakeProvider())
            await controller.generate()
            await controller.submit(ids:["new"])
            XCTAssertEqual(controller.outcomes["new"],.added)
            model.allBeers.append(Beer(id:"later",name:"Later arrival"))
            controller.invalidateIfChanged()
            XCTAssertEqual(controller.outcomes["new"],.added,"Keep the receipt visible while the user reviews the batch")
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
        }
    }
    @MainActor func testDeadlineReturnsWithoutWaitingForUncooperativeProvider() async throws {
        var release: CheckedContinuation<[String],Never>?
        let result = await RecommendationDeadline.run(seconds:0.01) {
            await withCheckedContinuation { release = $0 }
        }
        XCTAssertNil(result)
        release?.resume(returning:["late"])
        let success = await RecommendationDeadline.run(seconds:1) { ["valid"] }
        XCTAssertEqual(success,["valid"])
    }
}
@MainActor private final class FakeProvider: RecommendationProvider {
    var calls = 0
    var action: (() async throws -> [String])?
    func rank(history: [Beer], candidates: [BeerSuggestion]) async throws -> [String] {
        calls += 1
        if let action { return try await action() }
        throw RecommendationUnavailable.model
    }
}

