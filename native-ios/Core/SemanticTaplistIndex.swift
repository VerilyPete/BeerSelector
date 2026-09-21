import Foundation
import NaturalLanguage

/// Public facts only. Cache ownership is held separately and never indexed or persisted.
struct SemanticDocument: Equatable, Sendable {
    let id: String
    let text: String
    var abv: Double? = nil
    var container: String = ""
    static func documents(_ beers: [Beer]) -> [SemanticDocument] {
        var seen: Set<String> = []
        return beers.filter { !$0.id.isEmpty && seen.insert($0.id).inserted }.map { beer in
            var bounded = beer
            bounded.brew_description = String(beer.brew_description.prefix(2000))
            let text = "\(beer.brew_name.prefix(160)). \(beer.brew_style.prefix(80)). \(beer.brewer.prefix(120)). \(bounded.plainDescription.prefix(1000))"
            return SemanticDocument(id:beer.id,text:text,abv:beer.abv.flatMap { $0.isFinite ? $0 : nil },container:beer.brew_container)
        }.sorted { $0.id < $1.id }
    }
}
struct SemanticVectors: Sendable {
    let revision: Int
    let dimension: Int
    let values: [String:[Double]]
}
protocol SemanticVectorEngine: Sendable {
    func build(_ documents: [SemanticDocument]) async -> SemanticVectors?
    func search(_ text: String, vectors: SemanticVectors, eligible: Set<String>) async -> [String]?
}

/// Synchronous Natural Language work stays on this actor, never on the UI actor.
actor WordVectorEngine: SemanticVectorEngine {
    private let stops: Set<String> = ["the","a","an","and","or","with","of","to","in","is","it","for","on","at","by","from","but"]
    private func vector(_ text: String, model: NLEmbedding) -> [Double]? {
        let tokens = text.lowercased().split(whereSeparator:{ !$0.isLetter }).prefix(256).map(String.init)
        var sum = Array(repeating:0.0,count:model.dimension), count = 0
        for token in tokens where !stops.contains(token) {
            guard !Task.isCancelled else { return nil }
            guard let value = model.vector(for:token), value.count == sum.count, value.allSatisfy(\.isFinite) else { continue }
            for i in sum.indices { sum[i] += value[i] }
            count += 1
        }
        let length = sqrt(sum.reduce(0) { $0 + $1*$1 })
        guard count > 0, length > 0, length.isFinite else { return nil }
        return sum.map { $0 / length }
    }
    func build(_ documents: [SemanticDocument]) -> SemanticVectors? {
        guard !Task.isCancelled, documents.count <= 1000, let model = NLEmbedding.wordEmbedding(for:.english) else { return nil }
        var values: [String:[Double]] = [:]
        for document in documents {
            guard !Task.isCancelled else { return nil }
            // An unrepresentable document has been processed, not left in a partial build.
            // It remains available through local retrieval.
            values[document.id] = vector(document.text,model:model)
        }
        return SemanticVectors(revision:model.revision,dimension:model.dimension,values:values)
    }
    func search(_ text: String, vectors: SemanticVectors, eligible: Set<String>) -> [String]? {
        guard !Task.isCancelled, let model = NLEmbedding.wordEmbedding(for:.english),
              model.revision == vectors.revision, model.dimension == vectors.dimension,
              let query = vector(String(text.prefix(160)),model:model) else { return nil }
        var scores: [(String,Double)] = []
        for id in eligible {
            guard !Task.isCancelled else { return nil }
            guard let value = vectors.values[id], value.count == query.count, value.allSatisfy(\.isFinite) else { continue }
            let norm = value.reduce(0) { $0 + $1*$1 }
            guard norm > 0, norm.isFinite else { continue }
            var score = 0.0
            for i in query.indices { score += query[i]*value[i] }
            guard score.isFinite else { continue }
            scores.append((id,score/sqrt(norm)))
        }
        return Array(scores.sorted { $0.1 == $1.1 ? $0.0 < $1.0 : $0.1 > $1.1 }.prefix(24).map { $0.0 })
    }
}

struct SemanticRetrievalRequest {
    let epoch: UUID
    let account: String
    let taplist: [Beer]
    let eligibleIDs: Set<String>
    let query: String
}
@MainActor protocol SemanticRetrieving {
    var validityToken: UUID? { get }
    func retrieve(_ request: SemanticRetrievalRequest) async -> [String]?
}

extension SemanticRetrieving {
    var validityToken: UUID? { nil }
}

@MainActor final class SemanticTaplistIndex: SemanticRetrieving {
    // Explicit opt-in for experiments; availability of this older API must not
    // silently change the established iOS 26 recommendation path.
    static var experimentalEnabled: Bool {
        #if DEBUG
        if #available(iOS 27.0, *), Locale.preferredLanguages.first?.hasPrefix("en") == true {
            return ProcessInfo.processInfo.environment["BEERSELECTOR_SEMANTIC_SEARCH"] == "1"
        }
        #endif
        return false
    }
    private struct Key: Equatable {
        let epoch: UUID
        let account: String
        let documents: [SemanticDocument]
    }
    var enabled: Bool { didSet { if !enabled { invalidate() } } }
    private let engine: any SemanticVectorEngine
    private var desired: Key?
    private var ready: SemanticVectors?
    private var generation = UUID()
    var validityToken: UUID? { generation }
    private var buildTask: Task<Void,Never>?
    init(enabled: Bool? = nil, engine: any SemanticVectorEngine = WordVectorEngine()) {
        self.enabled = enabled ?? Self.experimentalEnabled; self.engine = engine
    }
    func invalidate() {
        generation = UUID(); desired = nil; ready = nil
        buildTask?.cancel(); buildTask = nil
    }
    func schedule(epoch: UUID, account: String?, taplist: [Beer]) {
        guard enabled, let account, taplist.count <= 1000 else { invalidate(); return }
        let key = Key(epoch:epoch,account:account,documents:SemanticDocument.documents(taplist))
        guard desired != key else { return }
        invalidate(); desired = key
        let token = generation, engine = engine
        buildTask = Task { @MainActor [weak self] in
            let value = await engine.build(key.documents)
            guard let self, !Task.isCancelled, self.enabled, self.generation == token, self.desired == key else { return }
            self.ready = value; self.buildTask = nil
            if value == nil { self.desired = nil } // A later refresh may retry unavailable assets.
        }
    }
    func retrieve(_ request: SemanticRetrievalRequest) async -> [String]? {
        guard enabled, request.taplist.count <= 1000, let ready, let key = desired,
              key.epoch == request.epoch, key.account == request.account,
              key.documents == SemanticDocument.documents(request.taplist) else { return nil }
        let token = generation
        let ids = await engine.search(request.query,vectors:ready,eligible:request.eligibleIDs)
        guard !Task.isCancelled, enabled, token == generation, key == desired else { return nil }
        var seen: Set<String> = []
        return ids.map { Array($0.filter { request.eligibleIDs.contains($0) && seen.insert($0).inserted }.prefix(24)) }
    }
}
