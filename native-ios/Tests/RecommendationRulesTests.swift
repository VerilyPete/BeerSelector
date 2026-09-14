import XCTest
@testable import BeerSelectorNative

final class RecommendationRulesTests: XCTestCase {
    private func beer(_ id: String, style: String = "", brewer: String = "") -> Beer {
        var b = Beer(id:id,name:"Beer \(id)"); b.brew_style = style; b.brewer = brewer; return b
    }
    func testStyleRequestsFilterFamiliesAndNegationWithoutNameMatches() throws {
        func selection(_ text: String) throws -> SuggestionPreferences {
            let data = try JSONSerialization.data(withJSONObject:["container":"Any","abv":"Any","request":text])
            return try JSONDecoder().decode(SuggestionPreferences.self,from:data)
        }
        let beers = [beer("ipa",style:"American IPA"),beer("hazy",style:"New England India Pale Ale"),
                     beer("stout",style:"Imperial Stout"),beer("porter",style:"Porter"),beer("unknown")]
        XCTAssertEqual(try selection("IPA").candidates(from:beers).map(\.id),["ipa","hazy"])
        XCTAssertEqual(try selection("IPA, not hazy").candidates(from:beers).map(\.id),["ipa"])
        XCTAssertEqual(try selection("hazy IPA").candidates(from:beers + [beer("pale",style:"Hazy Pale Ale")]).map(\.id),["hazy"])
        XCTAssertEqual(try selection("stout").candidates(from:beers).map(\.id),["stout"])
        XCTAssertEqual(try selection("no stout or porter").candidates(from:beers).map(\.id),["ipa","hazy"])
        XCTAssertEqual(try selection("stout or porter").candidates(from:beers).map(\.id),["stout","porter"])
        XCTAssertEqual(try selection("pilsner").candidates(from:beers).count,0)
        XCTAssertEqual(try selection("something like an IPA but lighter").candidates(from:beers).count,5,
                       "Comparisons are model preferences, not silently converted to strict style filters")
    }

