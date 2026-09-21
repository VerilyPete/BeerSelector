import Foundation
import CoreSpotlight
import UniformTypeIdentifiers

/// Isolated feasibility code, never linked to the shipping application.
@MainActor final class ScopedSearchProbe {
    struct Fact: Equatable {
        let id: String
        let description: String
    }
    let namespace: String
    let foreignNamespace: String
    let indexName: String
    let index: CSSearchableIndex
    var deleteItems: () async throws -> Void
    var indexItems: ([CSSearchableItem]) async throws -> Void
    private var indexingTask: Task<Void,Error>?
    init() {
        let namespace = UUID().uuidString, foreignNamespace = UUID().uuidString
        self.namespace = namespace; self.foreignNamespace = foreignNamespace
        let name = "SemanticSearchFixtureProbe." + UUID().uuidString
        let index = CSSearchableIndex(name:name)
        self.indexName = name; self.index = index
        deleteItems = { try await index.deleteSearchableItems(withDomainIdentifiers:[namespace,foreignNamespace]) }
        indexItems = { try await index.indexSearchableItems($0) }
    }
    private var query: CSUserQuery?
    private var continuation: CheckedContinuation<[String], Error>?
    private(set) var active = true
    private(set) var rejected = 0
    private(set) var lastRawCount = 0
    private(set) var lastDisableSemanticSearch = false
    let facts = ["fixture-cacao": Fact(id:"fixture-cacao",description:"Cacao nibs and espresso with a dry finish."),
                 "fixture-citrus": Fact(id:"fixture-citrus",description:"Lemon peel and a clean sparkling finish."),
                 "fixture-latin": Fact(id:"fixture-latin",description:"Sol and Luna illuminate the sky.")]

    func indexedIdentifier(_ id: String) -> String { namespace + ":" + id }

    func hydrate(_ id: String, domain: String?, eligible: Set<String>) -> Fact? {
        guard active, domain == namespace, eligible.contains(id) else { return nil }
        return facts[id]
    }
    func retire() { active = false; cancel() }
    func cancel() {
        query?.cancel(); query = nil
        let waiting = continuation; continuation = nil
        waiting?.resume(throwing:CancellationError())
    }
    func indexFixtures() async throws {
        guard active, indexingTask == nil else { throw CancellationError() }
        let task = Task { @MainActor in
        // Never share an index with another probe generation or the real app.
        try await self.deleteItems()
        guard self.active, !Task.isCancelled else { throw CancellationError() }
        var items = facts.values.map { fact in
            let attributes = CSSearchableItemAttributeSet(contentType:.text)
            attributes.title = fact.id == "fixture-latin" ? "Sol and Luna" : fact.id
            attributes.contentDescription = fact.description
            attributes.textContent = fact.description
            return CSSearchableItem(uniqueIdentifier:indexedIdentifier(fact.id),domainIdentifier:namespace,attributeSet:attributes)
        }
        let foreign = CSSearchableItemAttributeSet(contentType:.text)
        foreign.title = "Chocolate coffee roasty stout"
        foreign.contentDescription = "FOREIGN CONTENT MUST NEVER REACH MODEL"
        foreign.textContent = "Chocolate coffee roasty stout. FOREIGN CONTENT MUST NEVER REACH MODEL"
        items.append(CSSearchableItem(uniqueIdentifier:foreignNamespace + ":foreign",domainIdentifier:foreignNamespace,attributeSet:foreign))
        try await self.indexItems(items)
        guard self.active, !Task.isCancelled else { throw CancellationError() }
        CSUserQuery.prepare()
        }
        indexingTask = task
        try await task.value
    }
    func acceptedFacts(_ items: [CSSearchableItem], eligible: Set<String>) -> [Fact] {
        var seen: Set<String> = []
        var accepted: [Fact] = []
        for item in items.prefix(96) {
            let prefix = namespace + ":"
            guard item.uniqueIdentifier.hasPrefix(prefix),
                  let fact = hydrate(String(item.uniqueIdentifier.dropFirst(prefix.count)),domain:item.domainIdentifier,eligible:eligible) else {
                rejected += 1; continue
            }
            if seen.insert(fact.id).inserted { accepted.append(fact) }
            if accepted.count == 24 { break }
        }
        return accepted
    }
    func search(_ text: String, semantic: Bool?, eligible: Set<String>? = nil, scoped: Bool = true, ranked: Bool = true, language: String? = nil) async throws -> [String] {
        guard active else { throw CancellationError() }
        cancel()
        let context = CSUserQueryContext()
        context.filterQueries = ["domainIdentifier == \"\(namespace)\""]
        if !scoped { context.filterQueries = [] }
        context.keyboardLanguage = language
        context.fetchAttributes = ["domainIdentifier"]
        context.enableRankedResults = ranked
        if let semantic { context.disableSemanticSearch = !semantic }
        lastDisableSemanticSearch = context.disableSemanticSearch
        context.maxResultCount = 24; context.maxRankedResultCount = 24
        let query = CSUserQuery(userQueryString:text,userQueryContext:context)
        self.query = query
        let collector = ProbeHitCollector()
        let allowed = eligible ?? Set(facts.keys)
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { waiting in
                continuation = waiting
                query.foundItemsHandler = { items in collector.append(items) }
                query.completionHandler = { [weak self, weak query] error in
                    Task { @MainActor in
                        guard let self, let query, self.query === query, let waiting = self.continuation else { return }
                        self.continuation = nil; self.query = nil
                        if let error { waiting.resume(throwing:error); return }
                        self.lastRawCount = collector.snapshot().count
                        let ordered = collector.snapshot().sorted {
                            let rank = $0.compare(byRank:$1)
                            return rank == .orderedSame ? $0.uniqueIdentifier < $1.uniqueIdentifier : rank == .orderedAscending
                        }
                        let valid = self.acceptedFacts(ordered,eligible:allowed).map(\.id)
                        waiting.resume(returning:valid)
                    }
                }
                if Task.isCancelled { cancel(); return }
                query.start()
                Task { @MainActor [weak self] in
                    try? await Task.sleep(for:.seconds(2))
                    guard let self, self.query === query else { return }
                    self.cancel()
                }
            }
        } onCancel: {
            Task { @MainActor in
                guard self.query === query else { return }
                self.cancel()
            }
        }
    }
    func cleanup() async throws {
        retire()
        // Even an uncooperative submitted write must drain before final deletion.
        // Its error is delivered to indexFixtures' caller; deletion is still needed.
        if let indexingTask { _ = try? await indexingTask.value }
        try await deleteItems()
    }
}

// Core Spotlight serializes callbacks, but a Task per callback would not preserve
// that ordering. Collect synchronously, then hop to MainActor only on completion.
private final class ProbeHitCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var items: [CSSearchableItem] = []
    func append(_ batch: [CSSearchableItem]) {
        lock.lock(); defer { lock.unlock() }
        items.append(contentsOf:batch.prefix(max(0,96-items.count)))
    }
    func snapshot() -> [CSSearchableItem] {
        lock.lock(); defer { lock.unlock() }
        return items
    }
}
