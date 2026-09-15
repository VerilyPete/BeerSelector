import XCTest
@testable import BeerSelectorNative

final class SemanticRetrievalTests: XCTestCase {
    func testSemanticHitOutsideLocalTwelveSurvivesAndHydratesAuthoritativeEvidence() {
        let beers = (0..<20).map { value -> Beer in
            var b = Beer(id:String(format:"%02d",value),name:"Beer \(value)")
            b.brew_description = "Authoritative description \(value)"; return b
        }
        let local = LocalTaplistRetriever(eligible:beers,history:[])
        XCTAssertFalse(local.candidates().contains { $0.id == "19" })
        let result = SemanticCandidates.merge(ids:["19","19","missing"],local:local,previousIDs:[])
        XCTAssertEqual(result.count,12)
        XCTAssertEqual(result.first?.id,"19")
        XCTAssertEqual(result.first?.semanticEvidence,"Authoritative description 19")
        XCTAssertFalse(result.contains { $0.id == "missing" })
    }
    func testSemanticMergeCannotReintroduceExcludedOrPreviouslyShownBeers() {
        let beers = (1...5).map { Beer(id:String($0),name:"Beer \($0)") }
        let local = LocalTaplistRetriever(eligible:beers,history:[])
        let result = SemanticCandidates.merge(ids:["forbidden","1","5"],local:local,previousIDs:["1","2","3"])
        XCTAssertEqual(Set(result.map(\.id)),["4","5","1"])
        XCTAssertEqual(result.count,3)
        let old = Set(beers.map(\.id))
        XCTAssertEqual(SemanticCandidates.merge(ids:["5"],local:local,previousIDs:old),local.candidates(previousIDs:old))
    }
    func testSemanticEvidenceSurvivesAllPromptTiersWithoutDroppingHistory() throws {
        let history = (0..<100).map { Beer(id:String($0),name:"History \($0)") }
        let candidate = BeerSuggestion(beer:Beer(id:"x",name:"Current"),reason:"",semanticEvidence:"Cacao nibs and espresso")
        let prompts = [try RecommendationModelInput.prompt(history:history,candidates:[candidate],feedback:[]),
            try RecommendationPromptBudget.compact(history:history,candidates:[candidate],feedback:[],preferences:.init(),context:[]),
            try RecommendationPromptBudget.compact(history:history,candidates:[candidate],feedback:[],preferences:.init(),context:[],lean:true)]
        for prompt in prompts {
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with:Data(prompt.utf8)) as? [String:Any])
            XCTAssertEqual((json["candidateDescriptionEvidence"] as? [String:String])?["x"],"Cacao nibs and espresso")
            if let rows = json["recentTastings"] as? [Any] { XCTAssertEqual(rows.count,100) }
            else { XCTAssertEqual((json["recentTastings"] as? String)?.split(separator:" ").count,100) }
        }
    }
}
