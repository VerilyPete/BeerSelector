import Foundation

enum SuggestionMode: Equatable {
    case appleIntelligence, localMatching, off

    @MainActor
    static func resolve(compatibility: RecommendationCompatibility, enabled: Bool, isMember: Bool) -> Self {
        guard enabled, isMember else { return .off }
        return compatibility == .appleIntelligence ? .appleIntelligence : .localMatching
    }
}

/// Every suggestion surface names its source. Local matching copy never
/// promises to understand moods: it ranks by tastings, taplist and styles.
extension SuggestionMode {
    /// Home's card title names who answers, so the mode stays visible without a row of its own.
    var homeTitle: String { self == .appleIntelligence ? "Ask Apple Intelligence" : "Local matching" }
    var homeDetail: String {
        self == .appleIntelligence ? "Describe a style or mood." : "Picks from your tasting history and the styles you choose."
    }
    var plate: String {
        switch self {
        case .appleIntelligence: return "APPLE INTELLIGENCE"
        case .localMatching: return "LOCAL MATCHING"
        case .off: return "SUGGESTIONS OFF"
        }
    }
    var symbol: String { self == .appleIntelligence ? "sparkles" : "line.3.horizontal.decrease.circle" }
    var statusTitle: String {
        switch self {
        case .appleIntelligence: return "Apple Intelligence"
        case .localMatching: return "Local matching"
        case .off: return "Suggestions off"
        }
    }
    static func resultSource(mode: SuggestionMode, usedModel: Bool, retrieval: RecommendationRetrievalSource) -> String {
        switch (mode,usedModel) {
        case (.appleIntelligence,true):
            return retrieval == .local ? "Selected with Apple Intelligence. Reasons use your saved beer data."
                : "Matched descriptions by meaning and selected with Apple Intelligence. Reasons use your saved beer data."
        case (.appleIntelligence,false):
            return "Local matches, not Apple Intelligence. Based on your recent tastings and taplist."
        default:
            return "Local matching. Picks from your recent tastings, your taplist and the styles you chose."
        }
    }
}

/// The one mode that Home, Settings, the sheet and the controller read, so a
/// label, an input and a result's provenance can never disagree.
@MainActor
final class SuggestionModeState: ObservableObject {
    @Published private(set) var mode: SuggestionMode
    @Published private(set) var compatibility: RecommendationCompatibility
    private let readCompatibility: @MainActor () -> RecommendationCompatibility
    private let enabled: @MainActor () -> Bool
    private let isMember: @MainActor () -> Bool

    init(compatibility: @escaping @MainActor () -> RecommendationCompatibility = { .current },
         enabled: @escaping @MainActor () -> Bool,
         isMember: @escaping @MainActor () -> Bool) {
        readCompatibility = compatibility
        self.enabled = enabled
        self.isMember = isMember
        let current = compatibility()
        self.compatibility = current
        mode = SuggestionMode.resolve(compatibility:current,enabled:enabled(),isMember:isMember())
    }

    func refresh() {
        let current = readCompatibility()
        if current != compatibility { compatibility = current }
        let next = SuggestionMode.resolve(compatibility:current,enabled:enabled(),isMember:isMember())
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
