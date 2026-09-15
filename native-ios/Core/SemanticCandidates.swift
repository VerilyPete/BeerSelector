import Foundation

enum SemanticCandidates {
    static func excerpt(_ text: String) -> String {
        String(String.UnicodeScalarView(text.unicodeScalars.prefix(320)))
    }
    static func evidence(_ candidates: [BeerSuggestion]) -> [String:String]? {
        var result: [String:String] = [:]
        for item in candidates.prefix(12) {
            if let evidence = item.semanticEvidence { result[item.id] = excerpt(evidence) }
        }
        return result.isEmpty ? nil : result
    }
    static func merge(ids: [String], local: LocalTaplistRetriever, previousIDs: Set<String>) -> [BeerSuggestion] {
        let fallback = local.candidates(previousIDs:previousIDs)
        let unseen = local.eligible.filter { !previousIDs.contains($0.id) }
        guard !unseen.isEmpty else { return fallback }
        let allowed = Dictionary(local.eligible.map { ($0.id,$0) },uniquingKeysWith:{ first,_ in first })
        var seen: Set<String> = []
        let semantic = ids.prefix(24).filter { allowed[$0] != nil && !previousIDs.contains($0) && seen.insert($0).inserted }
        guard !semantic.isEmpty else { return fallback }
        let limit = unseen.count < 3 ? min(3,allowed.count) : 12
        var merged: [BeerSuggestion] = []
        func appendSemantic(_ id: String) {
            guard merged.count < limit, !merged.contains(where:{ $0.id == id }), let beer = allowed[id],
                  var suggestion = RecommendationRules.shortlistEligible([beer],history:local.history,feedback:local.feedback,
                      preferences:local.preferences,context:local.context).first else { return }
            suggestion.semanticEvidence = excerpt(beer.plainDescription)
            merged.append(suggestion)
        }
        for id in semantic.prefix(6) { appendSemantic(id) }
        for item in fallback where merged.count < limit && !merged.contains(where:{ $0.id == item.id }) { merged.append(item) }
        for id in semantic { appendSemantic(id) }
        return merged
    }
}
