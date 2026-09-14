import Foundation

/// Minimal immutable beer facts; no member identifiers, reviews or receipt codes.
struct ChoiceBeer: Codable, Equatable {
    var id: String
    var name: String
    var brewery: String
    var style: String
    var container: String
    var abv: Double?
    init(_ beer: Beer) {
        id = beer.id; name = beer.brew_name; brewery = beer.brewer
        style = beer.brew_style; container = beer.brew_container
        abv = beer.abv.flatMap { $0.isFinite ? $0 : nil }
    }
}
struct BeerChoiceContext: Codable, Equatable, Identifiable {
    var id = UUID().uuidString
    var presentedAt = Date()
    var taplistValidation: UUID?
    var taplist: [ChoiceBeer]
    var shown: [String]
    var preferences: SuggestionPreferences
    var usedModel: Bool
    var selected: Set<String> = []
    var queued: Set<String> = []
    var laterTasted: Set<String> = []
    var outcomes: [String:String] = [:]
    var queuedAt: [String:Date] = [:]
    init(taplist: [Beer], shown: [String], preferences: SuggestionPreferences, usedModel: Bool, taplistValidation: UUID? = nil) {
        self.taplist = taplist.map(ChoiceBeer.init); self.shown = shown
        self.preferences = preferences; self.usedModel = usedModel; self.taplistValidation = taplistValidation
    }
}
extension BeerDatabase {
    func setupChoiceContexts() throws {
        try execute("CREATE TABLE IF NOT EXISTS beer_choices(account TEXT NOT NULL,id TEXT NOT NULL,day REAL NOT NULL,context TEXT NOT NULL,PRIMARY KEY(account,id))")
    }
    func choiceContexts(account: String) throws -> [BeerChoiceContext] {
        try rows("SELECT context FROM beer_choices WHERE account=? ORDER BY day DESC,id DESC LIMIT 100",[account]).map {
            try JSONDecoder().decode(BeerChoiceContext.self,from:Data(($0["context"] ?? "").utf8))
        }
    }
    func saveChoicePresentation(_ choice: BeerChoiceContext, account: String) throws {
        guard !account.isEmpty else { throw BeerError.storage("Missing choice owner") }
        try transaction {
            let json = String(decoding:try JSONEncoder().encode(choice),as:UTF8.self)
            // A duplicate presentation ID must never replace its original taplist.
            try execute("INSERT OR IGNORE INTO beer_choices(account,id,day,context) VALUES(?,?,?,?)",[account,choice.id,String(choice.presentedAt.timeIntervalSince1970),json])
            try execute("DELETE FROM beer_choices WHERE account=? AND id NOT IN (SELECT id FROM beer_choices WHERE account=? ORDER BY day DESC,id DESC LIMIT 100)",[account,account])
        }
    }
    private func storeChoice(_ choice: BeerChoiceContext, account: String) throws {
        let json = String(decoding:try JSONEncoder().encode(choice),as:UTF8.self)
        try execute("UPDATE beer_choices SET context=? WHERE account=? AND id=?",[json,account,choice.id])
    }
    func updateChoice(id: String, account: String, beerID: String, selected: Bool? = nil, outcome: CheckInResult? = nil) throws {
        guard var choice = try choiceContexts(account:account).first(where:{ $0.id == id }), (choice.shown.contains(beerID) || choice.selected.contains(beerID)) else { return }
        if let selected {
            if selected { choice.selected.insert(beerID) } else { choice.selected.remove(beerID) }
        }
        if let outcome {
            choice.outcomes[beerID] = outcome.rawValue
            if outcome == .added { choice.queued.insert(beerID); choice.queuedAt[beerID] = choice.queuedAt[beerID] ?? Date() }
        }
        try storeChoice(choice,account:account)
    }
    /// Evidence of later feed appearance, not proof that a particular queue entry was claimed.
    func observeChoiceTastings(_ beers: [Beer], previous: [Beer], account: String) throws {
        let previousEvents = Set(previous.map { [$0.id,$0.roh_lap,$0.tasted_date] })
        let newBeers = beers.filter { !previousEvents.contains([$0.id,$0.roh_lap,$0.tasted_date]) }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier:"en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT:0)
        formatter.dateFormat = "MM/dd/yyyy"; formatter.isLenient = false
        for var choice in try choiceContexts(account:account) {
            for beer in newBeers where choice.queued.contains(beer.id) && !choice.laterTasted.contains(beer.id) {
                guard let queued = choice.queuedAt[beer.id], let day = formatter.date(from:beer.tasted_date),
                      formatter.string(from:day) == beer.tasted_date,
                      let queuedDay = formatter.date(from:formatter.string(from:queued)), day >= queuedDay, day <= Date() else { continue }
                choice.laterTasted.insert(beer.id)
            }
            try storeChoice(choice,account:account)
        }
    }
}

/// Bounded examples of intent in context. Unchosen availability is not negative feedback.
enum ChoiceModelInput {
    struct Example: Encodable {
        var date: Date
        var preferences: SuggestionPreferences
        var selected: [ChoiceBeer]
        var queuedTastingUnconfirmed: [ChoiceBeer]
        var laterAppearedInTastings: [ChoiceBeer]
        var shown: [ChoiceBeer]
        var availableStyleCounts: [String:Int]
    }
    static func examples(_ contexts: [BeerChoiceContext]) -> [Example] {
        contexts.filter { !$0.selected.isEmpty || !$0.queued.isEmpty }.prefix(4).map { choice in
            func beers(_ ids: Set<String>) -> [ChoiceBeer] {
                choice.taplist.filter { ids.contains($0.id) }.prefix(3).map { beer in
                    var compact = beer
                    compact.name = String(beer.name.prefix(60)); compact.brewery = String(beer.brewery.prefix(40))
                    compact.style = String(beer.style.prefix(32)); compact.container = String(beer.container.prefix(20))
                    return compact
                }
            }
            let counts = Dictionary(grouping:choice.taplist,by:{ String($0.style.prefix(32)).lowercased() }).mapValues(\.count)
            let keys = counts.keys.sorted { counts[$0]! == counts[$1]! ? $0 < $1 : counts[$0]! > counts[$1]! }.prefix(8)
            return Example(date:choice.presentedAt,preferences:choice.preferences,selected:beers(choice.selected),
                queuedTastingUnconfirmed:beers(choice.queued.subtracting(choice.laterTasted)),laterAppearedInTastings:beers(choice.laterTasted),
                shown:beers(Set(choice.shown)),availableStyleCounts:Dictionary(uniqueKeysWithValues:keys.map { ($0,counts[$0]!) }))
        }
    }
}
