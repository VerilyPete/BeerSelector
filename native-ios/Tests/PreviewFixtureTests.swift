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
        XCTAssertFalse(model.recommendations.suggestions.isEmpty)
    }

    func testEachFailureOutcomeFallsBackToLocalCandidates() async throws {
        for outcome in ["provider-failure","invalid-output","deadline","context-budget"] {
            let model = try fixture(["--preview-suggestions","on","--preview-suggestion-mode","apple-intelligence",
                                     "--preview-ai-outcome",outcome])
            await model.recommendations.generate()
            XCTAssertFalse(model.recommendations.usedModel,outcome)
            XCTAssertFalse(model.recommendations.suggestions.isEmpty,outcome)
            XCTAssertEqual(model.recommendations.resultMode,.appleIntelligence,outcome)
        }
    }

    func testWithoutAnOutcomeFlagPreviewNeverRanks() async throws {
        let model = try fixture(["--preview-suggestions","on","--preview-suggestion-mode","apple-intelligence"])
        await model.recommendations.generate()
        XCTAssertFalse(model.recommendations.usedModel)
        XCTAssertFalse(model.recommendations.suggestions.isEmpty)
    }
}
