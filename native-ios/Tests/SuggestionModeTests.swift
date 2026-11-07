import Combine
import XCTest
@testable import BeerSelectorNative

@MainActor
final class SuggestionModeTests: XCTestCase {
    private let everyCompatibility: [RecommendationCompatibility] = [
        .appleIntelligence, .requiresNewerOS, .deviceNotEligible, .notEnabled,
        .modelNotReady, .unsupportedLocale, .unavailable,
    ]

    func testOnlyAnAppleIntelligenceDeviceResolvesToAppleIntelligenceMode() {
        for compatibility in everyCompatibility {
            for enabled in [false, true] {
                for isMember in [false, true] {
                    let expected: SuggestionMode = !(enabled && isMember) ? .off
                        : compatibility == .appleIntelligence ? .appleIntelligence : .localMatching
                    XCTAssertEqual(
                        SuggestionMode.resolve(compatibility:compatibility,enabled:enabled,isMember:isMember),
                        expected,
                        "\(compatibility), enabled \(enabled), member \(isMember)"
                    )
                }
            }
        }
    }

    private final class Inputs {
        var compatibility = RecommendationCompatibility.appleIntelligence
        var enabled = true
        var isMember = true
    }

    private func state(_ inputs: Inputs) -> SuggestionModeState {
        SuggestionModeState(
            compatibility:{ inputs.compatibility },
            enabled:{ inputs.enabled },
            isMember:{ inputs.isMember }
        )
    }

    func testStateStartsFromTheCurrentInputs() {
        let inputs = Inputs()
        inputs.compatibility = .modelNotReady
        XCTAssertEqual(state(inputs).mode,.localMatching)
    }

    func testRefreshPicksUpToggleMembershipAndCapabilityChanges() {
        let inputs = Inputs()
        let modes = state(inputs)
        inputs.enabled = false
        modes.refresh()
        XCTAssertEqual(modes.mode,.off)
        inputs.enabled = true
        inputs.isMember = false
        modes.refresh()
        XCTAssertEqual(modes.mode,.off)
        inputs.isMember = true
        inputs.compatibility = .notEnabled
        modes.refresh()
        XCTAssertEqual(modes.mode,.localMatching)
    }

    func testAnUnchangedRecheckDoesNotNotifyObservers() {
        let modes = state(Inputs())
        var notifications = 0
        let subscription = modes.objectWillChange.sink { notifications += 1 }
        modes.refresh()
        XCTAssertEqual(notifications,0)
        subscription.cancel()
    }

    func testStateExposesTheCompatibilityBehindTheMode() {
        let inputs = Inputs()
        inputs.compatibility = .notEnabled
        let modes = state(inputs)
        XCTAssertEqual(modes.compatibility,.notEnabled)
        inputs.compatibility = .appleIntelligence
        modes.refresh()
        XCTAssertEqual(modes.compatibility,.appleIntelligence)
    }

