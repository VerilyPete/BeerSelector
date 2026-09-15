import Foundation

/// Local ordering of a pool whose hard eligibility has already been resolved.
/// Personal affinity is local; a future semantic adapter receives only public facts.
struct LocalTaplistRetriever {
    let eligible: [Beer]
    let history: [Beer]
    var feedback: [BeerFeedback] = []
    var preferences = SuggestionPreferences()
    var context: [BeerChoiceContext] = []

    func candidates(previousIDs: Set<String> = []) -> [BeerSuggestion] {
        func ordered(excluding ids: Set<String>) -> [BeerSuggestion] {
            RecommendationRules.shortlistEligible(eligible,history:history,feedback:feedback,
                preferences:preferences,context:context,presentationExcluded:ids)
        }
        var unseen = ordered(excluding:previousIDs)
        guard unseen.count < min(3,eligible.count) else { return unseen }
        let fallback = ordered(excluding:[])
        guard !unseen.isEmpty else { return fallback }
        let ids = Set(unseen.map(\.id))
        unseen += fallback.filter { !ids.contains($0.id) }.prefix(3-unseen.count)
        return unseen
    }
}
