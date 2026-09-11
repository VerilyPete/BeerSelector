import Foundation

/// A bounded local history, written on a serial utility queue. Sharing is user initiated.
/// An unfinished operation or missing clean shutdown is NOT classified as a crash.
final class DiagnosticJournal: @unchecked Sendable {
    static let shared = DiagnosticJournal(url: FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0]
        .appendingPathComponent("Diagnostics/recent.json"))
    enum Kind: String, Codable {
        case launch, active, inactive, background, operationBegan, operationEnded
        case mainThreadDelayed, mainThreadRecovered, networkMetrics, metricReports
    }
    struct Entry: Codable {
        let time: Date
        let session: UUID
        let version: String
        let build: String
        let kind: Kind
        let operation: Diagnostics.Operation?
        let interval: UUID?
        let outcome: Diagnostics.Outcome?
        let seconds: Double?
        let count: Int?
    }
    struct Report: Codable {
        var schema = 1
        var entries: [Entry]
    }
    private let queue = DispatchQueue(label:"BeerSelector.diagnostic-journal",qos:.utility)
    private let url: URL
    private let capacity: Int
    private let session = UUID()
    private let version = Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "unknown"
    private let build = Bundle.main.object(forInfoDictionaryKey:"CFBundleVersion") as? String ?? "unknown"
    private var entries: [Entry] = []
    private var scheduled = false
    private var generation = 0
    private static let maxBytes = 256 * 1024

    init(url: URL, capacity: Int = 128) {
        self.url = url; self.capacity = max(1,min(capacity,128))
        queue.async { [self] in
            if let size = try? url.resourceValues(forKeys:[.fileSizeKey]).fileSize,
               size <= Self.maxBytes,
               let data = try? Data(contentsOf:url),
               let saved = try? JSONDecoder().decode(Report.self,from:data), saved.schema == 1 {
                entries = Array(saved.entries.suffix(self.capacity))
            }
        }
    }
    func record(_ kind: Kind, operation: Diagnostics.Operation? = nil, interval: UUID? = nil,
                outcome: Diagnostics.Outcome? = nil, seconds: Double? = nil, count: Int? = nil) {
        let entry = Entry(time:Date(),session:session,version:version,build:build,kind:kind,
                          operation:operation,interval:interval,outcome:outcome,
                          seconds:seconds.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil },count:count)
        queue.async { [self] in
            entries.append(entry)
            if entries.count > capacity { entries.removeFirst(entries.count - capacity) }
            scheduleWrite()
        }
    }
    private func scheduleWrite() {
        guard !scheduled else { return }; scheduled = true
        let token = generation
        queue.asyncAfter(deadline:.now() + .milliseconds(250)) { [self] in
            guard token == generation else { return }
            scheduled = false
            try? persist()
        }
    }
    private func encoded() throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted,.sortedKeys]
        return try encoder.encode(Report(entries:entries))
    }
    private func persist() throws {
        let folder = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
        var excluded = folder
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try excluded.setResourceValues(values)
        try encoded().write(to:url,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
    }
    /// Flushes pending history off MainActor. Also supports restart/persistence tests.
    func flush() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void,Error>) in
            queue.async { [self] in
                do { generation += 1; scheduled = false; try persist(); continuation.resume() }
                catch { continuation.resume(throwing:error) }
            }
        }
    }
    func report() async -> Report {
        await withCheckedContinuation { continuation in
            queue.async { [self] in continuation.resume(returning:Report(entries:entries)) }
        }
    }
    func export() async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            queue.async { [self] in
                do {
                    generation += 1; scheduled = false
                    try persist()
                    let folder = url.deletingLastPathComponent().appendingPathComponent("Exports")
                    try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
                    let exportURL = folder.appendingPathComponent("BeerSelector-diagnostics.json")
                    try encoded().write(to:exportURL,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
                    continuation.resume(returning:exportURL)
                } catch { continuation.resume(throwing:error) }
            }
        }
    }
    func clear() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void,Error>) in
            queue.async { [self] in
                generation += 1; scheduled = false; entries = []
                do {
                    try persist()
                    let exportURL = url.deletingLastPathComponent().appendingPathComponent("Exports/BeerSelector-diagnostics.json")
                    if FileManager.default.fileExists(atPath:exportURL.path) { try FileManager.default.removeItem(at:exportURL) }
                    continuation.resume()
                } catch { continuation.resume(throwing:error) }
            }
        }
    }
}

/// Detects sustained foreground main-thread delays; not a crash detector.
final class MainThreadMonitor: @unchecked Sendable {
    static let shared = MainThreadMonitor(journal:.shared)
    struct Probe {
        private(set) var pendingSince: TimeInterval?
        private(set) var reported = false
        mutating func begin(at now: TimeInterval) { pendingSince = now; reported = false }
        mutating func delayed(at now: TimeInterval) -> TimeInterval? {
            guard let start = pendingSince, !reported, now - start >= 2 else { return nil }
            reported = true; return now - start
        }
        mutating func acknowledge(at now: TimeInterval) -> TimeInterval? {
            let duration = reported ? pendingSince.map { max(0,now - $0) } : nil
            self = Probe(); return duration
        }
    }
    private let queue = DispatchQueue(label:"BeerSelector.main-thread-monitor",qos:.utility)
    private let journal: DiagnosticJournal
    private var timer: DispatchSourceTimer?
    private var probe = Probe()
    private var generation = 0
    init(journal: DiagnosticJournal) { self.journal = journal }
    func setActive(_ active: Bool) {
        queue.async { [self] in
            generation += 1; timer?.cancel(); timer = nil; probe = Probe()
            guard active else { return }
            let next = DispatchSource.makeTimerSource(queue:queue)
            next.schedule(deadline:.now() + 1,repeating:1,leeway:.milliseconds(100))
            next.setEventHandler { [weak self] in self?.tick() }
            timer = next; next.resume()
        }
    }
    private func tick() {
        let now = ProcessInfo.processInfo.systemUptime
        if probe.pendingSince != nil {
            if let duration = probe.delayed(at:now) { journal.record(.mainThreadDelayed,seconds:duration) }
            return
        }
        probe.begin(at:now)
        let token = generation
        DispatchQueue.main.async { [weak self] in
            let acknowledged = ProcessInfo.processInfo.systemUptime
            self?.queue.async { [weak self] in
                guard let self, token == self.generation else { return }
                if let duration = self.probe.acknowledge(at:acknowledged) {
                    self.journal.record(.mainThreadRecovered,seconds:duration)
                }
            }
        }
    }
}
