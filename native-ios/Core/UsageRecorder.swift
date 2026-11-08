import Foundation

struct UsageDimensions: Hashable, Sendable {
    let appVersion: String
    let aiStatus: UsageAIStatus
    let osMajor: Int
}

/// A frozen batch is sent byte for byte as it was encoded, and never changed after freezing.
struct UsagePendingBatch: Equatable, Sendable, Codable {
    let batchID: UUID
    let createdAt: Date
    let body: Data
}

struct UsageState: Equatable, Sendable {
    struct Tuple: Equatable, Sendable {
        let dimensions: UsageDimensions
        let since: Date
        let counts: [UsageEvent:Int]
    }
    static let maxCountPerEvent = 500
    static let pendingLifetime: TimeInterval = 7 * 24 * 3600

    let installID: UUID
    let live: [Tuple]
    let pending: UsagePendingBatch?

    func recording(_ event: UsageEvent, dimensions: UsageDimensions, now: Date) -> Self {
        guard let index = live.firstIndex(where: { $0.dimensions == dimensions }) else {
            return Self(installID:installID,live:live + [Tuple(dimensions:dimensions,since:now,counts:[event:1])],pending:pending)
        }
        let tuple = live[index]
        var counts = tuple.counts
        counts[event, default:0] += 1
        var next = live
        next[index] = Tuple(dimensions:tuple.dimensions,since:tuple.since,counts:counts)
        return Self(installID:installID,live:next,pending:pending)
    }

    func expiring(now: Date) -> Self {
        guard let pending, now.timeIntervalSince(pending.createdAt) > Self.pendingLifetime else { return self }
        return Self(installID:installID,live:live,pending:nil)
    }

    func freezing(now: Date, batchID: UUID) throws -> Self {
        guard pending == nil, let oldest = live.indices.min(by: { live[$0].since < live[$1].since }) else { return self }
        let tuple = live[oldest]
        let taken = UsageEvent.allCases.compactMap { event in
            tuple.counts[event].map { UsageEventCount(event:event,count:min($0,Self.maxCountPerEvent)) }
        }
        let remainder = tuple.counts.compactMapValues { $0 > Self.maxCountPerEvent ? $0 - Self.maxCountPerEvent : nil }
        let body = try UsageBatch(installID:installID,batchID:batchID,appVersion:tuple.dimensions.appVersion,
                                  aiStatus:tuple.dimensions.aiStatus,osMajor:tuple.dimensions.osMajor,events:taken).encoded()
        var next = live
        if remainder.isEmpty { next.remove(at:oldest) }
        else { next[oldest] = Tuple(dimensions:tuple.dimensions,since:tuple.since,counts:remainder) }
        return Self(installID:installID,live:next,pending:UsagePendingBatch(batchID:batchID,createdAt:now,body:body))
    }

    func acknowledging(_ batchID: UUID) -> Self {
        guard pending?.batchID == batchID else { return self }
        return Self(installID:installID,live:live,pending:nil)
    }
}

/// Owns the persisted usage state. Every change is one atomic snapshot write, applied in memory
/// only after it reaches disk, so a crash leaves either the old state or the new one.
actor UsageRecorder {
    static let defaultURL = FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0]
        .appendingPathComponent("Usage/state.json")

    private let url: URL
    private let now: @Sendable () -> Date
    private let newID: @Sendable () -> UUID
    private var loaded: UsageState?
    private var flushing = false
    static let maxBatchesPerFlush = 5

    init(url: URL = UsageRecorder.defaultURL, now: @escaping @Sendable () -> Date = { Date() }, newID: @escaping @Sendable () -> UUID = { UUID() }) {
        self.url = url; self.now = now; self.newID = newID
    }

    func record(_ event: UsageEvent, dimensions: UsageDimensions) {
        _ = commit(state().recording(event,dimensions:dimensions,now:now()))
    }

    /// The batch to send: the pending one if any, otherwise a newly frozen one. Nil when there is
    /// nothing to send or the freeze could not be saved.
    func nextBatch() -> UsagePendingBatch? {
        let expired = state().expiring(now:now())
        let next = expired.pending == nil ? ((try? expired.freezing(now:now(),batchID:newID())) ?? expired) : expired
        guard commit(next) else { return nil }
        return next.pending
    }

    @discardableResult func acknowledge(_ batchID: UUID) -> Bool {
        commit(state().acknowledging(batchID))
    }

    /// Sends the pending batch, then drains further batches after each acceptance, up to
    /// `maxBatchesPerFlush`. Any failure ends the flush; the next flush resends the same batch.
    /// A flush started while another is sending does nothing.
    func flush(via transport: any UsageTransport) async {
        guard !flushing else { return }
        flushing = true
        defer { flushing = false }
        for _ in 0..<Self.maxBatchesPerFlush {
            guard let batch = nextBatch() else { return }
            guard await transport.send(batch.body) == .accepted, acknowledge(batch.batchID) else { return }
        }
    }

    private func state() -> UsageState {
        if let loaded { return loaded }
        let state = UsageSnapshot.read(url) ?? UsageState(installID:newID(),live:[],pending:nil)
        loaded = state
        return state
    }

    private func commit(_ next: UsageState) -> Bool {
        guard next != state() else { return true }
        do {
            try FileManager.default.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true)
            try UsageSnapshot(next).encoded().write(to:url,options:.atomic)
            loaded = next
            return true
        } catch {
            return false
        }
    }
}

/// On-disk form. Event and status names are stored as strings, so a snapshot written by another
/// app version still loads: names this build doesn't know are dropped instead of losing the install ID.
private struct UsageSnapshot: Codable {
    struct Tuple: Codable {
        let appVersion: String
        let aiStatus: String
        let osMajor: Int
        let since: Date
        let counts: [String:Int]
    }
    var schema = 1
    let installID: UUID
    let live: [Tuple]
    let pending: UsagePendingBatch?

    init(_ state: UsageState) {
        installID = state.installID
        pending = state.pending
        live = state.live.map {
            Tuple(appVersion:$0.dimensions.appVersion,aiStatus:$0.dimensions.aiStatus.rawValue,osMajor:$0.dimensions.osMajor,
                  since:$0.since,counts:Dictionary(uniqueKeysWithValues:$0.counts.map { ($0.key.rawValue,$0.value) }))
        }
    }

    func encoded() throws -> Data { try JSONEncoder().encode(self) }

    static func read(_ url: URL) -> UsageState? {
        guard let data = try? Data(contentsOf:url), let snapshot = try? JSONDecoder().decode(Self.self,from:data), snapshot.schema == 1 else { return nil }
        let live = snapshot.live.compactMap { tuple -> UsageState.Tuple? in
            guard let status = UsageAIStatus(rawValue:tuple.aiStatus) else { return nil }
            let counts = Dictionary(uniqueKeysWithValues:tuple.counts.compactMap { key, value in
                UsageEvent(rawValue:key).flatMap { value > 0 ? ($0, value) : nil }
            })
            guard !counts.isEmpty else { return nil }
            return UsageState.Tuple(dimensions:UsageDimensions(appVersion:tuple.appVersion,aiStatus:status,osMajor:tuple.osMajor),since:tuple.since,counts:counts)
        }
        return UsageState(installID:snapshot.installID,live:live,pending:snapshot.pending)
    }
}