    func testSigningInOrOutRefreshesTheSharedMode() {
        let model = AppModel(monitorConnectivity:false)
        model.suggestionCompatibility = { .appleIntelligence }
        model.suggestionsEnabled = { true }
        XCTAssertEqual(model.suggestionMode.mode,.off)
        model.session = MemberSession(memberId:"1",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        XCTAssertEqual(model.suggestionMode.mode,.appleIntelligence)
        model.session = MemberSession(memberId:"visitor",storeId:"1",storeName:"Fixture",sessionId:"visitor")
        XCTAssertEqual(model.suggestionMode.mode,.off)
        model.session = nil
        XCTAssertEqual(model.suggestionMode.mode,.off)
    }

    func testReplacingAModeInputRefreshesTheSharedMode() {
        let model = AppModel(monitorConnectivity:false)
        model.session = MemberSession(memberId:"1",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        model.suggestionsEnabled = { true }
        model.suggestionCompatibility = { .appleIntelligence }
        XCTAssertEqual(model.suggestionMode.mode,.appleIntelligence)
        model.suggestionCompatibility = { .deviceNotEligible }
        XCTAssertEqual(model.suggestionMode.mode,.localMatching)
        model.suggestionsEnabled = { false }
        XCTAssertEqual(model.suggestionMode.mode,.off)
    }

    func testEachModeNamesItsSourceOnHomeAndTheSheet() {
        XCTAssertEqual(SuggestionMode.appleIntelligence.homeTitle,"Ask Apple Intelligence")
        XCTAssertEqual(SuggestionMode.appleIntelligence.homeDetail,"Describe a style or mood.")
        XCTAssertEqual(SuggestionMode.appleIntelligence.plate,"APPLE INTELLIGENCE")
        XCTAssertEqual(SuggestionMode.localMatching.homeTitle,"Local matching")
        XCTAssertEqual(SuggestionMode.localMatching.homeDetail,"Picks from your tasting history and the styles you choose.")
        XCTAssertEqual(SuggestionMode.localMatching.plate,"LOCAL MATCHING")
    }

    func testSettingsStatusNamesTheActiveMode() {
        XCTAssertEqual(SuggestionMode.appleIntelligence.statusTitle,"Apple Intelligence")
        XCTAssertEqual(SuggestionMode.localMatching.statusTitle,"Local matching")
        XCTAssertEqual(SuggestionMode.off.statusTitle,"Suggestions off")
    }

    func testResultFootnoteNamesTheModeTheResultsCameFrom() {
        XCTAssertEqual(SuggestionMode.resultSource(mode:.appleIntelligence,usedModel:true,retrieval:.local),
                       "Selected with Apple Intelligence. Reasons use your saved beer data.")
        XCTAssertEqual(SuggestionMode.resultSource(mode:.appleIntelligence,usedModel:true,retrieval:.semantic),
                       "Matched descriptions by meaning and selected with Apple Intelligence. Reasons use your saved beer data.")
        XCTAssertEqual(SuggestionMode.resultSource(mode:.appleIntelligence,usedModel:false,retrieval:.local),
                       "Local matches, not Apple Intelligence. Based on your recent tastings and taplist.")
        XCTAssertEqual(SuggestionMode.resultSource(mode:.localMatching,usedModel:false,retrieval:.local),
                       "Local matching. Picks from your recent tastings, your taplist and the styles you chose.")
    }

    func testLocalMatchingCopyNeverPromisesMoodUnderstanding() {
        let copy = [SuggestionMode.localMatching.homeTitle,SuggestionMode.localMatching.homeDetail,
                    SuggestionMode.localMatching.plate,SuggestionMode.localMatching.statusTitle,
                    SuggestionMode.resultSource(mode:.localMatching,usedModel:false,retrieval:.local)]
        for text in copy {
            XCTAssertFalse(text.localizedCaseInsensitiveContains("mood"),text)
            XCTAssertFalse(text.localizedCaseInsensitiveContains("describe"),text)
            XCTAssertFalse(text.localizedCaseInsensitiveContains("intelligence"),text)
        }
    }

    private struct Stop: Error {}

    func testForegroundingRechecksCapabilityImmediately() async {
        let inputs = Inputs()
        let modes = state(inputs)
        inputs.compatibility = .deviceNotEligible
        await modes.monitor(active:true,sleep:{ _ in throw Stop() })
        XCTAssertEqual(modes.mode,.localMatching)
    }

    func testBackgroundingRechecksOnceWithoutPolling() async {
        let inputs = Inputs()
        let modes = state(inputs)
        inputs.compatibility = .notEnabled
        var sleeps = 0
        await modes.monitor(active:false,sleep:{ _ in sleeps += 1 })
        XCTAssertEqual(modes.mode,.localMatching)
        XCTAssertEqual(sleeps,0)
    }

    func testPeriodicRecheckWhileActivePicksUpACapabilityChange() async {
        let inputs = Inputs()
        inputs.compatibility = .modelNotReady
        let modes = state(inputs)
        var intervals: [Duration] = []
        var observed: [SuggestionMode] = []
        await modes.monitor(active:true,sleep:{ interval in
            intervals.append(interval)
            observed.append(modes.mode)
            if intervals.count == 1 { inputs.compatibility = .appleIntelligence; return }
            throw Stop()
        })
        XCTAssertEqual(observed,[.localMatching,.appleIntelligence])
        XCTAssertEqual(intervals,[.seconds(15),.seconds(15)])
    }
}
