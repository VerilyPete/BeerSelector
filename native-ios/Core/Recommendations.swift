import Foundation

struct BeerSuggestion: Identifiable, Equatable {
    var beer: Beer
    var reason: String
    var id: String { beer.id }
}
enum SuggestionContainer: String, CaseIterable, Codable {
    case any = "Any", draft = "Draft only", bottle = "Bottles only"
}
enum SuggestionABV: String, CaseIterable, Codable {
    case any = "Any", lower = "Lower", higher = "Higher"
}
struct SuggestionPreferences: Equatable, Codable {
    var container: SuggestionContainer = .any
    var abv: SuggestionABV = .any
    func allows(_ beer: Beer) -> Bool {
        let container = beer.brew_container.lowercased()
        switch self.container {
        case .any: return true
        case .draft: return container.contains("draft") || container.contains("draught")
        case .bottle: return container.contains("bottle") && !container.contains("can")
        }
    }
    func candidates(from beers: [Beer]) -> [Beer] {
        let matching = beers.filter(allows)
        guard abv != .any else { return matching }
        let known = matching.filter { $0.abv.map { $0.isFinite && $0 >= 0 } == true }.sorted {
            if $0.abv == $1.abv { return $0.id < $1.id }
            return abv == .lower ? $0.abv! < $1.abv! : $0.abv! > $1.abv!
        }
        // Relative preference: keep the requested half of known strengths,
        // with enough room for three choices when available. Never widen to
        // unknown strengths or another container just to fill the cards.
        return Array(known.prefix(max(3,(known.count+1)/2)))
    }
}
enum RecommendationRules {
    private static func beerIdentity(_ beer: Beer) -> String? {
        func normalized(_ value: String) -> String {
            value.folding(options:[.caseInsensitive,.diacriticInsensitive],locale:Locale(identifier:"en_US_POSIX"))
                .replacingOccurrences(of:#"\s+"#,with:" ",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines)
        }
        let brewery = normalized(beer.brewer)
        guard !brewery.isEmpty else { return nil }
        // Strip only terminal packaging labels, never style/recipe words.
        let packaging = #"(?i)(?:\s*(?:\((?:draft|draught|bottles?|btl|cans?)\)|\[(?:draft|draught|bottles?|btl|cans?)\])|\s+(?:[-–—]\s*)?(?:\d+(?:\.\d+)?\s*(?:oz|ml|cl|l)\s+)?(?:draft|draught|bottles?|btl|cans?))\s*$"#
        let name = normalized(beer.brew_name.replacingOccurrences(of:packaging,with:"",options:.regularExpression))
        guard !name.isEmpty else { return nil }
        return brewery + "|" + name
    }
    /// Upstream tasting dates have day precision. Use today plus the previous
    /// 29 UTC calendar dates; undated entries are conservatively excluded.
    static func repeatWindow(_ history: [Beer], now: Date = Date()) -> [Beer] {
        var calendar = Calendar(identifier:.gregorian); calendar.timeZone = TimeZone(secondsFromGMT:0)!
        let today = calendar.startOfDay(for:now)
        let cutoff = calendar.date(byAdding:.day,value:-29,to:today)!
        let formatter = DateFormatter(); formatter.locale = Locale(identifier:"en_US_POSIX")
        formatter.timeZone = calendar.timeZone; formatter.dateFormat = "MM/dd/yyyy"; formatter.isLenient = false
        return history.filter { beer in
            guard let day = formatter.date(from:beer.tasted_date), formatter.string(from:day) == beer.tasted_date else { return true }
            return day >= cutoff && day <= today
        }
    }
    static func recentlyTasted(_ beer: Beer, history: [Beer]) -> Bool {
        let identity = beerIdentity(beer)
        return repeatWindow(history).contains { prior in
            prior.id == beer.id || (identity != nil && identity == beerIdentity(prior))
        }
    }
    static func excludingRecent(_ beers: [Beer], history: [Beer]) -> [Beer] {
        let recent = repeatWindow(history)
        let ids = Set(recent.map(\.id))
        let identities = Set(recent.compactMap(beerIdentity))
        return beers.filter { beer in
            !ids.contains(beer.id) && beerIdentity(beer).map { !identities.contains($0) } != false
        }
    }
    private static func styleFamily(_ value: String) -> String {
        let text = value.trimmingCharacters(in:.whitespacesAndNewlines).lowercased()
        if text.split(whereSeparator:{ !$0.isLetter }).contains("ipa") || text.contains("india pale ale") { return "ipa" }
        return text
    }
    static func shortlist(taplist: [Beer], history: [Beer], excluded: Set<String>, feedback: [BeerFeedback] = [], preferences: SuggestionPreferences = .init(), context: [BeerChoiceContext] = []) -> [BeerSuggestion] {
        let excluded = excluded.union(feedback.filter { $0.rating == .notForMe }.map(\.id))
        func normalized(_ value: String) -> String { value.trimmingCharacters(in:.whitespacesAndNewlines).lowercased() }
        let styles = Set(history.map { styleFamily($0.brew_style) }.filter { !$0.isEmpty })
        let breweries = Set(history.map { normalized($0.brewer) }.filter { !$0.isEmpty })
        let likedStyles = Set(feedback.filter { $0.rating == .liked }.map { styleFamily($0.beer.brew_style) }.filter { !$0.isEmpty })
        let dislikedStyles = Set(feedback.filter { $0.rating == .notForMe }.map { styleFamily($0.beer.brew_style) }.filter { !$0.isEmpty })
        let queuedStyles = Set(context.flatMap { choice in choice.taplist.filter { choice.queued.contains($0.id) }.map { styleFamily($0.style) } }.filter { !$0.isEmpty })
        let selectedStyles = Set(context.flatMap { choice in choice.taplist.filter { choice.selected.contains($0.id) }.map { styleFamily($0.style) } }.filter { !$0.isEmpty })
        var seen: Set<String> = []
        var pool = preferences.candidates(from:excludingRecent(taplist,history:history).filter { !$0.id.isEmpty && !excluded.contains($0.id) && seen.insert($0.id).inserted })
        var result: [BeerSuggestion] = []
        var chosenStyles: Set<String> = [], chosenBreweries: Set<String> = []
        func score(_ beer: Beer) -> Int {
            let style = styleFamily(beer.brew_style), brewery = normalized(beer.brewer)
            return (likedStyles.contains(style) ? 10 : 0) - (dislikedStyles.contains(style) ? 8 : 0) + (styles.contains(style) ? 6 : 0) + (breweries.contains(brewery) ? 3 : 0)
                + (queuedStyles.contains(style) ? 2 : selectedStyles.contains(style) ? 1 : 0)
                - (chosenStyles.contains(style) ? 4 : 0) - (chosenBreweries.contains(brewery) ? 4 : 0)
        }
        while !pool.isEmpty && result.count < 12 {
            pool.sort {
                if preferences.abv != .any, $0.abv != $1.abv {
                    return preferences.abv == .lower ? $0.abv! < $1.abv! : $0.abv! > $1.abv!
                }
                return score($0) == score($1) ? $0.id < $1.id : score($0) > score($1)
            }
            let beer = pool.removeFirst()
            let style = styleFamily(beer.brew_style), brewery = normalized(beer.brewer)
            let reason: String
            if likedStyles.contains(style) { reason = "A style from beers you liked: \(beer.brew_style)." }
            else if styles.contains(style) { reason = "A style related to your recent tastings: \(beer.brew_style)." }
            else if breweries.contains(brewery) { reason = "A different beer from \(beer.brewer), a brewery in your recent tastings." }
            else { reason = history.isEmpty ? "A choice from this location’s taplist." : "Something different from your recent tastings." }
            result.append(BeerSuggestion(beer:beer,reason:reason))
            if !style.isEmpty { chosenStyles.insert(style) }
            if !brewery.isEmpty { chosenBreweries.insert(brewery) }
        }
        return result
    }
    static func choose(ids: [String], from shortlist: [BeerSuggestion]) -> [BeerSuggestion]? {
        guard ids.count == min(3,shortlist.count), Set(ids).count == ids.count else { return nil }
        let choices = ids.compactMap { id in shortlist.first { $0.id == id } }
        return choices.count == ids.count ? choices : nil
    }
}

@MainActor protocol RecommendationProvider {
    func rank(history: [Beer], candidates: [BeerSuggestion]) async throws -> [String]
    func rank(history: [Beer], candidates: [BeerSuggestion], feedback: [BeerFeedback]) async throws -> [String]
    func rank(history: [Beer], candidates: [BeerSuggestion], feedback: [BeerFeedback], preferences: SuggestionPreferences) async throws -> [String]
    func rank(history: [Beer], candidates: [BeerSuggestion], feedback: [BeerFeedback], preferences: SuggestionPreferences, context: [BeerChoiceContext]) async throws -> [String]
}
extension RecommendationProvider {
    func rank(history: [Beer], candidates: [BeerSuggestion], feedback: [BeerFeedback], preferences: SuggestionPreferences, context: [BeerChoiceContext]) async throws -> [String] {
        try await rank(history:history,candidates:candidates,feedback:feedback,preferences:preferences)
    }
    func rank(history: [Beer], candidates: [BeerSuggestion], feedback: [BeerFeedback], preferences: SuggestionPreferences) async throws -> [String] {
        try await rank(history:history,candidates:candidates,feedback:feedback)
    }
    func rank(history: [Beer], candidates: [BeerSuggestion], feedback: [BeerFeedback]) async throws -> [String] {
        try await rank(history:history,candidates:candidates)
    }
}

/// Compact row encoding lets the model see all 100 recent tastings without
/// repeating JSON field names or full descriptions for every beer.
enum RecommendationModelInput {
    static func prompt(history: [Beer], candidates: [BeerSuggestion], feedback: [BeerFeedback], preferences selection: SuggestionPreferences = .init(), context: [BeerChoiceContext] = []) throws -> String {
        var styles: [String] = [], breweries: [String] = []
        func index(_ value: String, in values: inout [String]) -> String {
            if let i = values.firstIndex(of:value) { return String(i) }
            values.append(value); return String(values.count-1)
        }
        let repeatIDs = Set(RecommendationRules.repeatWindow(history).map(\.id))
        let ratings = Dictionary(feedback.map { ($0.id,$0.rating.rawValue) },uniquingKeysWith:{ _,new in new })
        func row(_ beer: Beer, candidate: Bool) -> [String] {
            [candidate ? beer.id : "",String(beer.brew_name.prefix(60)),
             index(String(beer.brew_style.prefix(32)),in:&styles),
             index(String(beer.brewer.prefix(40)),in:&breweries),ratings[beer.id] ?? "unrated",candidate ? (beer.abv.map { String($0) } ?? "unknown") : "",beer.brew_container,beer.tasted_date,repeatIDs.contains(beer.id) ? "yes" : "no"]
        }
        let recent = history.prefix(100).map { row($0,candidate:false) }
        let choices = candidates.prefix(12).map { row($0.beer,candidate:true) }
        // Feedback outside the rolling cache still influences candidate ranking
        // and this bounded style summary. No feedback records are deleted here.
        var totals: [String:[Int]] = [:]
        for item in feedback {
            let style = String(item.beer.brew_style.prefix(32)).lowercased()
            guard !style.isEmpty else { continue }
            var counts = totals[style] ?? [0,0]; counts[item.rating == .liked ? 0 : 1] += 1; totals[style] = counts
        }
        let preferences = totals.keys.sorted {
            let a = totals[$0]!.reduce(0,+), b = totals[$1]!.reduce(0,+)
            return a == b ? $0 < $1 : a > b
        }.prefix(12).map { [$0,String(totals[$0]![0]),String(totals[$0]![1])] }
        struct Input: Encodable {
            let columns: [String]; let styles: [String]; let breweries: [String]
            let recentTastings: [[String]]; let candidates: [[String]]
            let feedbackStyleColumns: [String]; let feedbackByStyle: [[String]]
            let selectionPreferences: SuggestionPreferences
            let choiceExamples: [ChoiceModelInput.Example]
        }
        let input = Input(columns:["candidateID","name","styleIndex","breweryIndex","explicitRating","abvPercent","container","tastedDate","avoidRepeat"],styles:styles,breweries:breweries,
                          recentTastings:recent,candidates:choices,feedbackStyleColumns:["style","liked","notForMe"],feedbackByStyle:preferences,selectionPreferences:selection,choiceExamples:ChoiceModelInput.examples(context))
        return String(decoding:try JSONEncoder().encode(input),as:UTF8.self)
    }
}
