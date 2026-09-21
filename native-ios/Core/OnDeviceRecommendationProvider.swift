import Foundation
import FoundationModels
import OSLog

/// The same capability check drives the UI and the real provider. Availability
/// is temporary: generation can still fail and use the controller's local fallback.
@MainActor
enum RecommendationCompatibility: Equatable {
    case appleIntelligence, requiresNewerOS, deviceNotEligible, notEnabled
    case modelNotReady, unsupportedLocale, unavailable

    static var current: Self {
        guard #available(iOS 26.0, *) else { return .requiresNewerOS }
        let model = SystemLanguageModel.default
        let availability = model.availability
        return resolve(availability, supportsLocale:availability == .available && model.supportsLocale())
    }
    @available(iOS 26.0, *)
    static func resolve(_ availability: SystemLanguageModel.Availability, supportsLocale: Bool) -> Self {
        switch availability {
        case .available: return supportsLocale ? .appleIntelligence : .unsupportedLocale
        case .unavailable(let reason):
            switch reason {
            case .deviceNotEligible: return .deviceNotEligible
            case .appleIntelligenceNotEnabled: return .notEnabled
            case .modelNotReady: return .modelNotReady
            @unknown default: return .unavailable
            }
        }
    }
    var title: String { self == .appleIntelligence ? "Apple Intelligence available" : "Local matching" }
    var detail: String {
        switch self {
        case .appleIntelligence:
            return "Suggestions can use Apple Intelligence on this device. If a request fails, local matching is used."
        case .requiresNewerOS:
            return "Apple Intelligence suggestions require iOS 26 or later. Suggestions will use local matching."
        case .deviceNotEligible:
            return "This device doesn’t support Apple Intelligence. Suggestions will use local matching."
        case .notEnabled:
            return "Apple Intelligence is turned off. Enable it in device Settings to use it; Suggestions will use local matching for now."
        case .modelNotReady:
            return "Apple Intelligence isn’t ready yet. Suggestions will use local matching for now."
        case .unsupportedLocale:
            return "Apple Intelligence doesn’t support the current language or region. Suggestions will use local matching."
        case .unavailable:
            return "Apple Intelligence is currently unavailable. Suggestions will use local matching."
        }
    }
}

@available(iOS 26.0, *)
@Generable
private struct RankedTaplist {
    @Guide(description:"Exactly three distinct candidate IDs, or every candidate ID if fewer than three were supplied.", .count(1...3))
    var ids: [String]
}

@MainActor
struct OnDeviceRecommendationProvider: RecommendationProvider {
    func rank(history: [Beer], candidates: [BeerSuggestion]) async throws -> [String] {
        try await rank(history:history,candidates:candidates,feedback:[])
    }
    func rank(history: [Beer], candidates: [BeerSuggestion], feedback: [BeerFeedback]) async throws -> [String] {
        try await rank(history:history,candidates:candidates,feedback:feedback,preferences:.init())
    }
    func rank(history: [Beer], candidates: [BeerSuggestion], feedback: [BeerFeedback], preferences: SuggestionPreferences) async throws -> [String] {
        try await rank(history:history,candidates:candidates,feedback:feedback,preferences:preferences,context:[])
    }
    func rank(history: [Beer], candidates: [BeerSuggestion], feedback: [BeerFeedback], preferences: SuggestionPreferences, context: [BeerChoiceContext]) async throws -> [String] {
        guard #available(iOS 26.0, *) else { throw RecommendationUnavailable.model }
        let model = SystemLanguageModel.default
        guard RecommendationCompatibility.current == .appleIntelligence else { throw RecommendationUnavailable.model }
        let full = try RecommendationModelInput.prompt(history:history,candidates:candidates,feedback:feedback,preferences:preferences,context:context)
        let compact = try RecommendationPromptBudget.compact(history:history,candidates:candidates,feedback:feedback,preferences:preferences,context:context)
        let lean = try RecommendationPromptBudget.compact(history:history,candidates:candidates,feedback:feedback,preferences:preferences,context:context,lean:true)
        let logger = Logger(subsystem:"org.verily.FSbeerselector",category:"Recommendations")
        var instructionTokens = 0, schemaTokens = 0
        #if compiler(>=6.3)
        if #available(iOS 26.4, macOS 26.4, *) {
            instructionTokens = try await model.tokenCount(for:Instructions(RecommendationPromptBudget.instructions))
            schemaTokens = try await model.tokenCount(for:RankedTaplist.generationSchema)
        }
        #endif
        for prompt in [full,compact,lean] {
            try Task.checkCancellation()
            let fits: Bool
            #if compiler(>=6.3)
            if #available(iOS 26.4, macOS 26.4, *) {
                let promptTokens = try await model.tokenCount(for:Prompt(prompt))
                fits = RecommendationPromptBudget.fits(promptTokens:promptTokens,instructionTokens:instructionTokens,schemaTokens:schemaTokens,contextSize:model.contextSize)
            } else {
                fits = RecommendationPromptBudget.legacyFits(prompt)
            }
            #else
            fits = RecommendationPromptBudget.legacyFits(prompt)
            #endif
            guard fits else { continue }
            let session = LanguageModelSession(model:model,instructions:RecommendationPromptBudget.instructions)
            do {
                return try await session.respond(to:prompt,generating:RankedTaplist.self,
                    options:GenerationOptions(temperature:0,maximumResponseTokens:RecommendationPromptBudget.outputTokens)).content.ids
            } catch LanguageModelSession.GenerationError.exceededContextWindowSize {
                // Model/schema overhead may change. Retry with a fresh, more compact session.
                logger.notice("Model context limit reached; attempting compact input or local matching")
            }
        }
        logger.notice("Recommendation input exceeds context budget; using local matching")
        throw RecommendationUnavailable.contextBudget
    }
}
enum RecommendationUnavailable: Error { case model, contextBudget }

/// An uncooperative model must not hold the UI open after timeout/cancellation.
/// Only this MainActor owner can resume the continuation; late completions are ignored.
@MainActor
final class RecommendationDeadline<Value> {
    private var continuation: CheckedContinuation<Value?,Never>?
    private var expires = ContinuousClock.now
    private var worker: Task<Void,Never>?
    private var timer: Task<Void,Never>?
    static func run(seconds: Double, operation: @escaping @MainActor () async throws -> Value) async -> Value? {
        guard seconds.isFinite, seconds > 0 else { return nil }
        let race = RecommendationDeadline()
        race.expires = .now.advanced(by:.seconds(seconds))
        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                race.continuation = continuation
                if Task.isCancelled { race.finish(nil); return }
                race.worker = Task { race.finish(try? await operation()) }
                race.timer = Task {
                    do { try await Task.sleep(for:.seconds(seconds)); race.finish(nil) }
                    catch {}
                }
            }
        } onCancel: {
            Task { @MainActor in race.finish(nil) }
        }
    }
    private func finish(_ ids: Value?) {
        guard let continuation else { return }
        self.continuation = nil
        worker?.cancel(); timer?.cancel(); worker = nil; timer = nil
        continuation.resume(returning:ContinuousClock.now <= expires ? ids : nil)
    }
}
