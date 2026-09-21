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
    // Optional for compatibility with choices saved before intent timestamps existed.
    var selectedAt: [String:Date]? = [:]
    var hasIntent: Bool { !selected.isEmpty || !queued.isEmpty || !laterTasted.isEmpty }
    init(taplist: [Beer], shown: [String], preferences: SuggestionPreferences, usedModel: Bool, taplistValidation: UUID? = nil) {
        self.taplist = taplist.map(ChoiceBeer.init); self.shown = shown
        self.preferences = preferences; self.usedModel = usedModel; self.taplistValidation = taplistValidation
    }
}
extension BeerDatabase {
    func setupChoiceContexts() throws {
        try execute("CREATE TABLE IF NOT EXISTS beer_choices(account TEXT NOT NULL,id TEXT NOT NULL,day REAL NOT NULL,context TEXT NOT NULL,has_intent INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account,id))")
        if try !rows("PRAGMA table_info(beer_choices)").contains(where:{ $0["name"] == "has_intent" }) {
            try execute("ALTER TABLE beer_choices ADD COLUMN has_intent INTEGER NOT NULL DEFAULT 0")
            for row in try rows("SELECT account,id,context FROM beer_choices") {
                let choice = try JSONDecoder().decode(BeerChoiceContext.self,from:Data((row["context"] ?? "").utf8))
                try execute("UPDATE beer_choices SET has_intent=? WHERE account=? AND id=?",[choice.hasIntent ? "1" : "0",row["account"],row["id"]])
            }
        }
    }
    func choiceContexts(account: String) throws -> [BeerChoiceContext] {
        try rows("SELECT context FROM beer_choices WHERE account=? ORDER BY day DESC,id DESC LIMIT 101",[account]).map {
            try JSONDecoder().decode(BeerChoiceContext.self,from:Data(($0["context"] ?? "").utf8))
        }
    }
    func saveChoicePresentation(_ choice: BeerChoiceContext, account: String) throws {
        guard !account.isEmpty else { throw BeerError.storage("Missing choice owner") }
        try transaction {
            let json = String(decoding:try JSONEncoder().encode(choice),as:UTF8.self)
            // A duplicate presentation ID must never replace its original taplist.
            try execute("INSERT OR IGNORE INTO beer_choices(account,id,day,context,has_intent) VALUES(?,?,?,?,?)",[account,choice.id,String(choice.presentedAt.timeIntervalSince1970),json,choice.hasIntent ? "1" : "0"])
            try pruneChoiceContexts(account:account)
        }
    }
    private func pruneChoiceContexts(account: String) throws {
        // A displayed but unused presentation must remain selectable, without
        // consuming any of the 100 retained intent records.
        for (intent,limit) in [("1",100),("0",1)] {
            try execute("DELETE FROM beer_choices WHERE account=? AND has_intent=? AND id NOT IN (SELECT id FROM beer_choices WHERE account=? AND has_intent=? ORDER BY day DESC,id DESC LIMIT \(limit))",[account,intent,account,intent])
        }
    }
    private func storeChoice(_ choice: BeerChoiceContext, account: String) throws {
        let json = String(decoding:try JSONEncoder().encode(choice),as:UTF8.self)
        // Caller owns the transaction: refresh already wraps feed observation,
        // while direct selection/outcome updates establish their own below.
        try execute("UPDATE beer_choices SET context=?,has_intent=? WHERE account=? AND id=?",[json,choice.hasIntent ? "1" : "0",account,choice.id])
        try pruneChoiceContexts(account:account)
    }
    func updateChoice(id: String, account: String, beerID: String, selected: Bool? = nil, outcome: CheckInResult? = nil, now: Date = Date()) throws {
        guard var choice = try choiceContexts(account:account).first(where:{ $0.id == id }), (choice.shown.contains(beerID) || choice.selected.contains(beerID)) else { return }
        if let selected {
            if selected {
                choice.selected.insert(beerID)
                var dates = choice.selectedAt ?? [:]
                dates[beerID] = dates[beerID] ?? now
                choice.selectedAt = dates
            } else {
                choice.selected.remove(beerID)
                choice.selectedAt?.removeValue(forKey:beerID)
            }
        }
        if let outcome {
            choice.outcomes[beerID] = outcome.rawValue
            if outcome == .added { choice.queued.insert(beerID); choice.queuedAt[beerID] = choice.queuedAt[beerID] ?? now }
        }
        try transaction { try storeChoice(choice,account:account) }
    }
    /// Evidence of later feed appearance, not proof that a particular queue entry was claimed.
    func observeChoiceTastings(_ beers: [Beer], previous: [Beer], account: String, now: Date = Date()) throws {
        let previousEvents = Set(previous.map { [$0.id,$0.roh_lap,$0.tasted_date] })
        let newBeers = beers.filter { !previousEvents.contains([$0.id,$0.roh_lap,$0.tasted_date]) }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier:"en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT:0)
        formatter.dateFormat = "MM/dd/yyyy"; formatter.isLenient = false
        for var choice in try choiceContexts(account:account) {
            // A feed refresh may finish before the POST acknowledgement. Preserve
            // that independent evidence without inventing queue acceptance.
            for beer in newBeers where (choice.selected.contains(beer.id) || choice.queued.contains(beer.id)) && !choice.laterTasted.contains(beer.id) {
                guard let intent = choice.selectedAt?[beer.id] ?? choice.queuedAt[beer.id],
                      let day = formatter.date(from:beer.tasted_date),
                      formatter.string(from:day) == beer.tasted_date,
                      intent <= now else { continue }
                // The feed supplies a calendar date without a timezone. Treat that
                // date as the union of possible venue days (UTC+14 through UTC−12),
                // rather than pretending it is midnight UTC. This also avoids DST
                // assumptions. We still require a newly observed, valid feed event;
                // overlap means compatible timing, not proof of a claimed queue entry.
                let earliest = day.addingTimeInterval(-14 * 60 * 60)
                let latest = day.addingTimeInterval(36 * 60 * 60)
                guard earliest <= now, latest > intent else { continue }
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
