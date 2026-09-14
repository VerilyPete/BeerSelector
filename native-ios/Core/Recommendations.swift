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
    // Optional storage preserves choice contexts saved before text requests existed.
    private var requestText: String? = nil
    var request: String {
        get { requestText ?? "" }
        set { requestText = newValue.isEmpty ? nil : String(newValue.prefix(160)) }
    }
    init(container: SuggestionContainer = .any, abv: SuggestionABV = .any, request: String = "") {
        self.container = container; self.abv = abv; self.request = request
    }
    enum CodingKeys: String, CodingKey { case container, abv; case requestText = "request" }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy:CodingKeys.self)
        container = try values.decode(SuggestionContainer.self,forKey:.container)
        abv = try values.decode(SuggestionABV.self,forKey:.abv)
        request = try values.decodeIfPresent(String.self,forKey:.requestText) ?? ""
    }
    var styleRequest: SuggestionStyleRequest { SuggestionStyleRequest(request) }
    func allows(_ beer: Beer) -> Bool {
        let container = beer.brew_container.lowercased()
        switch self.container {
        case .any: return true
        case .draft: return container.contains("draft") || container.contains("draught")
        case .bottle: return container.contains("bottle") && !container.contains("can")
        }
    }
    func candidates(from beers: [Beer]) -> [Beer] {
        let style = styleRequest
        let matching = beers.filter { allows($0) && style.allows($0) }
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
/// Deliberately small grammar: exact style names, alternatives, and explicit
/// exclusions. Comparisons and unknown wording stay model preferences, not guesses.
struct SuggestionStyleRequest {
    private struct Style {
        let label: String
        let aliases: [String]
        let pattern: String
    }
    private static let styles: [Style] = [
        .init(label:"IPA",aliases:["ipa","ipas","india pale ale"],pattern:#"\b(?:ipas?|india pale ale|neipa|dipa)\b"#),
        .init(label:"Stout",aliases:["stout","stouts"],pattern:#"\bstouts?\b"#),
        .init(label:"Porter",aliases:["porter","porters"],pattern:#"\bporters?\b"#),
        .init(label:"Lager",aliases:["lager","lagers"],pattern:#"\b(?:lager|pilsner|pilsener|helles|bock|marzen|märzen|schwarzbier)\b"#),
        .init(label:"Pilsner",aliases:["pilsner","pils","pilsener"],pattern:#"\b(?:pilsner|pilsener|pils)\b"#),
        .init(label:"Wheat",aliases:["wheat","wheat beer"],pattern:#"\b(?:wheat|hefe\s?weizen|weissbier|witbier)\b"#),
        .init(label:"Hefeweizen",aliases:["hefeweizen"],pattern:#"\bhefe\s?weizen\b"#),
        .init(label:"Witbier",aliases:["witbier"],pattern:#"\bwitbier\b"#),
        .init(label:"Sour",aliases:["sour","sours"],pattern:#"\b(?:sour|gose|lambic|gueuze|berliner weisse)\b"#),
        .init(label:"Saison",aliases:["saison","saisons"],pattern:#"\bsaison\b"#),
        .init(label:"Pale ale",aliases:["pale ale"],pattern:#"^(?!.*\b(?:india|ipa)\b).*\bpale ale\b"#),
        .init(label:"Amber ale",aliases:["amber","amber ale"],pattern:#"\bamber\b"#),
        .init(label:"Brown ale",aliases:["brown","brown ale"],pattern:#"\bbrown\b"#),
        .init(label:"Hazy",aliases:["hazy"],pattern:#"\b(?:hazy|new england|neipa)\b"#),
        .init(label:"Hazy IPA",aliases:["hazy ipa","new england ipa","neipa"],pattern:#"^(?=.*\b(?:hazy|new england|neipa)\b)(?=.*\b(?:ipa|india pale ale|neipa)\b).*"#),
        .init(label:"Double IPA",aliases:["double ipa","imperial ipa","dipa"],pattern:#"^(?:(?=.*\b(?:double|imperial)\b)(?=.*\b(?:ipa|india pale ale)\b).*|.*\bdipa\b.*)$"#),
        .init(label:"Dry stout",aliases:["dry stout","irish stout"],pattern:#"^(?=.*\b(?:dry|irish)\b)(?=.*\bstout\b).*"#),
        .init(label:"Imperial stout",aliases:["imperial stout"],pattern:#"^(?=.*\bimperial\b)(?=.*\bstout\b).*"#)
    ]
    private static func normalized(_ value: String) -> String {
        value.folding(options:[.caseInsensitive,.diacriticInsensitive],locale:Locale(identifier:"en_US_POSIX"))
            .replacingOccurrences(of:#"[^a-z0-9]+"#,with:" ",options:.regularExpression)
            .trimmingCharacters(in:.whitespaces)
    }
    private var positiveTerms: Set<String> = []
    private var negativeTerms: Set<String> = []
    private static func terms(_ value: String) -> Set<String> {
        let stop: Set<String> = ["a","an","the","i","me","my","you","your","want","please","beer","beers","something","some","with","without","not","no","or","and","but","like","than","to","for","of","it","is"]
        let variants = ["roasty":"roast","roasted":"roast","roasting":"roast","refreshing":"refresh","refreshingly":"refresh","hoppy":"hop","hops":"hop","malty":"malt","malts":"malt","fruity":"fruit","fruits":"fruit","chocolaty":"chocolate","chocolatey":"chocolate","citrusy":"citrus"]
        return Set(normalized(value).split(separator:" ").map(String.init).filter { !stop.contains($0) }.map { variants[$0] ?? $0 })
    }
    /// Retrieval hints, not semantic interpretation or hard eligibility. Score the
    /// whole eligible pool before capping it; negative wording never earns a boost.
    func relevance(of beer: Beer) -> Int {
        guard needsModel else { return 0 }
        let identity = Self.terms(beer.brew_name + " " + beer.brew_style + " " + beer.brewer)
        let description = Self.terms(beer.plainDescription)
        return 3 * positiveTerms.intersection(identity).count + positiveTerms.intersection(description).count
            - 3 * negativeTerms.intersection(identity.union(description)).count
    }
    func evidence(in candidates: [BeerSuggestion]) -> [String:[String]]? {
        guard needsModel else { return nil }
        let requested = positiveTerms.union(negativeTerms)
        return Dictionary(uniqueKeysWithValues:candidates.prefix(12).map { suggestion in
            let beer = suggestion.beer
            let metadata = Self.terms(beer.brew_name + " " + beer.brew_style + " " + beer.brewer + " " + beer.plainDescription)
            return (beer.id,requested.intersection(metadata).sorted())
        })
    }
    private var included: [Style] = []
    private var excluded: [Style] = []
    private(set) var needsModel = false
    var hasFilters: Bool { !included.isEmpty || !excluded.isEmpty }
    var summary: String {
        var parts: [String] = []
        if !included.isEmpty { parts.append("Style: " + included.map(\.label).joined(separator:" or ")) }
        if !excluded.isEmpty { parts.append("Exclude: " + excluded.map(\.label).joined(separator:", ")) }
        if needsModel { parts.append("Additional wording: Apple Intelligence preference") }
        return parts.joined(separator:" · ")
    }
    init(_ text: String) {
        let normalized = text.lowercased().trimmingCharacters(in:.whitespacesAndNewlines)
            .replacingOccurrences(of:#"\s+"#,with:" ",options:.regularExpression)
            .replacingOccurrences(of:#"\s+(?:but )?(?=not |no |without |exclude |nothing )"#,with:",",options:.regularExpression)
        guard !normalized.isEmpty else { return }
        var negative = false
        for raw in normalized.components(separatedBy:",") {
            var clause = raw.trimmingCharacters(in:.whitespacesAndNewlines)
            if let prefix = ["not ","no ","without ","exclude ","nothing "].first(where:{ clause.hasPrefix($0) }) {
                negative = true; clause.removeFirst(prefix.count)
            } else { negative = false }
            if negative { negativeTerms.formUnion(Self.terms(clause)) }
            else { positiveTerms.formUnion(Self.terms(clause)) }
            let alternatives = clause.replacingOccurrences(of:" or ",with:"|").components(separatedBy:"|")
            // Resolve the entire clause before applying it, so partial recognition
            // cannot turn "IPA or something refreshing" into an IPA-only search.
            let matches = alternatives.compactMap { value in
                Self.styles.first { $0.aliases.contains(value.trimmingCharacters(in:.whitespacesAndNewlines)) }
            }
            guard matches.count == alternatives.count else { needsModel = true; continue }
            if negative { excluded += matches } else { included += matches }
        }
    }
    func allows(_ beer: Beer) -> Bool {
        guard hasFilters else { return true }
        let style = Self.normalized(beer.brew_style)
        guard !style.isEmpty else { return false } // Unknown style cannot establish a match or exclusion.
        func matches(_ rule: Style) -> Bool { style.range(of:rule.pattern,options:.regularExpression) != nil }
        return (included.isEmpty || included.contains(where:matches)) && !excluded.contains(where:matches)
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
    // Ratings remain durable per upstream ID. Resolve packaging duplicates only
    // when reading them: newest explicit intent wins; legacy/tied timestamps
    // conservatively favor dislike, then ID for order-independent results.
    private static func newerFeedback(_ lhs: BeerFeedback, than rhs: BeerFeedback) -> Bool {
        let left = lhs.ratedAt ?? .distantPast, right = rhs.ratedAt ?? .distantPast
        if left != right { return left > right }
        if lhs.rating != rhs.rating { return lhs.rating == .notForMe }
        return lhs.id < rhs.id
    }
    struct FeedbackIndex {
        private var byID: [String:BeerFeedback] = [:]
        private var byRecipe: [String:BeerFeedback] = [:]
        private var effective: [String:BeerFeedback] = [:]
        init(_ feedback: [BeerFeedback]) {
            func retainLatest(_ item: BeerFeedback, key: String, in values: inout [String:BeerFeedback]) {
                if let previous = values[key], !newerFeedback(item,than:previous) { return }
                values[key] = item
            }
            for item in feedback {
                let identity = beerIdentity(item.beer)
                retainLatest(item,key:item.id,in:&byID)
                if let identity { retainLatest(item,key:identity,in:&byRecipe) }
                retainLatest(item,key:identity.map { "recipe:" + $0 } ?? "id:" + item.id,in:&effective)
            }
        }
        var resolved: [BeerFeedback] { effective.keys.sorted().compactMap { effective[$0] } }
        func rating(for beer: Beer) -> BeerRating? {
            let exact = byID[beer.id]
            let recipe = beerIdentity(beer).flatMap { byRecipe[$0] }
            if let exact, let recipe { return newerFeedback(exact,than:recipe) ? exact.rating : recipe.rating }
            return (exact ?? recipe)?.rating
        }
    }
    static func resolvedFeedback(_ feedback: [BeerFeedback]) -> [BeerFeedback] { FeedbackIndex(feedback).resolved }
    static func rating(for beer: Beer, feedback: [BeerFeedback]) -> BeerRating? { FeedbackIndex(feedback).rating(for:beer) }
    static func dislikedIDs(in beers: [Beer], feedback: [BeerFeedback]) -> Set<String> {
        let index = FeedbackIndex(feedback)
        return Set(beers.filter { index.rating(for:$0) == .notForMe }.map(\.id))
    }
    /// Relative strength is calculated before presentation-only variety rules.
    /// Generation and submission share this eligibility policy.
    static func eligible(taplist: [Beer], history: [Beer], excluded: Set<String>, feedback: [BeerFeedback], preferences: SuggestionPreferences) -> [Beer] {
        var seen: Set<String> = []
        let ratings = FeedbackIndex(feedback)
        return preferences.candidates(from:excludingRecent(taplist,history:history).filter {
            !$0.id.isEmpty && !excluded.contains($0.id) && ratings.rating(for:$0) != .notForMe && seen.insert($0.id).inserted
        })
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
    static func shortlist(taplist: [Beer], history: [Beer], excluded: Set<String>, feedback: [BeerFeedback] = [], preferences: SuggestionPreferences = .init(), context: [BeerChoiceContext] = [], presentationExcluded: Set<String> = []) -> [BeerSuggestion] {
        let effectiveFeedback = resolvedFeedback(feedback)
        func normalized(_ value: String) -> String { value.trimmingCharacters(in:.whitespacesAndNewlines).lowercased() }
        let styles = Set(history.map { styleFamily($0.brew_style) }.filter { !$0.isEmpty })
        let breweries = Set(history.map { normalized($0.brewer) }.filter { !$0.isEmpty })
        let likedStyles = Set(effectiveFeedback.filter { $0.rating == .liked }.map { styleFamily($0.beer.brew_style) }.filter { !$0.isEmpty })
        let dislikedStyles = Set(effectiveFeedback.filter { $0.rating == .notForMe }.map { styleFamily($0.beer.brew_style) }.filter { !$0.isEmpty })
        let queuedStyles = Set(context.flatMap { choice in choice.taplist.filter { choice.queued.contains($0.id) }.map { styleFamily($0.style) } }.filter { !$0.isEmpty })
        let selectedStyles = Set(context.flatMap { choice in choice.taplist.filter { choice.selected.contains($0.id) }.map { styleFamily($0.style) } }.filter { !$0.isEmpty })
        var pool = eligible(taplist:taplist,history:history,excluded:excluded,feedback:feedback,preferences:preferences).filter { !presentationExcluded.contains($0.id) }
        let request = preferences.styleRequest
        let relevance = Dictionary(uniqueKeysWithValues:pool.map { ($0.id,request.relevance(of:$0)) })
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
                // With nuanced requests, reserve coverage for other eligible
                // styles before filling the remaining slots with repeats. This
                // also gives the model options for moods without literal matches.
                if request.needsModel {
                    let leftSeen = chosenStyles.contains(styleFamily($0.brew_style))
                    let rightSeen = chosenStyles.contains(styleFamily($1.brew_style))
                    if leftSeen != rightSeen { return !leftSeen }
                }
                if relevance[$0.id] != relevance[$1.id] { return relevance[$0.id]! > relevance[$1.id]! }
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
        let feedbackIndex = RecommendationRules.FeedbackIndex(feedback)
        let effectiveFeedback = feedbackIndex.resolved
        var styles: [String] = [], breweries: [String] = []
        func index(_ value: String, in values: inout [String]) -> String {
            if let i = values.firstIndex(of:value) { return String(i) }
            values.append(value); return String(values.count-1)
        }
        let repeatIDs = Set(RecommendationRules.repeatWindow(history).map(\.id))
        func row(_ beer: Beer, candidate: Bool) -> [String] {
            [candidate ? beer.id : "",String(beer.brew_name.prefix(60)),
             index(String(beer.brew_style.prefix(32)),in:&styles),
             index(String(beer.brewer.prefix(40)),in:&breweries),feedbackIndex.rating(for:beer)?.rawValue ?? "unrated",candidate ? (beer.abv.map { String($0) } ?? "unknown") : "",beer.brew_container,beer.tasted_date,repeatIDs.contains(beer.id) ? "yes" : "no"]
        }
        let recent = history.prefix(100).map { row($0,candidate:false) }
        let choices = candidates.prefix(12).map { row($0.beer,candidate:true) }
        // Feedback outside the rolling cache still influences candidate ranking
        // and this bounded style summary. No feedback records are deleted here.
        var totals: [String:[Int]] = [:]
        for item in effectiveFeedback {
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
            let candidateRequestTerms: [String:[String]]?
        }
        let input = Input(columns:["candidateID","name","styleIndex","breweryIndex","explicitRating","abvPercent","container","tastedDate","avoidRepeat"],styles:styles,breweries:breweries,
                          recentTastings:recent,candidates:choices,feedbackStyleColumns:["style","liked","notForMe"],feedbackByStyle:preferences,selectionPreferences:selection,choiceExamples:ChoiceModelInput.examples(context),candidateRequestTerms:selection.styleRequest.evidence(in:candidates))
        return String(decoding:try JSONEncoder().encode(input),as:UTF8.self)
    }
}
