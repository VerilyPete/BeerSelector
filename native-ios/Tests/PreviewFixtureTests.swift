import XCTest
@testable import BeerSelectorNative

/// Fixture flags must produce every suggestion mode and outcome offline, so each
/// state can be launched and screenshotted on an isolated simulator.
@MainActor
final class PreviewFixtureTests: XCTestCase {
    private func fixture(_ arguments: [String]) throws -> AppModel {
        let model = AppModel(monitorConnectivity:false)
        addTeardownBlock { UserDefaults.standard.removeObject(forKey:"recommendations_enabled") }
        try model.loadPreviewFixtures(arguments:["--preview-fixtures"] + arguments)
        return model
    }

    func testSuggestionModeFlagForcesEachMode() throws {
        let cases: [(String,SuggestionMode)] = [
            ("apple-intelligence",.appleIntelligence), ("local-matching",.localMatching), ("off",.off),
        ]
        for (flag,mode) in cases {
            let model = try fixture(["--preview-suggestions","on","--preview-suggestion-mode",flag])
            XCTAssertEqual(model.suggestionMode.mode,mode,flag)
        }
    }

    func testSuggestionsFlagSeedsTheToggleWithoutOpeningTheSheet() throws {
        let on = try fixture(["--preview-suggestions","on","--preview-suggestion-mode","local-matching"])
        XCTAssertTrue(UserDefaults.standard.bool(forKey:"recommendations_enabled"))
        XCTAssertFalse(on.showRecommendations)
        let off = try fixture(["--preview-suggestions","off","--preview-suggestion-mode","apple-intelligence"])
        XCTAssertFalse(UserDefaults.standard.bool(forKey:"recommendations_enabled"))
        XCTAssertEqual(off.suggestionMode.mode,.off)
    }

    func testRecommendationsFlagStillEnablesAndOpensTheSheetUnlessSeededOff() throws {
        let opened = try fixture(["--preview-recommendations"])
        XCTAssertTrue(opened.showRecommendations)
        XCTAssertTrue(UserDefaults.standard.bool(forKey:"recommendations_enabled"))
        _ = try fixture(["--preview-recommendations","--preview-suggestions","off"])
        XCTAssertFalse(UserDefaults.standard.bool(forKey:"recommendations_enabled"))
    }

    func testAISuccessOutcomeRanksWithoutARealModel() async throws {
        let model = try fixture(["--preview-suggestions","on","--preview-suggestion-mode","apple-intelligence",
                                 "--preview-ai-outcome","success"])
        await model.recommendations.generate()
        XCTAssertTrue(model.recommendations.usedModel)
        XCTAssertEqual(model.recommendations.resultMode,.appleIntelligence)
        XCTAssertNil(model.recommendations.fallback)
        XCTAssertFalse(model.recommendations.suggestions.isEmpty)
    }

    func testEachFailureOutcomeFallsBackToLocalCandidates() async throws {
        let expected: [String:RecommendationFallback] = [
            "provider-failure":.providerFailure, "invalid-output":.invalidOutput,
            "deadline":.deadlineExpired, "context-budget":.contextBudgetExhausted,
        ]
        for (outcome,reason) in expected {
            let model = try fixture(["--preview-suggestions","on","--preview-suggestion-mode","apple-intelligence",
                                     "--preview-ai-outcome",outcome])
            await model.recommendations.generate()
            XCTAssertFalse(model.recommendations.usedModel,outcome)
            XCTAssertFalse(model.recommendations.suggestions.isEmpty,outcome)
            XCTAssertEqual(model.recommendations.resultMode,.appleIntelligence,outcome)
            XCTAssertEqual(model.recommendations.fallback,reason,outcome)
        }
    }

    func testWithoutAnOutcomeFlagPreviewNeverRanks() async throws {
        let model = try fixture(["--preview-suggestions","on","--preview-suggestion-mode","apple-intelligence"])
        await model.recommendations.generate()
        XCTAssertFalse(model.recommendations.usedModel)
        XCTAssertFalse(model.recommendations.suggestions.isEmpty)
        XCTAssertEqual(model.recommendations.fallback,.providerFailure,"preview never consults a model, so it says so")
    }