    func testStyleRequestSurvivesEveryPromptTierAndLegacyPreferencesDecode() throws {
        let old = try JSONDecoder().decode(SuggestionPreferences.self,from:Data(#"{"container":"Draft only","abv":"Lower"}"#.utf8))
        XCTAssertEqual(old.container,.draft)
        XCTAssertEqual(old,SuggestionPreferences(container:.draft,abv:.lower))
        let selection = try JSONDecoder().decode(SuggestionPreferences.self,from:Data(#"{"container":"Any","abv":"Any","request":"crisp and refreshing"}"#.utf8))
        let full = try RecommendationModelInput.prompt(history:[],candidates:[],feedback:[],preferences:selection)
        XCTAssertTrue(full.contains("crisp and refreshing"))
        for lean in [false,true] {
            let prompt = try RecommendationPromptBudget.compact(history:[],candidates:[],feedback:[],preferences:selection,context:[],lean:lean)
            XCTAssertTrue(prompt.contains("crisp and refreshing"))
        }
    }

    func testStyleRequestCannotOverrideFeedbackRepeatsOrContainerAndIsBounded() {
        var recent = beer("recent",style:"IPA",brewer:"Brewery")
        recent.brew_container = "Draft"
        var disliked = beer("disliked",style:"IPA"); disliked.brew_container = "Draft"
        var bottle = beer("bottle",style:"IPA"); bottle.brew_container = "Bottle"
        let preferences = SuggestionPreferences(container:.draft,request:"IPA")
        XCTAssertTrue(RecommendationRules.eligible(taplist:[recent,disliked,bottle],history:[recent],excluded:[],feedback:[BeerFeedback(beer:disliked,rating:.notForMe)],preferences:preferences).isEmpty)
        XCTAssertEqual(SuggestionPreferences(request:String(repeating:"x",count:500)).request.count,160)
        XCTAssertTrue(SuggestionPreferences(request:"IPA, not hazy").styleRequest.summary.contains("Exclude: Hazy"))
        XCTAssertFalse(SuggestionPreferences(request:"IPA").styleRequest.needsModel)
        XCTAssertTrue(SuggestionPreferences(request:"something like an IPA").styleRequest.needsModel)
    }

    func testReviewSpecificWheatSubstyleDoesNotBroadenToOtherWheatBeers() {
        let taplist = [beer("hefe",style:"Hefeweizen"),beer("wit",style:"Witbier"),beer("wheat",style:"American Wheat")]
        XCTAssertEqual(SuggestionPreferences(request:"hefeweizen").candidates(from:taplist).map(\.id),["hefe"])
        XCTAssertEqual(SuggestionPreferences(request:"witbier").candidates(from:taplist).map(\.id),["wit"])
    }
    func testReviewSubstyleMatchesBothMetadataWordOrders() {
        let taplist = [beer("prefix",style:"Imperial Stout"),beer("suffix",style:"Stout - Imperial")]
        XCTAssertEqual(SuggestionPreferences(request:"imperial stout").candidates(from:taplist).map(\.id),["prefix","suffix"])
        XCTAssertEqual(SuggestionPreferences(request:"double IPA").candidates(from:[beer("double",style:"IPA - Imperial / Double")]).map(\.id),["double"])
    }
    func testReviewMoodMatchingCandidateReachesModelShortlist() {
        var history = beer("old",style:"IPA",brewer:"Brewery"); history.tasted_date = "01/01/2000"
        let taplist = (0..<13).map { beer(String($0),style:"IPA",brewer:"Brewery") } + [beer("stout",style:"Stout",brewer:"Other")]
        let result = RecommendationRules.shortlist(taplist:taplist,history:[history],excluded:[],preferences:.init(request:"a roasty stout"))
        XCTAssertTrue(result.contains { $0.id == "stout" },"The model cannot honor the request if its only matching option is removed before inference")
    }

    func testMoodWithoutLiteralMatchesStillOffersTheModelStyleVariety() {
        var old = beer("old",style:"IPA",brewer:"Brewery"); old.tasted_date = "01/01/2000"
        let taplist = (0..<20).map { beer(String($0),style:"IPA",brewer:"Brewery") }
            + [beer("stout",style:"Stout"),beer("lager",style:"Lager")]
        let result = RecommendationRules.shortlist(taplist:taplist,history:[old],excluded:[],preferences:.init(request:"Something adventurous"))
        XCTAssertEqual(result.count,12)
        XCTAssertTrue(result.contains { $0.id == "stout" })
        XCTAssertTrue(result.contains { $0.id == "lager" })
    }

    func testRequestRetrievalUsesDescriptionAndHonorsNegativeWordsAndHardEligibility() throws {
        var wanted = beer("wanted",style:"Stout"); wanted.brew_description = "Roasted coffee, dry finish"; wanted.abv = 5; wanted.brew_container = "Draft"
        var sweet = beer("sweet",style:"Stout"); sweet.brew_description = "Sweet chocolate"; sweet.abv = 5; sweet.brew_container = "Draft"
        var excluded = wanted; excluded.id = "excluded"
        var bottle = wanted; bottle.id = "bottle"; bottle.brew_container = "Bottle"
        var unknown = wanted; unknown.id = "unknown"; unknown.abv = nil
        let preferences = SuggestionPreferences(container:.draft,abv:.lower,request:"roasty, nothing sweet")
        let result = RecommendationRules.shortlist(taplist:[sweet,wanted,excluded,bottle,unknown],history:[],excluded:["excluded"],preferences:preferences)
        XCTAssertEqual(result.map(\.id),["wanted","sweet"])
        for prompt in [try RecommendationModelInput.prompt(history:[],candidates:result,feedback:[],preferences:preferences),
                       try RecommendationPromptBudget.compact(history:[],candidates:result,feedback:[],preferences:preferences,context:[]),
                       try RecommendationPromptBudget.compact(history:[],candidates:result,feedback:[],preferences:preferences,context:[],lean:true)] {
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with:Data(prompt.utf8)) as? [String:Any])
            let evidence = try XCTUnwrap(json["candidateRequestTerms"] as? [String:[String]])
            XCTAssertEqual(evidence["wanted"],["roast"])
            XCTAssertEqual(evidence["sweet"],["sweet"])
            XCTAssertFalse(prompt.contains("Roasted coffee"),"Only bounded matching terms are added to the prompt")
        }
    }
    func testSpecificStyleExclusionsAndPunctuationKeepTheirMeaning() {
        let beers = [beer("hefe",style:"Hefe-Weizen"),beer("wit",style:"Witbier"),beer("wheat",style:"American Wheat")]
        XCTAssertEqual(SuggestionPreferences(request:"wheat").candidates(from:beers).count,3)
        XCTAssertEqual(SuggestionPreferences(request:"not hefeweizen").candidates(from:beers).map(\.id),["wit","wheat"])
        XCTAssertEqual(SuggestionPreferences(request:"not witbier").candidates(from:beers).map(\.id),["hefe","wheat"])
        let stouts = [beer("dry",style:"Stout - Irish Dry"),beer("imperial",style:"Stout / Imperial"),beer("oatmeal",style:"Oatmeal Stout")]
        XCTAssertEqual(SuggestionPreferences(request:"dry stout").candidates(from:stouts).map(\.id),["dry"])
        XCTAssertEqual(SuggestionPreferences(request:"stout, not imperial stout").candidates(from:stouts).map(\.id),["dry","oatmeal"])
        XCTAssertEqual(SuggestionPreferences(request:"IPA, not double IPA").candidates(from:[beer("double",style:"IPA - Imperial / Double"),beer("session",style:"Session IPA")]).map(\.id),["session"])
    }

    func testChoicePromptIsBoundedAndOmitsPrivateUpstreamMetadata() throws {
        var beer = Beer(id:"1",name:"Beer"); beer.chit_code = "PRIVATE-RECEIPT"
        beer.brew_description = "PRIVATE-DESCRIPTION"; beer.brew_style = "IPA"
        var choice = BeerChoiceContext(taplist:[beer],shown:["1"],preferences:.init(),usedModel:true)
        choice.selected = ["1"]
        let examples = ChoiceModelInput.examples(Array(repeating:choice,count:100))
        XCTAssertEqual(examples.count,4)
        let prompt = try RecommendationModelInput.prompt(history:[],candidates:[],feedback:[],context:[choice])
        XCTAssertFalse(prompt.contains("PRIVATE-"))
    }
    func testUnconfirmedQueueIsInterestWithoutInventingTastingOrDislike() throws {
        var chosen = Beer(id:"z",name:"Chosen IPA"); chosen.brew_style = "IPA"
        var other = Beer(id:"a",name:"Available stout"); other.brew_style = "Stout"
        var context = BeerChoiceContext(taplist:[chosen,other],shown:["z","a"],preferences:.init(),usedModel:false)
        context.selected = ["z"]; context.queued = ["z"]
        let suggestions = RecommendationRules.shortlist(taplist:[other,chosen],history:[],excluded:[],context:[context])
        XCTAssertEqual(suggestions.first?.id,"z","Unconfirmed interest informs matching without excluding the beer as tasted")
        XCTAssertEqual(suggestions.count,2,"Unchosen does not mean disliked")
        let prompt = try RecommendationModelInput.prompt(history:[],candidates:suggestions,feedback:[],context:[context])
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with:Data(prompt.utf8)) as? [String:Any])
        let example = try XCTUnwrap((json["choiceExamples"] as? [[String:Any]])?.first)
        XCTAssertEqual((example["queuedTastingUnconfirmed"] as? [[String:Any]])?.first?["id"] as? String,"z")
        XCTAssertEqual((example["laterAppearedInTastings"] as? [Any])?.count,0)
        XCTAssertEqual((example["availableStyleCounts"] as? [String:Int])?["stout"],1)
        XCTAssertEqual((json["recentTastings"] as? [Any])?.count,0)
    }

