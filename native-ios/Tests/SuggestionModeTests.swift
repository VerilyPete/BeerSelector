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
