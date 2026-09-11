import Foundation
import os
import MetricKit

/// Only fixed labels and numeric aggregates enter this store. Never retain requests,
/// payloads, errors, account data, or raw MetricKit reports.
final class Diagnostics: @unchecked Sendable {
    static let shared = Diagnostics(journal: ProcessInfo.processInfo.environment["BEERSELECTOR_TEST_HOST"] == "1" ||
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil ? nil : .shared)
    private let journal: DiagnosticJournal?
    init(journal: DiagnosticJournal? = nil) { self.journal = journal }
    enum Operation: String, CaseIterable, Codable { case refresh, parsing, transaction, login, queue, network }
    enum Outcome: String, Codable { case success, failure, cancelled }
    struct Aggregate {
        var count = 0
        var successes = 0
        var failures = 0
        var cancellations = 0
        var seconds = 0.0
        var maximumSeconds = 0.0
    }
    private let lock = NSLock()
    private var values: [Operation: Aggregate] = [:]
    private var taskCount = 0
    private var taskSeconds = 0.0
    private var redirects = 0
    private var metricReports = 0
    private var diagnosticReports = 0
    private var cpuSeconds = 0.0
    private let logger = Logger(subsystem: "org.verily.FSbeerselector", category: "Performance")
    private let signposter = OSSignposter(subsystem: "org.verily.FSbeerselector", category: .pointsOfInterest)

    static func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }
    final class Interval {
        private let owner: Diagnostics
        private let operation: Operation
        private let state: OSSignpostIntervalState
        private let identifier = UUID()
        private let start = ProcessInfo.processInfo.systemUptime
        private let lock = NSLock()
        private var ended = false
        fileprivate init(owner: Diagnostics, operation: Operation) {
            self.owner = owner; self.operation = operation
            owner.journal?.record(.operationBegan,operation:operation,interval:identifier)
            state = owner.signposter.beginInterval("Operation", id: owner.signposter.makeSignpostID(), "\(operation.rawValue, privacy: .public)")
        }
        func finish(_ outcome: Outcome) {
            lock.lock(); defer { lock.unlock() }
            guard !ended else { return }; ended = true
            owner.signposter.endInterval("Operation", state, "\(self.operation.rawValue, privacy: .public) \(outcome.rawValue, privacy: .public)")
            let duration = ProcessInfo.processInfo.systemUptime - start
            owner.record(operation, outcome: outcome, seconds: duration)
            owner.journal?.record(.operationEnded,operation:operation,interval:identifier,outcome:outcome,seconds:duration)
        }
        deinit { finish(.cancelled) }
    }
    func begin(_ operation: Operation) -> Interval { Interval(owner: self, operation: operation) }
    func measure<T>(_ operation: Operation, _ work: () throws -> T) rethrows -> T {
        let interval = begin(operation)
        do { let result = try work(); interval.finish(.success); return result }
        catch { interval.finish(Self.isCancellation(error) ? .cancelled : .failure); throw error }
    }
    private func record(_ operation: Operation, outcome: Outcome, seconds: Double) {
        lock.lock()
        var value = values[operation, default: Aggregate()]
        value.count += 1; value.seconds += seconds; value.maximumSeconds = max(value.maximumSeconds, seconds)
        switch outcome {
        case .success: value.successes += 1
        case .failure: value.failures += 1
        case .cancelled: value.cancellations += 1
        }
        values[operation] = value
        lock.unlock()
        logger.debug("\(operation.rawValue, privacy: .public) \(outcome.rawValue, privacy: .public) seconds=\(seconds)")
    }
    func snapshot() -> [Operation: Aggregate] { lock.lock(); defer { lock.unlock() }; return values }
    func recordTask(seconds: Double, redirects: Int) {
        guard seconds.isFinite, seconds >= 0, redirects >= 0 else { return }
        lock.lock(); defer { lock.unlock() }
        taskCount += 1; taskSeconds += seconds; self.redirects += redirects
        journal?.record(.networkMetrics,seconds:seconds,count:redirects)
        signposter.emitEvent("URLSession Task", "seconds=\(seconds) redirects=\(redirects)")
    }
    func recordReports(metrics: Int = 0, diagnostics: Int = 0, cpuSeconds: Double = 0) {
        lock.lock(); defer { lock.unlock() }
        metricReports += metrics; diagnosticReports += diagnostics
        journal?.record(.metricReports,seconds:cpuSeconds,count:diagnostics)
        if cpuSeconds.isFinite, cpuSeconds >= 0 { self.cpuSeconds += cpuSeconds }
    }
    func report() -> String {
        lock.lock(); defer { lock.unlock() }
        var lines = ["Session performance aggregates (seconds)"]
        for operation in Operation.allCases {
            let v = values[operation, default: Aggregate()]
            lines.append("\(operation.rawValue): count=\(v.count) ok=\(v.successes) failed=\(v.failures) cancelled=\(v.cancellations) total=\(v.seconds) max=\(v.maximumSeconds)")
        }
        lines.append("URLSession tasks=\(taskCount) seconds=\(taskSeconds) redirects=\(redirects)")
        lines.append("MetricKit reports=\(metricReports) diagnostics=\(diagnosticReports) CPU seconds=\(cpuSeconds)")
        return lines.joined(separator: "\n")
    }
}

final class DeviceMetrics: NSObject, MXMetricManagerSubscriber {
    static let shared = DeviceMetrics()
    func start() { MXMetricManager.shared.add(self) }
    func didReceive(_ payloads: [MXMetricPayload]) {
        Diagnostics.shared.recordReports(metrics: payloads.count, cpuSeconds: payloads.reduce(0) {
            $0 + ($1.cpuMetrics?.cumulativeCPUTime.converted(to: .seconds).value ?? 0)
        })
    }
    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        Diagnostics.shared.recordReports(diagnostics: payloads.count)
    }
}
