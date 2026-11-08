import XCTest
import FoundationModels
@testable import BeerSelectorNative

final class RecommendationIntegrationTests: XCTestCase {
    @MainActor private func withModel(_ body: @MainActor (AppModel,BeerDatabase,HTTPFixture) async throws -> Void) async throws {
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
        model.suggestionCompatibility = { .appleIntelligence }; model.suggestionsEnabled = { true }
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
    @MainActor func testSemanticRetrieverFeedsFreshEvidenceToRankingAndFailureUsesLocalOrder() async throws {
        try await withModel { model,_,fixture in
            let rows = (0..<14).map { ["id":String(format:"%02d",$0),"brew_name":"Beer \($0)","brew_style":"IPA"] }
                + [["id":"zz","brew_name":"Last beer","brew_style":"IPA","brew_description":"Fresh authoritative description"]]
            let data = try JSONSerialization.data(withJSONObject:rows)
            fixture.handler = { request in
                if request.url!.path == "/bk-store-json.php" { return (200,data) }
                if request.url!.path == "/bk-member-json.php" { return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8)) }
                return (200,Data("No brew in queue".utf8))
            }
            let provider = FakeProvider()
            provider.action = { ["zz","00","01"] }
            let semantic = FakeSemanticRetriever(); semantic.action = { _ in ["zz","forbidden","zz"] }
            let controller = RecommendationController(model:model,provider:provider)
            controller.semanticRetriever = semantic
            controller.setPreferences(.init(request:"coffee"))
            await controller.generate()
            XCTAssertTrue(controller.usedModel)
            XCTAssertEqual(controller.suggestions.first?.id,"zz")
            XCTAssertEqual(provider.candidateEvidence["zz"],"Fresh authoritative description")
            XCTAssertFalse(provider.candidateIDs.contains("forbidden"))
            XCTAssertEqual(controller.retrievalSource,.mixed)
            provider.action = { throw RecommendationUnavailable.model }
            controller.cancel()
            await controller.generate()
            XCTAssertTrue(provider.candidateIDs.contains("zz"))
            XCTAssertEqual(controller.suggestions.map(\.id),["00","01","02"])
            XCTAssertFalse(controller.usedModel)
            XCTAssertEqual(controller.retrievalSource,.local)
        }
    }
    @MainActor func testChangesDuringRetrievalPreventRankingIncludingChoiceContextChanges() async throws {
        for mutation in ["account","feedback","history","taplist","choices","preferences"] {
            try await withModel { model,db,_ in
                let provider = FakeProvider(), semantic = FakeSemanticRetriever()
                let controller = RecommendationController(model:model,provider:provider)
                controller.semanticRetriever = semantic
                controller.setPreferences(.init(request:"coffee"))
                semantic.action = { _ in
                    switch mutation {
                    case "account": model.session = MemberSession(memberId:"other",storeId:"2",storeName:"Other",sessionId:"other")
                    case "feedback": model.beerFeedback.append(BeerFeedback(beer:Beer(id:"new",name:"New beer"),rating:.notForMe))
                    case "history": model.recentTastings.append(Beer(id:"tasted",name:"Tasted"))
                    case "taplist": model.allBeers.append(Beer(id:"later",name:"Later"))
                    case "choices":
                        let account = try XCTUnwrap(model.recommendationAccount)
                        try db.saveChoicePresentation(BeerChoiceContext(taplist:model.allBeers,shown:["new"],preferences:.init(),usedModel:false,taplistValidation:nil),account:account)
                    default: controller.setPreferences(.init(request:"stout"))
                    }
                    return ["new"]
                }
                await controller.generate()
                XCTAssertEqual(provider.calls,0,mutation)
                XCTAssertTrue(controller.suggestions.isEmpty,mutation)
            }
        }
    }
    @MainActor func testRetrievalTimeoutUsesLocalAIAndLateCompletionCannotReplaceIt() async throws {
        try await withModel { model,_,_ in
            let provider = FakeProvider(), semantic = FakeSemanticRetriever()
            provider.action = { ["new"] }
            var release: CheckedContinuation<[String]?,Never>?
            semantic.action = { _ in await withCheckedContinuation { release = $0 } }
            let controller = RecommendationController(model:model,provider:provider)
            controller.semanticRetriever = semantic; controller.retrievalTimeout = 0.01
            controller.setPreferences(.init(request:"coffee"))
            await controller.generate()
            XCTAssertTrue(controller.usedModel)
            XCTAssertEqual(controller.retrievalSource,.local)
            XCTAssertEqual(provider.calls,1)
            release?.resume(returning:["forbidden"])
            for _ in 0..<5 { await Task.yield() }
            XCTAssertEqual(provider.calls,1)
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
        }
    }
    @MainActor func testRetrievalAndRankingShareOneDeadline() async throws {
        try await withModel { model,_,_ in
            let provider = FakeProvider(), semantic = FakeSemanticRetriever()
            semantic.action = { _ in try await Task.sleep(for:.milliseconds(30)); return ["new"] }
            provider.action = { try await Task.sleep(for:.milliseconds(30)); return ["new"] }
            let controller = RecommendationController(model:model,provider:provider)
            controller.semanticRetriever = semantic; controller.timeout = 0.04; controller.retrievalTimeout = 0.035
            controller.setPreferences(.init(request:"coffee"))
            await controller.generate()
            XCTAssertFalse(controller.usedModel,"Ranking cannot start a fresh timeout after retrieval")
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
        }
    }
    @MainActor func testRetrievalInvalidationPreventsRankingAndPublication() async throws {
        for phase in ["retrieval", "ranking"] {
            try await withModel { model,_,_ in
                let provider = FakeProvider(), semantic = FakeSemanticRetriever()
                semantic.validityToken = UUID()
                var release: CheckedContinuation<Void,Never>?
                semantic.action = { _ in
                    if phase == "retrieval" { await withCheckedContinuation { release = $0 } }
                    return ["new"]
                }
                provider.action = {
                    if phase == "ranking" { await withCheckedContinuation { release = $0 } }
                    return ["new"]
                }
                let controller = RecommendationController(model:model,provider:provider)
                controller.semanticRetriever = semantic
                controller.setPreferences(.init(request:"coffee"))
                let work = Task { await controller.generate() }
                while release == nil { await Task.yield() }
                semantic.validityToken = UUID()
                release?.resume()
                await work.value
                XCTAssertEqual(provider.calls,phase == "retrieval" ? 0 : 1,phase)
                XCTAssertTrue(controller.suggestions.isEmpty,phase)
                XCTAssertFalse(controller.usedModel,phase)
            }
        }
    }
    @MainActor func testSemanticContextOverflowRetriesLocalCandidatesWithAI() async throws {
        try await withModel { model,_,_ in
            let provider = FakeProvider(), semantic = FakeSemanticRetriever()
            semantic.action = { _ in ["new"] }
            provider.action = {
                if provider.calls == 1 {
                    XCTAssertNotNil(provider.candidateEvidence["new"])
                    throw RecommendationUnavailable.contextBudget
                }
                XCTAssertTrue(provider.candidateEvidence.isEmpty)
                return ["new"]
            }
            let controller = RecommendationController(model:model,provider:provider)
            controller.semanticRetriever = semantic
            controller.setPreferences(.init(request:"coffee"))
            await controller.generate()
            XCTAssertEqual(provider.calls,2)
            XCTAssertTrue(controller.usedModel)
            XCTAssertEqual(controller.retrievalSource,.local)
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
        }
    }
    @MainActor func testContextOverflowRetryDoesNotResetGlobalDeadline() async throws {
        try await withModel { model,_,_ in
            let provider = FakeProvider(), semantic = FakeSemanticRetriever()
            semantic.action = { _ in ["new"] }
            provider.action = {
                try await Task.sleep(for:.milliseconds(60))
                if provider.calls == 1 { throw RecommendationUnavailable.contextBudget }
                return ["new"]
            }
            let controller = RecommendationController(model:model,provider:provider)
            controller.semanticRetriever = semantic; controller.timeout = 0.1
            controller.setPreferences(.init(request:"coffee"))
            await controller.generate()
            XCTAssertEqual(provider.calls,2)
            XCTAssertFalse(controller.usedModel)
            XCTAssertEqual(controller.retrievalSource,.local)
        }
    }

    @MainActor func testExactStyleAndPreviewDoNotInvokeSemanticRetriever() async throws {
        try await withModel { model,_,_ in
            let provider = FakeProvider(), semantic = FakeSemanticRetriever()
            let controller = RecommendationController(model:model,provider:provider)
            controller.semanticRetriever = semantic
            controller.setPreferences(.init(request:"IPA"))
            await controller.generate()
            XCTAssertEqual(semantic.calls,0)
            let calls = provider.calls
            model.session = MemberSession(memberId:"preview",storeId:"1",storeName:"Fixture",sessionId:"preview")
            controller.setPreferences(.init(request:"coffee"))
            await controller.generate()
            XCTAssertEqual(semantic.calls,0)
            XCTAssertEqual(provider.calls,calls)
        }
    }

    @MainActor func testRequestRelevantBeerReachesProviderAndCanBeSelected() async throws {
        try await withModel { model,db,fixture in
            var old = Beer(id:"old",name:"Old IPA"); old.brew_style = "IPA"; old.brewer = "Brewery"; old.tasted_date = "01/01/2000"
            try db.replaceBeers([old],tasted:true)
            let taplist = (0..<13).map { ["id":String($0),"brew_name":"IPA \($0)","brew_style":"IPA","brewer":"Brewery"] }
                + [["id":"stout","brew_name":"Roast","brew_style":"Stout","brewer":"Other"]]
            let data = try JSONSerialization.data(withJSONObject:taplist)
            fixture.handler = { request in
                switch request.url!.path {
                case "/bk-store-json.php": return (200,data)
                case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
                default: return (200,Data("No brew in queue".utf8))
                }
            }
            let fake = FakeProvider(); fake.action = { ["stout","0","1"] }
            let controller = RecommendationController(model:model,provider:fake)
            controller.setPreferences(.init(request:"a roasty stout"))
            await controller.generate()
            XCTAssertTrue(fake.candidateIDs.contains("stout"))
            XCTAssertEqual(fake.candidateIDs.count,12)
            XCTAssertTrue(controller.usedModel)
            XCTAssertEqual(controller.suggestions.first?.id,"stout")
        }
    }

    @MainActor func testTextRequestWaitsForGenerationAndReportsUninterpretedFallback() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider()
            fake.action = { throw URLError(.notConnectedToInternet) }
            let controller = RecommendationController(model:model,provider:fake)
            controller.setPreferences(.init(request:"crisp and refreshing"))
            XCTAssertEqual(fake.calls,0)
            await controller.generate()
            XCTAssertFalse(controller.usedModel)
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
            XCTAssertTrue(controller.message?.contains("couldn’t interpret") == true)
            controller.setPreferences(.init(request:"IPA"))
            XCTAssertTrue(controller.suggestions.isEmpty)
            XCTAssertEqual(fake.calls,1)
            await controller.generate()
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
            XCTAssertNil(controller.message,"Simple style filters work without AI")
            controller.setPreferences(.init(request:"stout"))
            await controller.generate()
            XCTAssertTrue(controller.suggestions.isEmpty)
            XCTAssertEqual(fake.calls,2,"No eligible style match must not invoke AI or widen filters")
        }
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
    var prewarms = 0
    func prewarm() { prewarms += 1 }
    var candidateIDs: [String] = []
    var candidateEvidence: [String:String] = [:]
    var action: (() async throws -> [String])?
    func rank(history: [Beer], candidates: [BeerSuggestion]) async throws -> [String] {
        calls += 1; candidateIDs = candidates.map(\.id)
        candidateEvidence = SemanticCandidates.evidence(candidates) ?? [:]
        if let action { return try await action() }
        throw RecommendationUnavailable.model
    }
}


