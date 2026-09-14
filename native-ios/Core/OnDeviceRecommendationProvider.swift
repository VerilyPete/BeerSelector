import Foundation
import FoundationModels
import OSLog

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
        guard model.availability == .available, model.supportsLocale() else { throw RecommendationUnavailable.model }
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
final class RecommendationDeadline {
    private var continuation: CheckedContinuation<[String]?,Never>?
    private var worker: Task<Void,Never>?
    private var timer: Task<Void,Never>?
    static func run(seconds: Double, operation: @escaping @MainActor () async throws -> [String]) async -> [String]? {
        let race = RecommendationDeadline()
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
    private func finish(_ ids: [String]?) {
        guard let continuation else { return }
        self.continuation = nil
        worker?.cancel(); timer?.cancel(); worker = nil; timer = nil
        continuation.resume(returning:ids)
    }
}
