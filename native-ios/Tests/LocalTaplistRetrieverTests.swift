import XCTest
@testable import BeerSelectorNative

final class LocalTaplistRetrieverTests: XCTestCase {
    struct Corpus: Decodable {
        struct Row: Decodable {
            let id, name, style, brewery, description, container: String
            let abv: Double
            var beer: Beer {
                var b = Beer(id:id,name:name)
                b.brew_style = style; b.brewer = brewery; b.brew_description = description
                b.brew_container = container; b.abv = abv
                return b
            }
        }
        struct Case: Decodable {
            let id, request, historyStyle: String
            let relevantIDs, unacceptableIDs, previousIDs, baselineIDs: [String]
        }
        let revision: Int
        let beers: [Row]
        let cases: [Case]
    }
    func testFrozenLocalRetrievalCorpus() throws {
        let url = try XCTUnwrap(Bundle(for:Self.self).url(forResource:"SemanticTaplistCorpus",withExtension:"json"))
        let corpus = try JSONDecoder().decode(Corpus.self,from:Data(contentsOf:url))
        XCTAssertEqual(corpus.cases.count,20)
        for fixture in corpus.cases {
            var historical = Beer(id:"old",name:"Historical fixture")
            historical.brew_style = fixture.historyStyle; historical.tasted_date = "01/01/2000"
            let history = fixture.historyStyle.isEmpty ? [] : [historical]
            let preferences = SuggestionPreferences(request:fixture.request)
            let eligible = RecommendationRules.eligible(taplist:corpus.beers.map(\.beer),history:history,excluded:[],feedback:[],preferences:preferences)
            let result = LocalTaplistRetriever(eligible:eligible,history:history,preferences:preferences).candidates(previousIDs:Set(fixture.previousIDs))
            XCTAssertEqual(result.map(\.id),fixture.baselineIDs,fixture.id)
        }
    }
    func testEligibleLowerBandIsNotRecomputedDuringRetrieval() {
        let taplist = (1...8).map { value -> Beer in
            var b = Beer(id:String(value),name:"Beer \(value)"); b.abv = Double(value); return b
        }
        let preferences = SuggestionPreferences(abv:.lower)
        let eligible = RecommendationRules.eligible(taplist:taplist,history:[],excluded:[],feedback:[],preferences:preferences)
        XCTAssertEqual(eligible.map(\.id),["1","2","3","4"])
        let retriever = LocalTaplistRetriever(eligible:eligible,history:[],preferences:preferences)
        XCTAssertEqual(retriever.candidates().map(\.id),["1","2","3","4"])
        XCTAssertEqual(retriever.candidates(previousIDs:["1","2","3"]).map(\.id),["4","1","2"])
    }
    func testPresentationExclusionsPreserveZeroOneAndTwoUnseenBranches() {
        let beers = (1...5).map { Beer(id:String($0),name:"Beer \($0)") }
        let retriever = LocalTaplistRetriever(eligible:beers,history:[])
        XCTAssertEqual(retriever.candidates(previousIDs:["1","2","3","4","5"]).map(\.id),["1","2","3","4","5"])
        XCTAssertEqual(retriever.candidates(previousIDs:["1","2","3","4"]).map(\.id),["5","1","2"])
        XCTAssertEqual(retriever.candidates(previousIDs:["1","2","3"]).map(\.id),["4","5","1"])
    }

}