@MainActor private final class FakeSemanticRetriever: SemanticRetrieving {
    var validityToken: UUID?
    var calls = 0
    var action: ((SemanticRetrievalRequest) async throws -> [String]?)?
    func retrieve(_ request: SemanticRetrievalRequest) async -> [String]? {
        calls += 1
        return try? await action?(request)
    }
}

extension RecommendationIntegrationTests {
    @MainActor func testSystemProviderReturnsEligibleSuggestionsOrLocalFallback() async throws {
        try await withModel { model,_,_ in
            let controller = model.recommendations
            controller.setPreferences(.init(request:"crisp and refreshing"))
            await controller.generate()
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
            XCTAssertFalse(controller.generating)
            if !controller.usedModel {
                XCTAssertEqual(controller.retrievalSource,.local)
                XCTAssertNotNil(controller.message)
            }
        }
    }
    @MainActor func testAdversarialFailedSaveCannotAutomaticallyDispatchLater() async throws {
        try await withModel { model,db,fixture in
            let beer = Beer(id:"new",name:"New beer")
            try db.replaceBeers([beer]); try model.reload()
            let account = try XCTUnwrap(model.recommendationAccount)
            // A malformed optional cache reproduces a reload error after enqueue commits.
            try db.execute("INSERT INTO beer_feedback(account,beer_id,feedback) VALUES(?,?,?)",[account,"broken","{"])
            var writes = 0
            fixture.handler = { request in
                if request.url!.path == "/addToQueue.php" { writes += 1; return (200,Data()) }
                return (200,Data("No brew in queue".utf8))
            }
            let result = await model.checkIn(beer,recommendation:true)
            XCTAssertEqual(result,.needsReview)
            XCTAssertEqual(try db.operations().first?.status,"failed")
            XCTAssertEqual(writes,0)
            // Repair the unrelated cache; the formerly available beer has gone away.
            try db.deleteCachedBeerFeedback(account:account)
            try db.replaceBeers([]); try model.reload()
            await model.processOperations()
            XCTAssertEqual(writes,0,"A recommendation reported as not saved must not later auto-send without revalidation")
        }
    }
    @MainActor func testAdversarialRefreshBetweenBatchWritesStopsRemainder() async throws {
        try await withModel { model,_,fixture in
            var writes = 0
            fixture.handler = { request in
                switch request.url!.path {
                case "/bk-store-json.php": return (200,Data(#"[{"id":"a","brew_name":"First"},{"id":"b","brew_name":"Second"},{"id":"c","brew_name":"Third"}]"#.utf8))
                case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
                case "/addToQueue.php":
                    writes += 1
                    await model.refresh(requireNewPass:true)
                    return (200,Data())
                default: return (200,Data("No brew in queue".utf8))
                }
            }
            let controller = RecommendationController(model:model,provider:FakeProvider())
            await controller.generate()
            await controller.submit(ids:["a","b"])
            XCTAssertEqual(writes,1)
            XCTAssertEqual(controller.outcomes["a"],.added)
            XCTAssertNil(controller.outcomes["b"])
        }
    }
    @MainActor func testAdversarialQueueFailureBlocksWriteDespiteFreshFeeds() async throws {
        try await withModel { model,_,fixture in
            let controller = RecommendationController(model:model,provider:FakeProvider())
            await controller.generate()
            var writes = 0
            fixture.handler = { request in
                switch request.url!.path {
                case "/bk-store-json.php": return (200,Data(#"[{"id":"new","brew_name":"New beer","brew_style":"IPA"}]"#.utf8))
                case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
                case "/addToQueue.php": writes += 1; return (200,Data())
                default: return (200,Data("<html>Sign in</html>".utf8))
                }
            }
            await controller.submit(ids:["new"])
            XCTAssertEqual(writes,0)
            XCTAssertTrue(controller.outcomes.isEmpty)
        }
    }
}


extension RecommendationIntegrationTests {
    @MainActor func testAppleIntelligenceModeRanksWithTheModelAndRecordsItsMode() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider(); fake.action = { ["new"] }
            let controller = RecommendationController(model:model,provider:fake)
            await controller.generate()
            XCTAssertEqual(fake.calls,1)
            XCTAssertTrue(controller.usedModel)
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
            XCTAssertEqual(controller.resultMode,.appleIntelligence)
        }
    }
    @MainActor func testLocalMatchingModeNeverCallsTheProvider() async throws {
        try await withModel { model,_,_ in
            model.suggestionCompatibility = { .deviceNotEligible }
            let fake = FakeProvider(); fake.action = { ["new"] }
            let controller = RecommendationController(model:model,provider:fake)
            await controller.generate()
            XCTAssertEqual(fake.calls,0)
            XCTAssertFalse(controller.usedModel)
            XCTAssertEqual(controller.retrievalSource,.local)
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
            XCTAssertEqual(controller.resultMode,.localMatching)
            XCTAssertNil(controller.message)
        }
    }
    @MainActor func testOffModeGeneratesNothing() async throws {
        try await withModel { model,_,_ in
            model.suggestionsEnabled = { false }
            let fake = FakeProvider(); fake.action = { ["new"] }
            let controller = RecommendationController(model:model,provider:fake)
            await controller.generate()
            XCTAssertEqual(fake.calls,0)
            XCTAssertTrue(controller.suggestions.isEmpty)
            XCTAssertNil(controller.resultMode)
            XCTAssertFalse(controller.generating)
        }
    }
    @MainActor func testModeChangeDuringGenerationPublishesNoStaleResults() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider()
            let controller = RecommendationController(model:model,provider:fake)
            fake.action = {
                model.suggestionCompatibility = { .modelNotReady }
                model.suggestionMode.refresh()
                return ["new"]
            }
            await controller.generate()
            XCTAssertEqual(fake.calls,1)
            XCTAssertTrue(controller.suggestions.isEmpty)
            XCTAssertNil(controller.resultMode)
            XCTAssertFalse(controller.generating)
            XCTAssertNil(controller.message)
        }
    }
    @MainActor func testModeChangeDuringSubmissionKeepsTheOutcomeAndOriginalMode() async throws {
        try await withModel { model,_,fixture in
            let fake = FakeProvider(); fake.action = { ["new"] }
            let controller = RecommendationController(model:model,provider:fake)
            await controller.generate()
            let feeds = fixture.handler
            fixture.handler = { request in
                if request.url!.path == "/addToQueue.php" {
                    model.suggestionCompatibility = { .notEnabled }
                    model.suggestionMode.refresh()
                    return (200,Data())
                }
                return try await feeds!(request)
            }
            await controller.submit(ids:["new"])
            XCTAssertEqual(model.suggestionMode.mode,.localMatching)
            XCTAssertEqual(controller.outcomes["new"],.added)
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
            XCTAssertEqual(controller.resultMode,.appleIntelligence)
        }
    }
    @MainActor func testModeChangeAfterAPartialSuccessKeepsResultsUntilTheNextGeneration() async throws {
        try await withModel { model,_,fixture in
            var writes = 0
            fixture.handler = { request in
                switch request.url!.path {
                case "/bk-store-json.php": return (200,Data(#"[{"id":"a","brew_name":"First"},{"id":"b","brew_name":"Second"},{"id":"c","brew_name":"Third"}]"#.utf8))
                case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
                case "/addToQueue.php":
                    writes += 1
                    return writes == 2 ? (200,Data("<html>Sign in</html>".utf8)) : (200,Data())
                default: return (200,Data("No brew in queue".utf8))
                }
            }
            let fake = FakeProvider(); fake.action = { ["a","b","c"] }
            let controller = RecommendationController(model:model,provider:fake)
            await controller.generate()
            await controller.submit(ids:["a","b"])
            model.suggestionCompatibility = { .deviceNotEligible }
            model.suggestionMode.refresh()
            XCTAssertEqual(controller.outcomes,["a":.added,"b":.needsReview])
            XCTAssertEqual(controller.suggestions.map(\.id),["a","b","c"])
            XCTAssertEqual(controller.resultMode,.appleIntelligence)
            await controller.generate()
            XCTAssertEqual(fake.calls,1)
            XCTAssertEqual(controller.resultMode,.localMatching)
        }
    }
    @MainActor func testTheSuggestionDeadlineLeavesTimeForSlowerDevices() async throws {
        try await withModel { model,_,_ in
            XCTAssertEqual(RecommendationController(model:model,provider:FakeProvider()).deadlineSeconds,20)
        }
    }
    @MainActor func testPreparingSuggestionsPrewarmsAppleIntelligence() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider()
            RecommendationController(model:model,provider:fake).prepare()
            XCTAssertEqual(fake.prewarms,1)
        }
    }
    @MainActor func testLocalMatchingNeverPrewarmsTheModel() async throws {
        try await withModel { model,_,_ in
            model.suggestionCompatibility = { .deviceNotEligible }
            let fake = FakeProvider()
            RecommendationController(model:model,provider:fake).prepare()
            XCTAssertEqual(fake.prewarms,0)
        }
    }
    @MainActor func testTheResultsAnnouncementSaysWhenAppleIntelligenceFellBack() {
        XCTAssertEqual(RecommendationsScreen.resultsAnnouncement(count:3,fellBack:false),"3 suggestions ready")
        XCTAssertEqual(RecommendationsScreen.resultsAnnouncement(count:1,fellBack:false),"1 suggestion ready")
        XCTAssertEqual(RecommendationsScreen.resultsAnnouncement(count:3,fellBack:true),
                       "Apple Intelligence couldn’t answer this time. 3 local matches ready")
    }
    @MainActor func testEveryAppleIntelligenceOutcomeIsCountedInDiagnostics() async throws {
        try await withModel { model,_,_ in
            let diagnostics = Diagnostics()
            let provider = FakeProvider()
            let controller = RecommendationController(model:model,provider:provider)
            controller.diagnostics = diagnostics
            provider.action = { throw RecommendationUnavailable.model }
            await controller.generate()
            provider.action = { ["not-on-the-taplist"] }
            controller.cancel(); await controller.generate()
            provider.action = { ["new"] }
            controller.cancel(); await controller.generate()
            XCTAssertTrue(diagnostics.report().contains("Apple Intelligence suggestions answered=1 provider-failure=1 invalid-output=1 deadline=0 context-budget=0 max="),diagnostics.report())
        }
    }
}