    func testModelInputContainsAllHundredRecentTastingsAndExplicitFeedback() throws {
        let history = (0..<105).map { beer(String($0),style:"IPA",brewer:"Brewery") }
        let feedback = [BeerFeedback(beer:history[99],rating:.notForMe),BeerFeedback(beer:beer("older",style:"Stout"),rating:.liked)]
        let prompt = try RecommendationModelInput.prompt(history:history,candidates:[],feedback:feedback)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with:Data(prompt.utf8)) as? [String:Any])
        let rows = try XCTUnwrap(json["recentTastings"] as? [[String]])
        XCTAssertEqual(rows.count,100)
        XCTAssertEqual(rows[99][1],"Beer 99")
        XCTAssertEqual(rows[99][4],"notForMe")
        XCTAssertTrue(prompt.contains("stout"),"Older feedback survives outside the recent cache and informs the prompt")
    }
    func testExplicitFeedbackOutweighsTastingAndExcludesDislikedBeer() {
        let feedback = [BeerFeedback(beer:beer("old",style:"Stout"),rating:.liked),BeerFeedback(beer:beer("no",style:"IPA"),rating:.notForMe)]
        let choices = RecommendationRules.shortlist(taplist:[beer("a",style:"IPA"),beer("b",style:"Stout"),beer("no",style:"IPA")],history:[beer("recent",style:"IPA")],excluded:[],feedback:feedback)
        XCTAssertEqual(choices.first?.id,"b")
        XCTAssertFalse(choices.contains { $0.id == "no" })
        XCTAssertTrue(choices.first?.reason.contains("you liked") == true)
    }
    func testExplicitDislikeFollowsRecipeAcrossPackagesButNotVariantsOrBreweries() {
        var draft = beer("draft",style:"IPA",brewer:"Example"); draft.brew_name = "Example IPA"
        var bottle = draft; bottle.id = "bottle"; bottle.brew_name += " (BTL)"
        var can = draft; can.id = "can"; can.brew_name += " - Can"
        var variant = bottle; variant.id = "variant"; variant.brew_name = "Example IPA Barrel Aged (BTL)"
        var other = bottle; other.id = "other"; other.brewer = "Other Brewery"
        let feedback = [BeerFeedback(beer:draft,rating:.notForMe)]
        let choices = RecommendationRules.shortlist(taplist:[bottle,can,variant,other],history:[],excluded:[],feedback:feedback)
        XCTAssertEqual(Set(choices.map(\.id)),["variant","other"])
        XCTAssertEqual(RecommendationRules.rating(for:bottle,feedback:feedback),.notForMe)
        var unknown = bottle; unknown.brewer = ""
        XCTAssertNil(RecommendationRules.rating(for:unknown,feedback:feedback),"Missing brewery must not imply a recipe match")
    }
    func testPackageFeedbackUsesLatestIntentWithConservativeStableTies() {
        var draft = beer("draft",brewer:"Example"); draft.brew_name = "Example IPA"
        var bottle = draft; bottle.id = "bottle"; bottle.brew_name += " (BTL)"
        let old = BeerFeedback(beer:draft,rating:.notForMe,ratedAt:Date(timeIntervalSince1970:1))
        let recent = BeerFeedback(beer:bottle,rating:.liked,ratedAt:Date(timeIntervalSince1970:2))
        for feedback in [[old,recent],[recent,old]] {
            XCTAssertEqual(RecommendationRules.rating(for:draft,feedback:feedback),.liked)
            XCTAssertEqual(RecommendationRules.resolvedFeedback(feedback),[recent])
            XCTAssertEqual(RecommendationRules.shortlist(taplist:[draft],history:[],excluded:[],feedback:feedback).map(\.id),["draft"])
        }
        let legacy = BeerFeedback(beer:draft,rating:.notForMe,ratedAt:nil)
        XCTAssertEqual(RecommendationRules.rating(for:draft,feedback:[legacy,recent]),.liked)
        var tied = old; tied.ratedAt = recent.ratedAt
        XCTAssertEqual(RecommendationRules.rating(for:bottle,feedback:[recent,tied]),.notForMe)
        XCTAssertEqual(RecommendationRules.rating(for:bottle,feedback:[tied,recent]),.notForMe)
    }
    func testFeedbackIndexPreservesExactIDFallbackAndLatestRecipeRating() {
        var old = beer("same-id",brewer:"Original"); old.brew_name = "Original IPA"
        var corrected = old; corrected.brewer = "Corrected"; corrected.brew_name = "Corrected IPA"
        var bottle = corrected; bottle.id = "bottle-id"; bottle.brew_name += " (BTL)"
        let exact = BeerFeedback(beer:old,rating:.liked,ratedAt:Date(timeIntervalSince1970:3))
        let recipe = BeerFeedback(beer:bottle,rating:.notForMe,ratedAt:Date(timeIntervalSince1970:2))
        for records in [[exact,recipe],[recipe,exact]] {
            let index = RecommendationRules.FeedbackIndex(records)
            XCTAssertEqual(index.rating(for:corrected),.liked,"Newest exact-ID feedback survives metadata corrections")
            XCTAssertEqual(index.rating(for:bottle),.notForMe,"Different recipes must not merge via unrelated IDs")
            XCTAssertEqual(RecommendationRules.dislikedIDs(in:[corrected,bottle],feedback:records),["bottle-id"])
        }
    }
    func testPresentationVarietyNeverChangesRelativeStrengthEligibility() {
        let taplist = (1...8).map { value -> Beer in var b = beer(String(value)); b.abv = Double(value); return b }
        for preference in [SuggestionABV.lower,.higher] {
            let selection = SuggestionPreferences(abv:preference)
            let eligible = RecommendationRules.eligible(taplist:taplist,history:[],excluded:[],feedback:[],preferences:selection)
            let first = RecommendationRules.shortlist(taplist:taplist,history:[],excluded:[],preferences:selection)
            let another = RecommendationRules.shortlist(taplist:taplist,history:[],excluded:[],preferences:selection,presentationExcluded:Set(first.prefix(3).map(\.id)))
            XCTAssertEqual(another.count,1)
            XCTAssertTrue(Set(another.map(\.id)).isSubset(of:Set(eligible.map(\.id))))
        }
    }
    func testContainerPreferencesAreStrictAndNeverWidenToFillThree() {
        var draft = beer("draft"); draft.brew_container = "16oz Draught"
        var bottle = beer("bottle"); bottle.brew_container = "Bottle"
        var can = beer("can"); can.brew_container = "Can"
        let taplist = [draft,bottle,can,beer("unknown")]
        XCTAssertEqual(RecommendationRules.shortlist(taplist:taplist,history:[],excluded:[],preferences:.init(container:.draft)).map(\.id),["draft"])
        XCTAssertEqual(RecommendationRules.shortlist(taplist:taplist,history:[],excluded:[],preferences:.init(container:.bottle)).map(\.id),["bottle"])
    }
    func testABVPreferenceLimitsBothModelAndFallbackCandidatesToRequestedBand() {
        let taplist = (1...8).map { value -> Beer in var b = beer(String(value)); b.abv = Double(value); return b } + [beer("unknown")]
        let lower = RecommendationRules.shortlist(taplist:taplist,history:[],excluded:[],preferences:.init(abv:.lower))
        let higher = RecommendationRules.shortlist(taplist:taplist,history:[],excluded:[],preferences:.init(abv:.higher))
        XCTAssertEqual(lower.map(\.id),["1","2","3","4"])
        XCTAssertEqual(higher.map(\.id),["8","7","6","5"])
        XCTAssertNil(RecommendationRules.choose(ids:["1","2","8"],from:lower))
        XCTAssertTrue(RecommendationRules.shortlist(taplist:[beer("unknown")],history:[],excluded:[],preferences:.init(abv:.lower)).isEmpty)
    }
    func testModelReceivesPreferencesAndActualCandidateABV() throws {
        var b = beer("candidate"); b.abv = 4.5; b.brew_container = "Draft"
        let prompt = try RecommendationModelInput.prompt(history:[],candidates:[BeerSuggestion(beer:b,reason:"")],feedback:[],preferences:.init(container:.draft,abv:.lower))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with:Data(prompt.utf8)) as? [String:Any])
        let preference = try XCTUnwrap(json["selectionPreferences"] as? [String:String])
        XCTAssertEqual(preference["abv"],"Lower")
        XCTAssertEqual(preference["container"],"Draft only")
        let rows = try XCTUnwrap(json["candidates"] as? [[String]])
        XCTAssertEqual(rows[0][5],"4.5"); XCTAssertEqual(rows[0][6],"Draft")
    }
    func testRecentDraftExcludesBottleAndCanVersionsEvenWhenLiked() {
        var draft = beer("draft-id",style:"IPA",brewer:"Example Brewery"); draft.brew_name = "Example IPA"; draft.brew_container = "Draft"
        var bottle = draft; bottle.id = "bottle-id"; bottle.brew_name = "Example IPA (BTL)"; bottle.brew_container = "Bottle"
        var can = draft; can.id = "can-id"; can.brew_name = "Example IPA - Can"; can.brew_container = "Can"
        var variant = bottle; variant.id = "variant"; variant.brew_name = "Example IPA Barrel Aged (BTL)"
        var otherBrewery = bottle; otherBrewery.id = "other"; otherBrewery.brewer = "Different Brewery"
        let choices = RecommendationRules.shortlist(taplist:[bottle,can,variant,otherBrewery],history:[draft],excluded:[],feedback:[BeerFeedback(beer:draft,rating:.liked)],preferences:.init(container:.bottle))
        XCTAssertEqual(Set(choices.map(\.id)),["variant","other"])
        XCTAssertTrue(RecommendationRules.recentlyTasted(can,history:[draft]))
        var mexican = draft; mexican.id = "mexican"; mexican.brew_name = "Mexican"
        var mexi = draft; mexi.id = "mexi"; mexi.brew_name = "Mexi"
        XCTAssertFalse(RecommendationRules.recentlyTasted(mexican,history:[mexi]),"Can inside a name is not a packaging suffix")
    }
    func testRepeatWindowUsesThirtyCalendarDaysRatherThanHundredRecords() throws {
        let formatter = ISO8601DateFormatter()
        let now = try XCTUnwrap(formatter.date(from:"2026-09-13T18:00:00Z"))
        var today = beer("today"); today.tasted_date = "09/13/2026"
        var boundary = beer("boundary"); boundary.tasted_date = "08/15/2026"
        var old = beer("old"); old.tasted_date = "08/14/2026"
        var future = beer("future"); future.tasted_date = "09/14/2026"
        XCTAssertEqual(RecommendationRules.repeatWindow([today,boundary,old,future],now:now).map(\.id),["today","boundary"])
    }
    func testOldHistoryStillInformsPreferencesWithoutBlockingRepeatPackaging() {
        var old = beer("draft",style:"IPA",brewer:"Example"); old.brew_name = "Example IPA"; old.tasted_date = "01/01/2020"
        var bottle = old; bottle.id = "bottle"; bottle.brew_name = "Example IPA (BTL)"; bottle.brew_container = "Bottle"
        let choices = RecommendationRules.shortlist(taplist:[bottle],history:[old],excluded:[])
        XCTAssertEqual(choices.map(\.id),["bottle"])
        XCTAssertTrue(choices.first?.reason.contains("IPA") == true)
    }
    func testHistoryAndAllExcludedIDsAreNeverRecommended() {
        let history = [beer("recent",style:"IPA")]
        let result = RecommendationRules.shortlist(taplist:[beer("recent"),beer("queued"),beer("pending"),beer("eligible")],history:history,excluded:["queued","pending"])
        XCTAssertEqual(result.map(\.id),["eligible"])
    }
    func testStyleAffinityAndDiversityWithoutABVPreference() {
        let history = [beer("old",style:"IPA",brewer:"Brewery")]
        let taplist = [beer("a",style:"IPA",brewer:"Brewery"),beer("b",style:"IPA",brewer:"Brewery"),beer("c",style:"Pale Ale"),beer("d",style:"IPA",brewer:"Another")]
        let result = RecommendationRules.shortlist(taplist:taplist,history:history,excluded:[])
        XCTAssertEqual(result.first?.id,"a")
        XCTAssertGreaterThan(result.count,1)
        guard result.count > 1 else { return }
        XCTAssertNotEqual(result[1].id,"b","Offer variety before repeating the same style and brewery")
        XCTAssertTrue(result.first?.reason.contains("IPA") == true)
        var stronger = taplist; stronger[1].abv = 18
        XCTAssertEqual(RecommendationRules.shortlist(taplist:stronger,history:history,excluded:[]).map(\.id),result.map(\.id))
    }

    func testIPAHistoryMatchesNamedIPAVariants() {
        let result = RecommendationRules.shortlist(taplist:[beer("a",style:"Imperial Stout"),beer("b",style:"American IPA"),beer("c",style:"Session India Pale Ale")],history:[beer("old",style:"IPA")],excluded:[])
        XCTAssertEqual(result.first?.id,"b")
        XCTAssertTrue(result.first?.reason.contains("American IPA") == true)
    }
    func testBoundedUniqueCandidatesAndHonestColdStart() {
        let beers = (0..<30).map { beer(String($0)) }
        let result = RecommendationRules.shortlist(taplist:beers+beers,history:[],excluded:[])
        XCTAssertEqual(result.count,12); XCTAssertEqual(Set(result.map(\.id)).count,12)
        XCTAssertFalse(result.contains { $0.reason.contains("tasted") || $0.reason.contains("favorite") })
    }
    func testGeneratedIDsMustBeExactlyThreeUniqueEligibleChoices() {
        let choices = (0..<4).map { BeerSuggestion(beer:beer(String($0)),reason:"Taplist") }
        XCTAssertEqual(RecommendationRules.choose(ids:["2","0","1"],from:choices)?.map(\.id),["2","0","1"])
        for invalid in [["0","0","1"],["0","1","invented"],["0"],["0","1","2","3"]] {
            XCTAssertNil(RecommendationRules.choose(ids:invalid,from:choices))
        }
        XCTAssertEqual(RecommendationRules.choose(ids:["0"],from:Array(choices.prefix(1)))?.count,1)
    }
}
