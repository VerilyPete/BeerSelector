import Foundation

/// Local matching takes tri-state style chips instead of free text. Included
/// styles mean "any of these"; excluded styles are removed. The chips write one
/// canonical request in the existing style grammar, so nothing needs a model.
struct StyleChips: Equatable {
    enum State { case off, include, exclude }
    static let labels = SuggestionStyleRequest.labels
    private var states: [String:State] = [:]

    init() {}

    /// Converts only a fully recognized request. A mixed or unknown clause is
    /// never partially extracted, and exclusions never become inclusions.
    init?(request: String) {
        let parsed = SuggestionStyleRequest(request)
        // A style both included and excluded has no chip state that keeps the same beers.
        guard !parsed.needsModel, Set(parsed.includedLabels).isDisjoint(with:parsed.excludedLabels) else { return nil }
        for label in parsed.includedLabels { states[label] = .include }
        for label in parsed.excludedLabels { states[label] = .exclude }
    }

    var included: [String] { Self.labels.filter { states[$0] == .include } }
    var excluded: [String] { Self.labels.filter { states[$0] == .exclude } }
    func state(of label: String) -> State { states[label] ?? .off }

    mutating func set(_ label: String, _ state: State) { states[label] = state == .off ? nil : state }
    mutating func cycle(_ label: String) {
        switch state(of:label) {
        case .off: set(label,.include)
        case .include: set(label,.exclude)
        case .exclude: set(label,.off)
        }
    }

    /// Alternatives join with "|" and an exclusion clause starts with "not ".
    /// An empty clause is never written: a leading comma makes the grammar
    /// treat the request as unresolved wording.
    var request: String {
        func clause(_ labels: [String]) -> String { labels.map { $0.lowercased() }.joined(separator:"|") }
        return [clause(included), excluded.isEmpty ? "" : "not " + clause(excluded)]
            .filter { !$0.isEmpty }.joined(separator:",")
    }

    func spokenValue(of label: String) -> String {
        switch state(of:label) {
        case .off: return "not selected"
        case .include: return "included"
        case .exclude: return "excluded"
        }
    }
}