extension RecommendationIntegrationTests {
    @MainActor private func taplist(_ beers: [(String,String)]) throws -> Data {
        try JSONSerialization.data(withJSONObject:beers.map { ["id":$0.0,"brew_name":"Beer \($0.0)","brew_style":$0.1] })
    }
    @MainActor private func serve(_ fixture: HTTPFixture, taplist data: @escaping () -> Data) {
        fixture.handler = { request in
            switch request.url!.path {
            case "/bk-store-json.php": return (200,data())
            case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
            default: return (200,Data("No brew in queue".utf8))
            }
        }
    }
    @MainActor private func chips(_ states: [(String,StyleChips.State)]) -> SuggestionPreferences {
        var chips = StyleChips()
        for (label,state) in states { chips.set(label,state) }
        return SuggestionPreferences(request:chips.request)
    }
    @MainActor func testLocalMatchingPublishesExactlyTheBeersTheChipsAllow() async throws {
        try await withModel { model,_,fixture in
            model.suggestionCompatibility = { .deviceNotEligible }
            let data = try taplist([("ipa","American IPA"),("hazy","Hazy IPA"),("stout","Stout"),("lager","Helles Lager"),("double","Double IPA")])
            serve(fixture) { data }
            await model.refresh()
            let fake = FakeProvider()
            let controller = RecommendationController(model:model,provider:fake)
            controller.setPreferences(chips([("IPA",.include),("Hazy",.exclude)]))
            await controller.generate()
            XCTAssertEqual(Set(controller.suggestions.map(\.id)),["ipa","double"])
            XCTAssertEqual(fake.calls,0)
            XCTAssertEqual(controller.resultMode,.localMatching)
        }
    }
    @MainActor func testContradictoryChipsHaveNoSavedMatches() async throws {
        try await withModel { model,_,fixture in
            let data = try taplist([("hazy","Hazy IPA"),("ipa","American IPA"),("stout","Stout")])
            serve(fixture) { data }
            await model.refresh()
            let controller = RecommendationController(model:model,provider:FakeProvider())
            XCTAssertFalse(controller.hasSavedMatches(for:chips([("Hazy IPA",.include),("IPA",.exclude)])))
            XCTAssertTrue(controller.hasSavedMatches(for:chips([("Hazy IPA",.include)])))
        }
    }
    @MainActor func testAStyleMissingFromTheSavedTaplistHasNoMatchesUntilAnotherChipChanges() async throws {
        try await withModel { model,_,fixture in
            let data = try taplist([("ipa","American IPA"),("stout","Stout")])
            serve(fixture) { data }
            await model.refresh()
            let controller = RecommendationController(model:model,provider:FakeProvider())
            XCTAssertFalse(controller.hasSavedMatches(for:chips([("Sour",.include)])))
            XCTAssertTrue(controller.hasSavedMatches(for:chips([("Sour",.include),("Stout",.include)])))
            XCTAssertFalse(controller.hasSavedMatches(for:chips([("IPA",.exclude),("Stout",.exclude)])))
            XCTAssertTrue(controller.hasSavedMatches(for:chips([("IPA",.exclude)])))
        }
    }
    @MainActor func testARefreshThatBringsInAMatchingBeerClearsTheNoMatchState() async throws {
        try await withModel { model,_,fixture in
            var data = try taplist([("ipa","American IPA")])
            serve(fixture) { data }
            await model.refresh()
            let controller = RecommendationController(model:model,provider:FakeProvider())
            let sour = chips([("Sour",.include)])
            XCTAssertFalse(controller.hasSavedMatches(for:sour))
            data = try taplist([("ipa","American IPA"),("gose","Gose")])
            await model.refresh()
            XCTAssertTrue(controller.hasSavedMatches(for:sour))
        }
    }
    @MainActor func testLocalMatchingClearsAnUnusableTypedRequestAndSaysSo() async throws {
        try await withModel { model,_,_ in
            model.suggestionCompatibility = { .deviceNotEligible }
            let controller = RecommendationController(model:model,provider:FakeProvider())
            controller.setPreferences(.init(container:.draft,request:"IPA or something refreshing"))
            controller.conformRequestToMode()
            XCTAssertEqual(controller.preferences,.init(container:.draft))
            XCTAssertEqual(controller.message,"Local matching uses style choices, so your typed request was cleared.")
        }
    }
    @MainActor func testLocalMatchingKeepsAFullyRecognizedRequestForTheChips() async throws {
        try await withModel { model,_,_ in
            model.suggestionCompatibility = { .deviceNotEligible }
            let controller = RecommendationController(model:model,provider:FakeProvider())
            controller.setPreferences(.init(request:"IPA, not hazy"))
            controller.conformRequestToMode()
            XCTAssertEqual(controller.preferences.request,"IPA, not hazy")
            XCTAssertEqual(StyleChips(request:controller.preferences.request)?.excluded,["Hazy"])
            XCTAssertNil(controller.message)
        }
    }
    @MainActor func testAppleIntelligenceModeAndVisibleResultsKeepTheTypedRequest() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider(); fake.action = { ["new"] }
            let controller = RecommendationController(model:model,provider:fake)
            controller.setPreferences(.init(request:"crisp and refreshing"))
            controller.conformRequestToMode()
            XCTAssertEqual(controller.preferences.request,"crisp and refreshing")
            await controller.generate()
            model.suggestionCompatibility = { .deviceNotEligible }
            controller.conformRequestToMode()
            XCTAssertEqual(controller.preferences.request,"crisp and refreshing","results stay with the request they used")
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
        }
    }
    @MainActor func testANewGenerationDropsAnEarlierMessage() async throws {
        try await withModel { model,_,_ in
            model.suggestionCompatibility = { .deviceNotEligible }
            let controller = RecommendationController(model:model,provider:FakeProvider())
            await controller.generate()
            model.allBeers.append(Beer(id:"later",name:"Later arrival"))
            controller.invalidateIfChanged()
            XCTAssertNotNil(controller.message)
            await controller.generate()
            XCTAssertFalse(controller.suggestions.isEmpty)
            XCTAssertNil(controller.message)
        }
    }
    @MainActor func testLocalGenerationNeverUsesAnUnusableTypedRequest() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider(); fake.action = { ["new"] }
            let controller = RecommendationController(model:model,provider:fake)
            controller.setPreferences(.init(request:"crisp and refreshing"))
            model.suggestionCompatibility = { .deviceNotEligible }
            await controller.generate()
            XCTAssertEqual(controller.preferences.request,"")
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
            XCTAssertEqual(controller.message,"Local matching uses style choices, so your typed request was cleared.")
        }
    }
}


