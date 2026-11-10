import XCTest
@testable import BeerSelectorNative

@MainActor final class UsageSpy: UsageRecording {
    private(set) var events: [UsageEvent] = []
    func record(_ event: UsageEvent) { events.append(event) }
}

/// Each event fires once per user action, at the point the worker plan names, and never in preview.
final class UsageTriggerTests: XCTestCase {
    private struct Context {
        let model: AppModel
        let db: BeerDatabase
        let fixture: HTTPFixture
        let usage: UsageSpy
    }

    @MainActor private func withModel(_ body: @MainActor (Context) async throws -> Void) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let key = "usage_trigger_" + UUID().uuidString
        let credentials = CredentialStore(prefix:key,sessionStorageKey:key + "_session")
        let fixture = HTTPFixture()
        var configuration = APIConfiguration()
        configuration.enrichmentURL = nil
        configuration.enrichmentKey = nil
        let model = AppModel(api:fixture.api(configuration:configuration),credentials:credentials,monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db"))
        model.db = db
        model.activityUpdate = { _,_ in }; model.webCookieCleanup = {}
        model.session = MemberSession(memberId:"1",storeId:"1",storeName:"Fixture",sessionId:"session")
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        try db.setPreference("my_beers_api_url","https://fsbs.beerknurd.com/bk-member-json.php?uid=1")
        let usage = UsageSpy()
        model.usage = usage
        defer { fixture.handler = nil; try? credentials.clear(); try? FileManager.default.removeItem(at:folder) }
        try await body(Context(model:model,db:db,fixture:fixture,usage:usage))
    }

    private func response(_ request: URLRequest) throws -> (Int, Data) {
        switch request.url!.path {
        case "/bk-store-json.php": return (200,Data(#"[{"id":"store","brew_name":"Store beer"}]"#.utf8))
        case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[{"id":"tasted","brew_name":"Tasted beer"}]},{"reward":[]}]"#.utf8))
        case "/memberQueues.php": return (200,Data("<p>No beers currently in your queue.</p>".utf8))
        case "/addToRewardQueue.php", "/deleteQueuedBrew.php": return (200,Data())
        default: throw URLError(.unsupportedURL)
        }
    }

    // MARK: Screens

    @MainActor func testSelectingADifferentTabCountsItsViewAndReselectingCountsNothing() async throws {
        try await withModel { c in
            c.model.selectTab(.all)
            c.model.selectTab(.all)
            c.model.selectTab(.finder)
            c.model.selectTab(.tasted)
            c.model.selectTab(.home)
            XCTAssertEqual(c.usage.events,[.viewAllBeers,.viewBeerfinder,.viewTasted,.viewHome])
        }
    }

    @MainActor func testADeepLinkCountsTheTabItOpens() async throws {
        try await withModel { c in
            c.model.loading = false
            c.model.handleURL(URL(string:"beerselector://beerlist")!)
            XCTAssertEqual(c.usage.events,[.viewAllBeers])
        }
    }

    @MainActor func testOpeningEachScreenCountsOnceAndClosingCountsNothing() async throws {
        try await withModel { c in
            c.model.showRewards = true; c.model.showRewards = true; c.model.showRewards = false
            c.model.showQueue = true; c.model.showQueue = false
            c.model.showOperations = true; c.model.showOperations = false
            c.model.showMissedCredit = true; c.model.showMissedCredit = false
            c.model.showRecommendations = true; c.model.showRecommendations = false
            XCTAssertEqual(c.usage.events,[.viewRewards,.viewQueue,.viewPendingOperations,.viewMissedCredit,.suggestionsOpened])
        }
    }

    @MainActor func testPreviewSessionsCountNothing() async throws {
        try await withModel { c in
            c.model.session = MemberSession(memberId:"preview",storeId:"1",storeName:"Fixture",sessionId:"session")
            c.model.selectTab(.all)
            c.model.showRewards = true
            c.model.openUntappd(Beer(id:"b",name:"Beer"))
            XCTAssertEqual(c.usage.events,[])
        }
    }

    // MARK: Check-ins

    @MainActor func testAManualCheckInCountsOnceWhenSavedLocally() async throws {
        try await withModel { c in
            c.model.offline = true
            await c.model.checkIn(Beer(id:"new",name:"New beer"))
            XCTAssertEqual(c.usage.events,[.checkinQueued])
        }
    }

    @MainActor func testASuggestedCheckInAlsoCountsAsFromASuggestionWhateverHappensToDelivery() async throws {
        try await withModel { c in
            let beer = Beer(id:"new",name:"New beer")
            try c.db.replaceBeers([beer]); try c.model.reload()
            c.fixture.handler = { _ in throw URLError(.badServerResponse) }
            await c.model.checkIn(beer,recommendation:true)
            XCTAssertEqual(c.usage.events,[.checkinQueued,.checkinFromSuggestion])
        }
    }

    @MainActor func testARejectedCheckInCountsNothing() async throws {
        try await withModel { c in
            let tasted = Beer(id:"tasted",name:"Tasted beer")
            try c.db.replaceBeers([tasted],tasted:true); try c.model.reload()
            await c.model.checkIn(tasted)
            XCTAssertEqual(c.usage.events,[])
        }
    }

    // MARK: Rewards and queue

    @MainActor func testAQueuedRewardCountsOnceEvenWhenTheFollowingRefreshFails() async throws {
        try await withModel { c in
            c.fixture.handler = { request in
                if request.url!.path == "/addToRewardQueue.php" { return (200,Data()) }
                throw URLError(.badServerResponse)
            }
            await c.model.queueReward(Reward(id:"r",type:"Reward",redeemed:false))
            XCTAssertEqual(c.usage.events,[.rewardQueued])
        }
    }

