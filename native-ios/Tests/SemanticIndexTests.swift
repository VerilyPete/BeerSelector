import XCTest
@testable import BeerSelectorNative

final class SemanticIndexTests: XCTestCase {
    @MainActor private func waitUntil(_ condition: () async -> Bool) async {
        for _ in 0..<1000 {
            if await condition() { return }
            try? await Task.sleep(for:.milliseconds(1))
        }
        XCTFail("Expected asynchronous index transition did not occur")
    }
    @MainActor func testOldBuildCannotReplaceNewGenerationAndUnchangedRefreshDoesNotRebuild() async {
        let engine = SuspendedVectorEngine()
        let index = SemanticTaplistIndex(enabled:true,engine:engine)
        let epoch = UUID()
        let a = Beer(id:"a",name:"A"), b = Beer(id:"b",name:"B")
        index.schedule(epoch:epoch,account:"first",taplist:[a])
        await waitUntil { await engine.count == 1 }
        index.schedule(epoch:epoch,account:"second",taplist:[b])
        await waitUntil { await engine.count == 2 }
        let request = SemanticRetrievalRequest(epoch:epoch,account:"second",taplist:[b],eligibleIDs:["b"],query:"coffee")
        await engine.finish(1)
        await waitUntil { await index.retrieve(request) == ["b"] }
        await engine.finish(0)
        for _ in 0..<5 { await Task.yield() }
        let result = await index.retrieve(request)
        XCTAssertEqual(result,["b"])
        let stale = await index.retrieve(.init(epoch:epoch,account:"first",taplist:[a],eligibleIDs:["a"],query:"coffee"))
        XCTAssertNil(stale)
        index.schedule(epoch:epoch,account:"second",taplist:[b])
        for _ in 0..<5 { await Task.yield() }
        let count = await engine.count
        XCTAssertEqual(count,2)
    }
    @MainActor func testDisableDuringBuildPreventsPublicationAndReenableRebuilds() async {
        let engine = SuspendedVectorEngine()
        let index = SemanticTaplistIndex(enabled:true,engine:engine)
        let epoch = UUID(), beer = Beer(id:"a",name:"A")
        let request = SemanticRetrievalRequest(epoch:epoch,account:"owner",taplist:[beer],eligibleIDs:["a"],query:"coffee")
        index.schedule(epoch:epoch,account:"owner",taplist:[beer])
        await waitUntil { await engine.count == 1 }
        index.enabled = false
        await engine.finish(0)
        for _ in 0..<5 { await Task.yield() }
        let disabled = await index.retrieve(request)
        XCTAssertNil(disabled)
        index.enabled = true
        index.schedule(epoch:epoch,account:"owner",taplist:[beer])
        await waitUntil { await engine.count == 2 }
        await engine.finish(1)
        await waitUntil { await index.retrieve(request) == ["a"] }
        let excluded = await index.retrieve(.init(epoch:epoch,account:"owner",taplist:[beer],eligibleIDs:[],query:"coffee"))
        XCTAssertEqual(excluded,[])
    }
    @MainActor func testInvalidationDuringSearchDiscardsLateIDs() async {
        let engine = SuspendedVectorEngine()
        let index = SemanticTaplistIndex(enabled:true,engine:engine)
        let epoch = UUID(), beer = Beer(id:"a",name:"A")
        let request = SemanticRetrievalRequest(epoch:epoch,account:"owner",taplist:[beer],eligibleIDs:["a"],query:"coffee")
        index.schedule(epoch:epoch,account:"owner",taplist:[beer])
        await waitUntil { await engine.count == 1 }
        await engine.finish(0)
        await waitUntil { await index.retrieve(request) == ["a"] }
        await engine.suspendSearch()
        let task = Task { await index.retrieve(request) }
        await waitUntil { await engine.searchPending }
        index.invalidate()
        await engine.finishSearch()
        let result = await task.value
        XCTAssertNil(result)
    }
    @MainActor func testEnrichmentInvalidatesReadyCacheAndOldRequestCannotUseNewFacts() async {
        let engine = SuspendedVectorEngine()
        let index = SemanticTaplistIndex(enabled:true,engine:engine)
        let epoch = UUID()
        var beer = Beer(id:"a",name:"A")
        let old = SemanticRetrievalRequest(epoch:epoch,account:"owner",taplist:[beer],eligibleIDs:["a"],query:"coffee")
        index.schedule(epoch:epoch,account:"owner",taplist:[beer])
        await waitUntil { await engine.count == 1 }
        await engine.finish(0)
        await waitUntil { await index.retrieve(old) != nil }
        beer.brew_description = "Espresso"; beer.abv = 5
        index.schedule(epoch:epoch,account:"owner",taplist:[beer])
        let result = await index.retrieve(old)
        XCTAssertNil(result)
        await waitUntil { await engine.count == 2 }
        await engine.finish(1)
        let fresh = SemanticRetrievalRequest(epoch:epoch,account:"owner",taplist:[beer],eligibleIDs:["a"],query:"coffee")
        await waitUntil { await index.retrieve(fresh) == ["a"] }
        let stale = await index.retrieve(old)
        XCTAssertNil(stale)
    }
}
private actor SuspendedVectorEngine: SemanticVectorEngine {
    private var requests: [([SemanticDocument],CheckedContinuation<SemanticVectors?,Never>?)] = []
    var count: Int { requests.count }
    func build(_ documents: [SemanticDocument]) async -> SemanticVectors? {
        await withCheckedContinuation { requests.append((documents,$0)) }
    }
    func finish(_ position: Int) {
        let entry = requests[position]; requests[position].1 = nil
        let values = Dictionary(uniqueKeysWithValues:entry.0.map { ($0.id,[1.0,0.0]) })
        entry.1?.resume(returning:SemanticVectors(revision:1,dimension:2,values:values))
    }
    private var suspendedSearch = false
    private var searchContinuation: CheckedContinuation<[String]?,Never>?
    var searchPending: Bool { searchContinuation != nil }
    func suspendSearch() { suspendedSearch = true }
    func finishSearch() { searchContinuation?.resume(returning:["a"]); searchContinuation = nil }
    func search(_ text: String, vectors: SemanticVectors, eligible: Set<String>) async -> [String]? {
        if suspendedSearch { return await withCheckedContinuation { searchContinuation = $0 } }
        return ["outside","a","b","a"]
    }
}
