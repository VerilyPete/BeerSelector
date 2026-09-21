import XCTest
@testable import BeerSelectorNative

final class RecommendationPromptBudgetTests: XCTestCase {
    func testBudgetIncludesSchemaOutputAndHeadroom() {
        XCTAssertTrue(RecommendationPromptBudget.fits(promptTokens:2900,instructionTokens:200,schemaTokens:300,contextSize:4096))
        XCTAssertFalse(RecommendationPromptBudget.fits(promptTokens:3000,instructionTokens:200,schemaTokens:300,contextSize:4096))
        XCTAssertFalse(RecommendationPromptBudget.fits(promptTokens:100,instructionTokens:200,schemaTokens:4000,contextSize:4096))
    }
    func testCompactRetainsAllHundredObservationsAndOldExplicitFeedback() throws {
        var history = (0..<105).map { index -> Beer in
            var beer = Beer(id:String(index),name:String(repeating:"Very long name ",count:30))
            beer.brew_style = "IPA"; beer.brewer = "Example"
            return beer
        }
        history[99].brew_style = "Stout"
        let feedback = [BeerFeedback(beer:history[99],rating:.liked)]
        let prompt = try RecommendationPromptBudget.compact(history:history,candidates:[],feedback:feedback,preferences:.init(),context:[])
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with:Data(prompt.utf8)) as? [String:Any])
        let rows = try XCTUnwrap(json["recentTastings"] as? [String])
        XCTAssertEqual(rows.count,100)
        XCTAssertTrue(rows[99].hasSuffix("/liked"))
        XCTAssertTrue(prompt.contains("Stout"))
        XCTAssertFalse(prompt.contains("Very long name"))
        XCTAssertTrue(RecommendationPromptBudget.legacyFits(prompt))
    }
    func testUnicodeBudgetCountsBytesAndDoesNotSilentlyDropTastings() throws {
        let history = (0..<100).map { index -> Beer in
            var beer = Beer(id:String(index),name:"Beer")
            beer.brew_style = String(repeating:"🍺",count:100) + String(index)
            beer.brewer = "Brewery \(index)"
            return beer
        }
        let prompt = try RecommendationPromptBudget.compact(history:history,candidates:[],feedback:[],preferences:.init(),context:[])
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with:Data(prompt.utf8)) as? [String:Any])
        XCTAssertEqual((json["recentTastings"] as? [String])?.count,100)
        XCTAssertEqual((json["styles"] as? [String])?.count,100)
        XCTAssertGreaterThan(prompt.utf8.count,prompt.count)
        XCTAssertFalse(RecommendationPromptBudget.legacyFits(prompt))
    }
    func testLegacyLeanKeepsHundredPreferencesWithVariedBreweriesAndFourChoices() throws {
        let history = (0..<100).map { index -> Beer in
            var beer = Beer(id:String(index),name:"A long beer name \(index)")
            beer.brew_style = "Beer Style \(index % 20)"; beer.brewer = "Example Brewery \(index % 50)"
            return beer
        }
        let candidates = (0..<12).map { index -> BeerSuggestion in
            var beer = Beer(id:"candidate-\(index)",name:"Sierra Nevada Pale Ale")
            beer.brew_style = "American Pale Ale"; beer.brewer = "Sierra Nevada"; beer.abv = 5.6; beer.brew_container = "Draft"
            return BeerSuggestion(beer:beer,reason:"")
        }
        var choice = BeerChoiceContext(taplist:candidates.map(\.beer),shown:Array(candidates.prefix(3).map(\.id)),preferences:.init(),usedModel:false)
        choice.selected = Set(choice.shown); choice.queued = choice.selected
        let prompt = try RecommendationPromptBudget.compact(history:history,candidates:candidates,feedback:[],preferences:.init(),context:Array(repeating:choice,count:4),lean:true)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with:Data(prompt.utf8)) as? [String:Any])
        XCTAssertEqual((json["recentTastings"] as? String)?.split(separator:" ").count,100)
        XCTAssertEqual((json["candidates"] as? [Any])?.count,12)
        XCTAssertTrue(RecommendationPromptBudget.legacyFits(prompt))
    }
    func testChoiceContextPreservesUnconfirmedInterestAndAlternativeStyles() throws {
        var beer = Beer(id:"1",name:"IPA"); beer.brew_style = "IPA"
        var alternative = Beer(id:"2",name:"Stout"); alternative.brew_style = "Stout"
        var choice = BeerChoiceContext(taplist:[beer,alternative],shown:["1","2"],preferences:.init(),usedModel:false)
        choice.selected = ["1"]; choice.queued = ["1"]
        let prompt = try RecommendationPromptBudget.compact(history:[],candidates:[],feedback:[],preferences:.init(),context:[choice])
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with:Data(prompt.utf8)) as? [String:Any])
        let example = try XCTUnwrap((json["choices"] as? [[String:Any]])?.first)
        XCTAssertEqual(example["queuedUnconfirmed"] as? [String],["IPA"])
        XCTAssertEqual(example["laterTasted"] as? [String],[])
        XCTAssertEqual((example["availableStyles"] as? [String:Int])?["Stout"],1)
    }
}
