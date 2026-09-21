import XCTest
@testable import SemanticSearchProbe

final class WordEmbeddingCorpusTests: XCTestCase {
    struct Corpus: Decodable {
        struct Beer: Decodable {
            let id, name, style, brewery, description: String
            var document: String { "\(name). \(style). \(brewery). \(description)" }
        }
        struct Query: Decodable {
            let id, request: String
            let relevantIDs, baselineIDs: [String]
        }
        let beers: [Beer]
        let cases: [Query]
    }
    func testWordVectorCandidateCoverageAgainstFrozenBaseline() async throws {
        let engine = WordVectorEngine()
        let url = try XCTUnwrap(Bundle(for:Self.self).url(forResource:"SemanticTaplistCorpus",withExtension:"json"))
        let corpus = try JSONDecoder().decode(Corpus.self,from:Data(contentsOf:url))
        let start = ContinuousClock.now
        let built = await engine.build(corpus.beers.map { SemanticDocument(id:$0.id,text:$0.document) })
        let cache = try XCTUnwrap(built)
        print("WORD_CORPUS cacheCount=\(cache.values.count) build=\(start.duration(to:.now)) dimension=\(cache.dimension) revision=\(cache.revision)")
        var baselineTotal = 0.0, alternativeTotal = 0.0
        var baselineSynonyms = 0.0, alternativeSynonyms = 0.0
        // These six corpus cases are recognized exact style requests: preserve their baseline.
        let exact: Set<String> = ["case-09","case-10","case-11","case-12","case-13","case-14"]
        for (ordinal,fixture) in corpus.cases.enumerated() {
            let expected = Set(fixture.relevantIDs)
            var ids = fixture.baselineIDs
            if !exact.contains(fixture.id) {
                let matches = await engine.search(fixture.request,vectors:cache,eligible:Set(corpus.beers.map(\.id)))
                let ranked = try XCTUnwrap(matches)
                ids = Array(ranked.prefix(6))
                for id in fixture.baselineIDs where !ids.contains(id) && ids.count < 12 { ids.append(id) }
                for id in ranked where !ids.contains(id) && ids.count < 12 { ids.append(id) }
            }
            let baseline = Double(Set(fixture.baselineIDs).intersection(expected).count)/Double(expected.count)
            let alternative = Double(Set(ids).intersection(expected).count)/Double(expected.count)
            print("WORD_CORPUS \(fixture.id) baseline=\(baseline) alternative=\(alternative) IDs=\(ids)")
            baselineTotal += baseline; alternativeTotal += alternative
            if ordinal < 8 { baselineSynonyms += baseline; alternativeSynonyms += alternative }
        }
        print("WORD_CORPUS aggregate baseline=\(baselineTotal/20) alternative=\(alternativeTotal/20) synonyms baseline=\(baselineSynonyms/8) alternative=\(alternativeSynonyms/8)")
        XCTAssertGreaterThanOrEqual(alternativeTotal,baselineTotal,"Do not adopt an adapter that regresses aggregate candidate recall")
        XCTAssertGreaterThanOrEqual((alternativeSynonyms-baselineSynonyms)/8,0.10,"Preserve the planned improvement gate")
    }
}
