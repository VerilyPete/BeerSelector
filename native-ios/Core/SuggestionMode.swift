import Foundation

enum SuggestionMode: Equatable {
    case appleIntelligence, localMatching, off

    @MainActor
    static func resolve(compatibility: RecommendationCompatibility, enabled: Bool, isMember: Bool) -> Self {
        guard enabled, isMember else { return .off }
        return compatibility == .appleIntelligence ? .appleIntelligence : .localMatching
    }
}

/// The one mode that Home, Settings, the sheet and the controller read, so a
/// label, an input and a result's provenance can never disagree.
@MainActor
final class SuggestionModeState: ObservableObject {
    @Published private(set) var mode: SuggestionMode
    private let compatibility: @MainActor () -> RecommendationCompatibility
    private let enabled: @MainActor () -> Bool
    private let isMember: @MainActor () -> Bool

    init(compatibility: @escaping @MainActor () -> RecommendationCompatibility = { .current },
         enabled: @escaping @MainActor () -> Bool,
         isMember: @escaping @MainActor () -> Bool) {
        self.compatibility = compatibility
        self.enabled = enabled
        self.isMember = isMember
        mode = SuggestionMode.resolve(compatibility:compatibility(),enabled:enabled(),isMember:isMember())
    }

    func refresh() {
        let next = SuggestionMode.resolve(compatibility:compatibility(),enabled:enabled(),isMember:isMember())
        if next != mode { mode = next }
    }

    /// A model download or a Settings change can alter availability without an
    /// app restart: recheck on every scene-phase change, and poll while active.
    func monitor(active: Bool, interval: Duration = .seconds(15),
                 sleep: (Duration) async throws -> Void = { try await Task.sleep(for:$0) }) async {
        refresh()
        guard active else { return }
        while !Task.isCancelled {
            do { try await sleep(interval) } catch { return }
            refresh()
        }
    }
}
