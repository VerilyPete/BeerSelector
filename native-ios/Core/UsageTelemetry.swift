import UIKit

extension UsageDimensions {
    @MainActor static var current: Self {
        Self(appVersion:Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "0.0.0",
             aiStatus:UsageAIStatus(RecommendationCompatibility.current),
             osMajor:ProcessInfo.processInfo.operatingSystemVersion.majorVersion)
    }
}

@MainActor protocol UsageRecording: AnyObject {
    func record(_ event: UsageEvent)
}

extension UsageEvent {
    /// Events for suggestions that were published: the source that produced them and, when
    /// Apple Intelligence was attempted and local matching stood in, why it fell back.
    static func suggestionOutcome(mode: SuggestionMode, usedModel: Bool, fallback: RecommendationFallback?) -> [UsageEvent] {
        if usedModel { return [.appleIntelligenceUsed] }
        guard mode == .appleIntelligence, let fallback else { return [.localMatchingUsed] }
        switch fallback {
        case .deadlineExpired: return [.localMatchingUsed,.fallbackDeadlineExpired]
        case .providerFailure: return [.localMatchingUsed,.fallbackProviderFailure]
        case .invalidOutput: return [.localMatchingUsed,.fallbackInvalidOutput]
        case .contextBudgetExhausted: return [.localMatchingUsed,.fallbackContextBudget]
        }
    }
}

/// The app's entry point to usage telemetry. Keeps recorder calls in the order they were made,
/// knows whether the app is active, refreshes `lastActiveAt` once a minute while active, and
/// flushes on moving to the background and when a session starts.
@MainActor final class UsageTelemetry: UsageRecording {
    typealias BackgroundTask = @MainActor (@escaping @Sendable () async -> Void) async -> Void
    static let refreshInterval: Duration = .seconds(60)

    let recorder: UsageRecorder
    private let transport: (any UsageTransport)?
    private let dimensions: @MainActor () -> UsageDimensions
    private let backgroundTask: BackgroundTask
    private var active = false
    private var tail: Task<Void,Never>?
    private var flushes: [UUID:Task<Void,Never>] = [:]
    private var ticker: Task<Void,Never>?

    init(recorder: UsageRecorder, transport: (any UsageTransport)?, dimensions: @escaping @MainActor () -> UsageDimensions, backgroundTask: @escaping BackgroundTask) {
        self.recorder = recorder; self.transport = transport; self.dimensions = dimensions; self.backgroundTask = backgroundTask
    }

    static func live(api: BeerAPI) -> UsageTelemetry {
        UsageTelemetry(recorder:UsageRecorder(),transport:UsageHTTPTransport(api:api),dimensions:{ .current },backgroundTask:applicationBackgroundTask)
    }

    func record(_ event: UsageEvent) {
        let dimensions = dimensions()
        let whileActive = active
        enqueue { await $0.record(event,dimensions:dimensions,whileActive:whileActive) }
    }

    func scenePhase(_ phase: UsagePhase) {
        active = phase == .active
        let dimensions = dimensions()
        enqueue { [weak self] recorder in
            let started = await recorder.phaseChanged(phase,dimensions:dimensions)
            if started || phase == .background { self?.flush() }
        }
        ticker?.cancel()
        ticker = active ? Task { [recorder] in
            while !Task.isCancelled {
                try? await Task.sleep(for:Self.refreshInterval)
                if Task.isCancelled { return }
                await recorder.refreshActivity()
            }
        } : nil
    }

    /// Waits for every recorder call and flush started so far.
    func idle() async {
        await tail?.value
        for flush in flushes.values { await flush.value }
    }

    private func enqueue(_ work: @escaping @MainActor (UsageRecorder) async -> Void) {
        let previous = tail
        let recorder = recorder
        tail = Task { await previous?.value; await work(recorder) }
    }

    private func flush() {
        guard let transport else { return }
        let recorder = recorder
        let backgroundTask = backgroundTask
        let id = UUID()
        flushes[id] = Task { [weak self] in
            await backgroundTask { await recorder.flush(via:transport) }
            self?.flushes[id] = nil
        }
    }

    private static let applicationBackgroundTask: BackgroundTask = { work in
        @MainActor final class Assertion { var id = UIBackgroundTaskIdentifier.invalid }
        let assertion = Assertion()
        let task = Task { await work() }
        assertion.id = UIApplication.shared.beginBackgroundTask(withName:"usage-flush") {
            task.cancel()
            UIApplication.shared.endBackgroundTask(assertion.id)
            assertion.id = .invalid
        }
        await task.value
        if assertion.id != .invalid { UIApplication.shared.endBackgroundTask(assertion.id); assertion.id = .invalid }
    }
}
