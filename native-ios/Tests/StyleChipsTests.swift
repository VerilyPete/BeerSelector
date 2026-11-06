import XCTest
@testable import BeerSelectorNative

/// Local matching takes style chips instead of free text. The chips serialize to
/// the existing style grammar, so they must select exactly the beers that the
/// natural phrasing ("IPA or Stout, not Hazy") selects.
final class StyleChipsTests: XCTestCase {
    private func beer(_ id: String, style: String) -> Beer {
        var b = Beer(id:id,name:"Beer \(id)"); b.brew_style = style; return b
    }
    private lazy var beers: [Beer] = [
        "American IPA","New England India Pale Ale","Hazy Pale Ale","Double IPA","Imperial IPA","Imperial Stout",
        "Irish Dry Stout","Milk Stout","Robust Porter","German Pilsner","Helles Lager","Maibock","Hefeweizen",
        "Belgian Witbier","Wheat Ale","Gose","Berliner Weisse","Saison","American Pale Ale","Amber Ale",
        "Brown Ale","Flight","",
    ].enumerated().map { beer(String($0.offset),style:$0.element) }

    private func natural(_ chips: StyleChips) -> String {
        let include = chips.included.map { $0.lowercased() }.joined(separator:" or ")
        let exclude = chips.excluded.map { $0.lowercased() }.joined(separator:" or ")
        return [include, exclude.isEmpty ? "" : "not " + exclude].filter { !$0.isEmpty }.joined(separator:", ")
    }

    private func assertRoundTripAndEligibility(_ chips: StyleChips, file: StaticString = #filePath, line: UInt = #line) throws {
        let preferences = SuggestionPreferences(request:chips.request)
        XCTAssertEqual(preferences.request,chips.request,"stored without truncation",file:file,line:line)
        XCTAssertFalse(preferences.styleRequest.needsModel,chips.request,file:file,line:line)
        let decoded = try JSONDecoder().decode(SuggestionPreferences.self,from:JSONEncoder().encode(preferences))
        XCTAssertEqual(StyleChips(request:decoded.request),chips,chips.request,file:file,line:line)
        let grammar = SuggestionStyleRequest(natural(chips))
        XCTAssertFalse(grammar.needsModel,natural(chips),file:file,line:line)
        XCTAssertEqual(preferences.candidates(from:beers).map(\.id),beers.filter(grammar.allows).map(\.id),
                       "\(chips.request) vs \(natural(chips))",file:file,line:line)
    }

    func testEveryStyleCyclesOffIncludeExcludeOff() throws {
        for label in StyleChips.labels {
            var chips = StyleChips()
            XCTAssertEqual(chips.state(of:label),.off)
            chips.cycle(label)
            XCTAssertEqual(chips.state(of:label),.include,label)
            XCTAssertEqual(chips.included,[label])
            try assertRoundTripAndEligibility(chips)
            chips.cycle(label)
            XCTAssertEqual(chips.state(of:label),.exclude,label)
            XCTAssertEqual(chips.excluded,[label])
            XCTAssertTrue(chips.included.isEmpty)
            try assertRoundTripAndEligibility(chips)
            chips.cycle(label)
            XCTAssertEqual(chips,StyleChips(),label)
        }
    }

    func testSerializerWritesOnlyNonEmptyClausesInStyleOrder() {
        XCTAssertEqual(StyleChips().request,"")
        var exclusionOnly = StyleChips()
        exclusionOnly.set("Stout",.exclude)
        XCTAssertEqual(exclusionOnly.request,"not stout")
        var both = StyleChips()
        both.set("Hazy",.exclude); both.set("Stout",.include); both.set("Sour",.exclude); both.set("IPA",.include)
        XCTAssertEqual(both.request,"ipa|stout,not sour|hazy")
    }

    func testAllIncludedAndAllExcludedFitTheRequestCap() throws {
        var all = StyleChips(), none = StyleChips()
        for label in StyleChips.labels { all.set(label,.include); none.set(label,.exclude) }
        XCTAssertLessThanOrEqual(all.request.count,160)
        XCTAssertLessThanOrEqual(none.request.count,160)
        XCTAssertEqual(none.request.count,150,"the worst case the plan budgets for")
        try assertRoundTripAndEligibility(all)
        try assertRoundTripAndEligibility(none)
    }

    func testEveryPairOfStylesInEveryStateMatchesTheNaturalGrammar() throws {
        let labels = StyleChips.labels
        for (i,first) in labels.enumerated() {
            for second in labels[(i+1)...] {
                for a in [StyleChips.State.include,.exclude] {
                    for b in [StyleChips.State.include,.exclude] {
                        var chips = StyleChips()
                        chips.set(first,a); chips.set(second,b)
                        try assertRoundTripAndEligibility(chips)
                    }
                }
            }
        }
    }