/// S5: every fallback from Apple Intelligence to local matching is announced,
/// and nothing else is.
extension RecommendationIntegrationTests {
    @MainActor private func generate(_ model: AppModel, semantic: [String]? = nil, timeout: Double = 8,
                                     request: String = "", rank: @escaping (FakeProvider) async throws -> [String]) async -> RecommendationController {
        let provider = FakeProvider()
        provider.action = { try await rank(provider) }
        let controller = RecommendationController(model:model,provider:provider)
        if let semantic {
            let retriever = FakeSemanticRetriever(); retriever.action = { _ in semantic }
            controller.semanticRetriever = retriever
        }
        controller.timeout = timeout
        controller.setPreferences(.init(request:request))
        await controller.generate()
        return controller
    }
    @MainActor func testPublishedSuggestionsCountTheirSourceAndAnyFallbackReason() async throws {
        try await withModel { model,_,_ in
            let usage = UsageSpy()
            model.usage = usage
            let answered = await generate(model) { _ in ["new"] }
            let failed = await generate(model) { _ in throw RecommendationUnavailable.model }
            let late = await generate(model,timeout:0.05) { _ in try await Task.sleep(for:.seconds(5)); return ["new"] }
            XCTAssertTrue(answered.usedModel)
            XCTAssertEqual(failed.fallback,.providerFailure)
            XCTAssertEqual(late.fallback,.deadlineExpired)
            XCTAssertEqual(usage.events,[.appleIntelligenceUsed,.localMatchingUsed,.fallbackProviderFailure,.localMatchingUsed,.fallbackDeadlineExpired])
        }
    }
    @MainActor func testProviderFailureIsAnnouncedAsAFallback() async throws {
        try await withModel { model,_,_ in
            let controller = await generate(model) { _ in throw RecommendationUnavailable.model }
            XCTAssertEqual(controller.fallback,.providerFailure)
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
            XCTAssertFalse(controller.usedModel)
        }
    }
    @MainActor func testUnknownIDsAreAnnouncedAsInvalidOutput() async throws {
        try await withModel { model,_,_ in
            let controller = await generate(model) { _ in ["not-on-the-taplist"] }
            XCTAssertEqual(controller.fallback,.invalidOutput)
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
        }
    }
    @MainActor func testADeadlineBeforeRankingFinishesIsAnnounced() async throws {
        try await withModel { model,_,_ in
            let controller = await generate(model,timeout:0.05) { _ in try await Task.sleep(for:.seconds(5)); return ["new"] }
            XCTAssertEqual(controller.fallback,.deadlineExpired)
            XCTAssertEqual(controller.suggestions.map(\.id),["new"])
        }
    }
    @MainActor func testADeadlineDuringTheContextBudgetRetryIsAnnounced() async throws {
        try await withModel { model,_,_ in
            let controller = await generate(model,semantic:["new"],timeout:0.2,request:"coffee") { provider in
                if provider.calls == 1 { throw RecommendationUnavailable.contextBudget }
                try await Task.sleep(for:.seconds(5)); return ["new"]
            }
            XCTAssertEqual(controller.fallback,.deadlineExpired)
        }
    }
    @MainActor func testAnExhaustedContextBudgetIsAnnounced() async throws {
        try await withModel { model,_,_ in
            let local = await generate(model) { _ in throw RecommendationUnavailable.contextBudget }
            XCTAssertEqual(local.fallback,.contextBudgetExhausted)
            let retried = await generate(model,semantic:["new"],request:"coffee") { _ in throw RecommendationUnavailable.contextBudget }
            XCTAssertEqual(retried.fallback,.contextBudgetExhausted)
        }
    }
    @MainActor func testSuccessAfterARetrievalTimeoutOrContextRetryIsNotAFallback() async throws {
        try await withModel { model,_,_ in
            let provider = FakeProvider(), semantic = FakeSemanticRetriever()
            provider.action = { ["new"] }
            semantic.action = { _ in try await Task.sleep(for:.seconds(5)); return ["new"] }
            let controller = RecommendationController(model:model,provider:provider)
            controller.semanticRetriever = semantic; controller.retrievalTimeout = 0.01
            controller.setPreferences(.init(request:"coffee"))
            await controller.generate()
            XCTAssertTrue(controller.usedModel)
            XCTAssertNil(controller.fallback)
            let retried = await generate(model,semantic:["new"],request:"coffee") { provider in
                if provider.calls == 1 { throw RecommendationUnavailable.contextBudget }
                return ["new"]
            }
            XCTAssertTrue(retried.usedModel)
            XCTAssertNil(retried.fallback)
        }
    }
    @MainActor func testAPreferenceChangeDuringRankingPublishesNoResultsAndNoNotice() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider()
            let controller = RecommendationController(model:model,provider:fake)
            fake.action = { controller.setPreferences(.init(container:.bottle)); throw RecommendationUnavailable.model }
            await controller.generate()
            XCTAssertEqual(fake.calls,1)
            XCTAssertTrue(controller.suggestions.isEmpty)
            XCTAssertNil(controller.fallback)
        }
    }
    @MainActor func testAnAccountChangeDuringRankingPublishesNoResultsAndNoNotice() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider()
            let controller = RecommendationController(model:model,provider:fake)
            fake.action = {
                model.session = MemberSession(memberId:"other",storeId:"2",storeName:"Other",sessionId:"other")
                throw RecommendationUnavailable.model
            }
            await controller.generate()
            XCTAssertEqual(fake.calls,1,"the account changes inside ranking")
            XCTAssertEqual(model.session?.memberId,"other")
            XCTAssertTrue(controller.suggestions.isEmpty)
            XCTAssertNil(controller.fallback)
        }
    }
    @MainActor func testACancelledProviderIsNotAFallback() async throws {
        try await withModel { model,_,_ in
            let first = await generate(model) { _ in throw CancellationError() }
            XCTAssertTrue(first.suggestions.isEmpty)
            XCTAssertNil(first.fallback)
            XCTAssertFalse(first.generating)
            let retry = await generate(model,semantic:["new"],request:"coffee") { provider in
                if provider.calls == 1 { throw RecommendationUnavailable.contextBudget }
                throw CancellationError()
            }
            XCTAssertTrue(retry.suggestions.isEmpty)
            XCTAssertNil(retry.fallback)
        }
    }
    @MainActor func testVisibleResultsKeepTheirModeUntilTheNextGeneration() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider(); fake.action = { throw RecommendationUnavailable.model }
            let controller = RecommendationController(model:model,provider:fake)
            await controller.generate()
            XCTAssertEqual(controller.displayedMode(current:.appleIntelligence),.appleIntelligence)
            XCTAssertTrue(controller.canRetryAppleIntelligence(current:.appleIntelligence))
            model.suggestionCompatibility = { .notEnabled }
            XCTAssertEqual(controller.displayedMode(current:model.suggestionMode.mode),.appleIntelligence,"results keep their source")
            XCTAssertFalse(controller.canRetryAppleIntelligence(current:model.suggestionMode.mode),"retry would run local matching")
            controller.cancel()
            XCTAssertEqual(controller.displayedMode(current:model.suggestionMode.mode),.localMatching)
        }
    }
    @MainActor func testLateCompletionAfterCancelPublishesNoNotice() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider()
            var release: CheckedContinuation<Void,Never>?
            fake.action = { await withCheckedContinuation { release = $0 }; throw RecommendationUnavailable.model }
            let controller = RecommendationController(model:model,provider:fake)
            let work = Task { await controller.generate() }
            while release == nil { await Task.yield() }
            controller.cancel()
            release?.resume()
            await work.value
            XCTAssertTrue(controller.suggestions.isEmpty)
            XCTAssertNil(controller.fallback)
        }
    }
    @MainActor func testLocalMatchingNeverAnnouncesAFallback() async throws {
        try await withModel { model,_,_ in
            model.suggestionCompatibility = { .deviceNotEligible }
            let controller = await generate(model) { _ in throw RecommendationUnavailable.model }
            XCTAssertFalse(controller.suggestions.isEmpty)
            XCTAssertNil(controller.fallback)
        }
    }
    @MainActor func testTheNoticeClearsOnCancelAndAtTheNextGeneration() async throws {
        try await withModel { model,_,_ in
            let fake = FakeProvider()
            fake.action = { throw RecommendationUnavailable.model }
            let controller = RecommendationController(model:model,provider:fake)
            await controller.generate()
            XCTAssertEqual(controller.fallback,.providerFailure)
            controller.cancel()
            XCTAssertNil(controller.fallback)
            await controller.generate()
            XCTAssertEqual(controller.fallback,.providerFailure)
            fake.action = { ["new"] }
            await controller.generate()
            XCTAssertNil(controller.fallback)
            XCTAssertTrue(controller.usedModel)
        }
    }
}


final class RecommendationCompatibilityTests: XCTestCase {
    @MainActor func testAvailableModelAlsoRequiresSupportedLocale() {
        guard #available(iOS 26.0, *) else {
            XCTAssertEqual(RecommendationCompatibility.current,.requiresNewerOS)
            return
        }
        XCTAssertEqual(RecommendationCompatibility.resolve(.available,supportsLocale:true),.appleIntelligence)
        XCTAssertEqual(RecommendationCompatibility.resolve(.available,supportsLocale:false),.unsupportedLocale)
    }
    @MainActor func testUnavailableReasonsRemainDistinctRegardlessOfLocale() {
        guard #available(iOS 26.0, *) else { return }
        for supported in [true,false] {
            XCTAssertEqual(RecommendationCompatibility.resolve(.unavailable(.deviceNotEligible),supportsLocale:supported),.deviceNotEligible)
            XCTAssertEqual(RecommendationCompatibility.resolve(.unavailable(.appleIntelligenceNotEnabled),supportsLocale:supported),.notEnabled)
            XCTAssertEqual(RecommendationCompatibility.resolve(.unavailable(.modelNotReady),supportsLocale:supported),.modelNotReady)
        }
    }
}