    @MainActor func testARewardThatIsRejectedFailsOrOutlivesItsAccountCountsNothing() async throws {
        try await withModel { c in
            await c.model.queueReward(Reward(id:"redeemed",type:"Reward",redeemed:true))
            c.fixture.handler = { _ in throw URLError(.badServerResponse) }
            await c.model.queueReward(Reward(id:"r",type:"Reward",redeemed:false))
            let model = c.model
            c.fixture.handler = { _ in model.invalidatePreviewWork(); return (200,Data()) }
            await c.model.queueReward(Reward(id:"r2",type:"Reward",redeemed:false))
            XCTAssertEqual(c.usage.events,[])
        }
    }

    @MainActor func testADeletedQueueEntryCountsOnceWhenAccepted() async throws {
        try await withModel { c in
            c.fixture.handler = { try self.response($0) }
            await c.model.deleteQueueEntry(QueueEntry(id:"7",name:"Beer",date:""))
            XCTAssertEqual(c.usage.events,[.queueEntryDeleted])
        }
    }

    @MainActor func testAQueueDeletionThatFailsOrOutlivesItsAccountCountsNothing() async throws {
        try await withModel { c in
            c.fixture.handler = { _ in throw URLError(.badServerResponse) }
            await c.model.deleteQueueEntry(QueueEntry(id:"7",name:"Beer",date:""))
            let model = c.model
            c.fixture.handler = { _ in model.invalidatePreviewWork(); return (200,Data()) }
            await c.model.deleteQueueEntry(QueueEntry(id:"8",name:"Beer",date:""))
            XCTAssertEqual(c.usage.events,[])
        }
    }

    @MainActor func testOnlyAManualRewardsRefreshCounts() async throws {
        try await withModel { c in
            c.fixture.handler = { try self.response($0) }
            await c.model.refreshRewards()
            await c.model.refreshRewardsManually()
            XCTAssertEqual(c.usage.events,[.rewardsRefreshedManual])
        }
    }

    // MARK: Operations, ratings, missed credit, Untappd

    @MainActor func testRetryingAPendingOperationCountsOnceAndARestrictedOneCountsNothing() async throws {
        try await withModel { c in
            try c.db.enqueue(type:"CHECK_IN_BEER",payload:["beerId":"b","beerName":"Beer","memberId":"2","storeId":"2","storeName":"Other"])
            try c.db.enqueue(type:"CHECK_IN_BEER",payload:["beerId":"c","beerName":"Beer","memberId":"1","storeId":"1","storeName":"Fixture"])
            try c.model.reload()
            c.model.offline = true
            let foreign = try XCTUnwrap(c.model.operations.first { $0.payload["memberId"] == "2" })
            let own = try XCTUnwrap(c.model.operations.first { $0.payload["memberId"] == "1" })
            await c.model.retryOperation(foreign.id)
            await c.model.retryOperation(own.id)
            XCTAssertEqual(c.usage.events,[.operationRetried])
        }
    }

    @MainActor func testRatingATastedBeerCountsAndARejectedRatingCountsNothing() async throws {
        try await withModel { c in
            let tasted = Beer(id:"tasted",name:"Tasted beer")
            try c.db.replaceBeers([tasted],tasted:true); try c.model.reload()
            c.model.setBeerRating(tasted,rating:.liked,account:c.model.recommendationAccount)
            c.model.setBeerRating(tasted,rating:.liked,account:"someone else")
            XCTAssertEqual(c.usage.events,[.beerRated])
        }
    }

    @MainActor func testResolvingMissedCreditCountsOncePerAction() async throws {
        try await withModel { c in
            let first = CreditLogEntry(id:"1",name:"One",queued:"",firstSeen:Date())
            let second = CreditLogEntry(id:"2",name:"Two",queued:"",firstSeen:Date())
            c.model.resolveMissedCreditVisit(MissedCreditVisit(day:Date(),beers:[first,second]))
            c.model.dismissMissedCredit(first)
            XCTAssertEqual(c.usage.events,[.missedCreditResolved,.missedCreditResolved])
        }
    }

    @MainActor func testOpeningUntappdCounts() async throws {
        try await withModel { c in
            c.model.openUntappd(Beer(id:"b",name:"Beer"))
            XCTAssertEqual(c.usage.events,[.untappdOpened])
        }
    }
}

final class UsageSuggestionOutcomeTests: XCTestCase {
    func testEveryPublishedOutcomeMapsToItsEvents() {
        XCTAssertEqual(UsageEvent.suggestionOutcome(mode:.appleIntelligence,usedModel:true,fallback:nil),[.appleIntelligenceUsed])
        XCTAssertEqual(UsageEvent.suggestionOutcome(mode:.localMatching,usedModel:false,fallback:nil),[.localMatchingUsed])
        let fallbacks: [(RecommendationFallback, UsageEvent)] = [
            (.deadlineExpired, .fallbackDeadlineExpired),
            (.providerFailure, .fallbackProviderFailure),
            (.invalidOutput, .fallbackInvalidOutput),
            (.contextBudgetExhausted, .fallbackContextBudget),
        ]
        for (fallback, event) in fallbacks {
            XCTAssertEqual(UsageEvent.suggestionOutcome(mode:.appleIntelligence,usedModel:false,fallback:fallback),[.localMatchingUsed,event],"\(fallback)")
        }
    }
}