    func testSeededMixedSelectionsMatchTheNaturalGrammar() throws {
        var seed: UInt64 = 0x5EED
        func next() -> UInt64 { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return seed >> 33 }
        for _ in 0..<300 {
            var chips = StyleChips()
            for label in StyleChips.labels {
                switch next() % 4 {
                case 0: chips.set(label,.include)
                case 1: chips.set(label,.exclude)
                default: break
                }
            }
            try assertRoundTripAndEligibility(chips)
        }
    }

    func testGrammarAcceptsThePipeSeparatorTheChipsDependOn() {
        let request = SuggestionStyleRequest("ipa|stout")
        XCTAssertFalse(request.needsModel)
        XCTAssertEqual(SuggestionPreferences(request:"ipa|stout").candidates(from:beers).map(\.id),
                       SuggestionPreferences(request:"ipa or stout").candidates(from:beers).map(\.id))
        XCTAssertEqual(SuggestionPreferences(request:"not porter|sour").candidates(from:beers).map(\.id),
                       SuggestionPreferences(request:"not porter or sour").candidates(from:beers).map(\.id))
    }

    func testAnExclusionAfterACommaIsStillFullyRecognized() {
        let request = SuggestionStyleRequest("IPA, not hazy")
        XCTAssertFalse(request.needsModel,"the space before 'not' must not leave an empty, unresolved clause")
        XCTAssertEqual(request.summary,"Style: IPA · Exclude: Hazy")
        XCTAssertTrue(SuggestionStyleRequest("IPA, crisp").needsModel)
    }

    func testOnlyFullyRecognizedRequestsConvertToChips() {
        let clean = StyleChips(request:"IPA, not hazy")
        XCTAssertEqual(clean?.included,["IPA"])
        XCTAssertEqual(clean?.excluded,["Hazy"])
        let exclusion = StyleChips(request:"no stout or porter")
        XCTAssertEqual(exclusion?.included,[])
        XCTAssertEqual(exclusion?.excluded,["Stout","Porter"])
        XCTAssertEqual(StyleChips(request:""),StyleChips())
        XCTAssertNil(StyleChips(request:"IPA or something refreshing"),"never partially extracted")
        XCTAssertNil(StyleChips(request:"crisp and refreshing"))
        XCTAssertNil(StyleChips(request:"IPA, crisp"),"a recognized clause beside an unknown one is still mixed")
        XCTAssertNil(StyleChips(request:"IPA, not IPA"),"a style both included and excluded has no faithful chip state")
        XCTAssertNil(StyleChips(request:"stout or porter, no stout"))
    }

    func testChipsSelectTheExpectedBeers() {
        func ids(_ states: [(String,StyleChips.State)]) -> [String] {
            var chips = StyleChips()
            for (label,state) in states { chips.set(label,state) }
            return SuggestionPreferences(request:chips.request).candidates(from:beers).map(\.id)
        }
        XCTAssertEqual(ids([("Stout",.include)]),["5","6","7"])
        XCTAssertEqual(ids([("Hazy IPA",.include)]),["1"])
        XCTAssertEqual(ids([("IPA",.include),("Hazy",.exclude)]),["0","3","4"])
        XCTAssertEqual(ids([("Lager",.include)]),["9","10"],"Maibock has no word boundary before bock")
        XCTAssertEqual(ids([("Pilsner",.include)]),["9"])
        XCTAssertEqual(ids([("Lager",.include),("Pilsner",.exclude)]),["10"])
        XCTAssertEqual(ids([("Sour",.include)]),["15","16"])
        XCTAssertEqual(ids([("Stout",.exclude)]).count,beers.count - 3 - 1,"an exclusion also drops the beer with no style")
    }

    func testConvertingARequestKeepsTheSameBeers() {
        for request in ["IPA, not hazy","no stout or porter","stout or porter","lager, not pilsner"] {
            let chips = StyleChips(request:request)
            XCTAssertNotNil(chips,request)
            XCTAssertEqual(SuggestionPreferences(request:chips?.request ?? "").candidates(from:beers).map(\.id),
                           SuggestionPreferences(request:request).candidates(from:beers).map(\.id),request)
        }
    }

    func testChipsSpeakTheirStateWithoutRelyingOnColor() {
        var chips = StyleChips()
        XCTAssertEqual(chips.spokenValue(of:"Stout"),"not selected")
        chips.cycle("Stout")
        XCTAssertEqual(chips.spokenValue(of:"Stout"),"included")
        chips.cycle("Stout")
        XCTAssertEqual(chips.spokenValue(of:"Stout"),"excluded")
    }
}