    func testVisitorFixtureBrowsesTheTaplistOfflineWithoutMemberData() async throws {
        let model = try fixture(["--preview-session","visitor","--preview-suggestions","on"])
        XCTAssertEqual(model.session?.isVisitor,true)
        XCTAssertFalse(model.isMember)
        XCTAssertTrue(model.previewMode,"fixture guards must still block every network path")
        XCTAssertFalse(model.allBeers.isEmpty)
        XCTAssertTrue(model.tastedBeers.isEmpty)
        XCTAssertTrue(model.rewards.isEmpty)
        XCTAssertTrue(model.queue.isEmpty)
        XCTAssertEqual(model.suggestionMode.mode,.off)
        let taplist = model.allBeers
        await model.refresh()
        XCTAssertEqual(model.allBeers.map(\.id),taplist.map(\.id),"no refresh ran")
    }

    func testFirstRunFixtureHasNoAccount() throws {
        let model = try fixture(["--preview-session","first-run"])
        XCTAssertNil(model.session)
        XCTAssertFalse(model.configured)
        XCTAssertTrue(model.previewMode)
    }

    func testPopulatedFixtureCanProveEverySortOrder() throws {
        let model = try fixture([])
        XCTAssertTrue(model.isMember)
        XCTAssertGreaterThanOrEqual(model.rewards.count,3)
        XCTAssertTrue(model.rewards.contains { $0.redeemed })
        XCTAssertGreaterThanOrEqual(model.rewards.filter { !$0.redeemed }.count,2)
        XCTAssertFalse(BeerFilter.recentArrivals(model.allBeers).isEmpty)
        for (list,date) in [(model.allBeers,\Beer.added_date),(model.tastedBeers,\Beer.tasted_date)] {
            let dates = list.map { $0[keyPath:date] }
            XCTAssertGreaterThan(Set(dates).count,2,"distinct dates")
            XCTAssertLessThan(Set(dates).count,dates.count,"a deliberate date tie")
            let abvs = list.compactMap(\.abv)
            XCTAssertLessThan(abvs.count,list.count,"an unknown ABV")
            XCTAssertGreaterThan(Set(abvs).count,2,"distinct ABVs")
            XCTAssertLessThan(Set(abvs).count,abvs.count,"a deliberate ABV tie")
            XCTAssertEqual(Set(list.map(\.brew_name)).count,list.count,"distinct names")
        }
    }

    func testBannersFixtureShowsEveryHomeBanner() throws {
        let model = try fixture(["--preview-banners"])
        XCTAssertTrue(model.offline)
        XCTAssertNotNil(model.error)
        XCTAssertFalse(model.operations.isEmpty)
    }

    func testListStateFixturesProduceRefreshingAndEmptyLists() throws {
        XCTAssertTrue(try fixture(["--preview-list-state","refreshing"]).refreshing)
        let empty = try fixture(["--preview-list-state","empty"])
        XCTAssertTrue(empty.allBeers.isEmpty)
        XCTAssertTrue(empty.tastedBeers.isEmpty)
        XCTAssertTrue(empty.isMember)
    }

    func testCheckInOutcomeFixtureProducesEveryOutcomeOffline() async throws {
        let model = try fixture(["--preview-suggestions","on","--preview-suggestion-mode","apple-intelligence",
                                 "--preview-ai-outcome","success",
                                 "--preview-check-in-outcomes","added,needs-review,saved-for-retry,unavailable"])
        let controller = model.recommendations
        controller.previewSubmitDelay = .zero
        await controller.generate()
        let ids = controller.suggestions.map(\.id)
        XCTAssertEqual(ids.count,3)
        await controller.submit(ids:Set(ids))
        XCTAssertEqual(ids.map { controller.outcomes[$0] },[.added,.needsReview,.savedForRetry])
        XCTAssertFalse(controller.submitting)
        XCTAssertTrue(model.operations.isEmpty,"no queue write was attempted")
    }

    func testWithoutTheOutcomeFlagPreviewSubmissionStillDoesNothing() async throws {
        let model = try fixture(["--preview-suggestions","on","--preview-suggestion-mode","apple-intelligence",
                                 "--preview-ai-outcome","success"])
        await model.recommendations.generate()
        await model.recommendations.submit(ids:Set(model.recommendations.suggestions.map(\.id)))
        XCTAssertTrue(model.recommendations.outcomes.isEmpty)
    }
}

