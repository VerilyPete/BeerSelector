import Foundation
import Combine

enum CheckInResult: String {
    case added = "Added to queue"
    case savedForRetry = "Saved for retry"
    case needsReview = "Not confirmed — review Pending Operations before retrying"
    case unavailable = "No longer eligible"
    case failed = "Could not save this check-in"
}
struct RecommendationSnapshot: Equatable {
    var epoch: UUID
    var identity: String?
    var offline: Bool
    var taplist: [Beer]
    var history: [Beer]
    var excluded: Set<String>
    var feedback: [BeerFeedback] = []
    var repeatHistory: [Beer] = []
    var taplistValidation: UUID?
    var tastingValidation: UUID?
    var queueValidation: UUID?
}

enum RecommendationRetrievalSource { case local, semantic, mixed }

/// Why an Apple Intelligence request fell back to local matching. A stale or
/// cancelled generation publishes nothing, so it is never a fallback.
enum RecommendationFallback: Equatable {
    case providerFailure, invalidOutput, deadlineExpired, contextBudgetExhausted
}
extension Diagnostics.SuggestionOutcome {
    init(_ fallback: RecommendationFallback) {
        switch fallback {
        case .providerFailure: self = .providerFailure
        case .invalidOutput: self = .invalidOutput
        case .deadlineExpired: self = .deadline
        case .contextBudgetExhausted: self = .contextBudget
        }
    }
}

@MainActor final class RecommendationController: ObservableObject {
    @Published private(set) var suggestions: [BeerSuggestion] = []
    @Published private(set) var generating = false
    @Published private(set) var submitting = false
    @Published private(set) var message: String?
    @Published private(set) var usedModel = false
    @Published private(set) var retrievalSource = RecommendationRetrievalSource.local
    @Published private(set) var historyCount = 0
    @Published private(set) var outcomes: [String:CheckInResult] = [:]
    @Published private(set) var preferences = SuggestionPreferences()
    /// The mode the visible results were generated under; a later mode change
    /// applies to the next generation, never to results already on screen.
    @Published private(set) var resultMode: SuggestionMode?
    /// Set only when Apple Intelligence was asked and local matches stand in.
    @Published private(set) var fallback: RecommendationFallback?
    /// What the sheet labels and offers as input: results on screen keep the
    /// mode that produced them until they are cleared or regenerated.
    func displayedMode(current: SuggestionMode) -> SuggestionMode {
        suggestions.isEmpty ? current : resultMode ?? current
    }
    /// The retry button may only promise Apple Intelligence when the next
    /// generation will actually ask it.
    func canRetryAppleIntelligence(current: SuggestionMode) -> Bool {
        fallback != nil && current == .appleIntelligence
    }
    func setPreferences(_ value: SuggestionPreferences) {
        guard !submitting, value != preferences else { return }
        cancel(); preferences = value
    }
    /// Local matching takes style chips, never free text. A typed request the
    /// chips can't express exactly is cleared, not partially extracted. Results
    /// already on screen keep the request they were generated with.
    func conformRequestToMode() {
        guard suggestions.isEmpty, !generating, clearRequestLocalMatchingCannotUse() else { return }
        message = Self.clearedRequestMessage
    }
    private static let clearedRequestMessage = "Local matching uses style choices, so your typed request was cleared."
    private func clearRequestLocalMatchingCannotUse() -> Bool {
        guard !submitting, model?.suggestionMode.mode == .localMatching,
              StyleChips(request:preferences.request) == nil else { return false }
        setPreferences(SuggestionPreferences(container:preferences.container,abv:preferences.abv))
        return true
    }
    /// Checks a selection against the saved taplist only. It describes cached
    /// data and never claims the live taplist is empty.
    func hasSavedMatches(for preferences: SuggestionPreferences) -> Bool {
        guard let current = model?.recommendationSnapshot else { return false }
        return !RecommendationRules.eligible(taplist:current.taplist,history:current.repeatHistory + current.history,
            excluded:current.excluded,feedback:current.feedback,preferences:preferences).isEmpty
    }
    var provider: any RecommendationProvider
    /// An M1 iPad answers in 7–8.5 s once the model is loaded; loading adds more.
    var timeout: Double = 20
    var deadlineSeconds: Double { timeout.isFinite ? max(0,timeout) : 0 }
    var diagnostics = Diagnostics.shared
    /// Loads the model while the person is still choosing, so the first request
    /// doesn't spend its deadline on loading.
    func prepare() {
        guard let model, !model.previewMode, model.suggestionMode.mode == .appleIntelligence else { return }
        provider.prewarm()
    }
    /// Debug fixtures install an offline provider; real previews never rank.
    var ranksInPreview = false
    #if DEBUG
    /// Offline check-in outcomes for fixtures, assigned in card order. Previews never write to the queue.
    var previewCheckInOutcomes: [CheckInResult]?
    var previewSubmitDelay: Duration = .seconds(1.5)
    #endif
    var retrievalTimeout: Double = 2
    var semanticRetriever: (any SemanticRetrieving)?
    private weak var model: AppModel?
    private var snapshot: RecommendationSnapshot?
    private var choiceID: String?
    func recordSelection(id: String, selected: Bool) {
        guard let model, let account = model.recommendationAccount, let choiceID, snapshot?.epoch == model.recommendationSnapshot.epoch else { return }
        do { try model.db?.updateChoice(id:choiceID,account:account,beerID:id,selected:selected) }
        catch { model.error = error.localizedDescription }
    }
    private func recordOutcome(id: String, result: CheckInResult) {
        guard let model, let account = model.recommendationAccount, let choiceID else { return }
        do { try model.db?.updateChoice(id:choiceID,account:account,beerID:id,outcome:result) }
        catch { model.error = error.localizedDescription }
    }
    private var generation = UUID()
    private struct PipelineResult {
        let ids: [String]?
        let candidates: [BeerSuggestion]
        let source: RecommendationRetrievalSource
        var failure: RecommendationFallback? = nil
        /// The provider abandoned the request: publish nothing, announce nothing.
        var cancelled = false
    }
    private var rankingTask: Task<PipelineResult?,Never>?
    private var modeChanges: AnyCancellable?
    init(model: AppModel, provider: (any RecommendationProvider)? = nil) {
        self.model = model; self.provider = provider ?? OnDeviceRecommendationProvider()
        semanticRetriever = model.semanticIndex.enabled ? model.semanticIndex : nil
        modeChanges = model.suggestionMode.$mode.dropFirst().sink { [weak self] _ in
            MainActor.assumeIsolated { self?.modeWillChange() }
        }
    }
    /// Like a preference change, a mode change invalidates a generation in
    /// flight. A submission always finishes: cancelling it would drop outcomes
    /// for requests already sent.
    private func modeWillChange() {
        guard generating else { return }
        cancel()
    }
    func cancel() {
        rankingTask?.cancel(); rankingTask = nil
        generation = UUID(); snapshot = nil; choiceID = nil; suggestions = []; outcomes = [:]
        generating = false; submitting = false; message = nil; historyCount = 0; usedModel = false; retrievalSource = .local
        resultMode = nil; fallback = nil
    }
    func invalidateIfChanged() {
        guard !submitting, let snapshot, snapshot != model?.recommendationSnapshot else { return }
        if snapshot.epoch == model?.recommendationSnapshot.epoch,
           snapshot.identity == model?.session?.identity, !outcomes.isEmpty {
            message = "Your taplist or queue changed. Previous check-in results are shown below."
            return
        }
        cancel(); message = "Your taplist or queue changed. Find fresh suggestions."
    }
    func generate() async {
        guard !generating, !submitting, let model else { return }
        let mode = model.suggestionMode.mode
        guard mode != .off else { return }
        let previousIDs = Set(suggestions.map(\.id))
        let cleared = clearRequestLocalMatchingCannotUse()
        let preferences = preferences
        cancel()
        if cleared { message = Self.clearedRequestMessage }
        let token = generation
        let account = model.recommendationSnapshot
        generating = true
        defer { if token == generation { generating = false } }
        if !model.previewMode {
            guard await model.validateRecommendationSources() else {
                if token == generation { message = "Connect and refresh your taplist, tastings, and queue to get suggestions." }
                return
            }
        }
        guard token == generation, !Task.isCancelled, account.epoch == model.recommendationSnapshot.epoch,
              account.identity == model.session?.identity, model.isMember else { return }
        let started = ContinuousClock.now
        let deadline = started.advanced(by:.seconds(deadlineSeconds))
        let current = model.recommendationSnapshot
        let owner = model.recommendationAccount
        snapshot = current; historyCount = current.history.count
        let context: [BeerChoiceContext]
        do { context = try model.recommendationAccount.map { try model.db?.choiceContexts(account:$0) ?? [] } ?? [] }
        catch { model.error = error.localizedDescription; context = [] }
        let eligible = RecommendationRules.eligible(taplist:current.taplist,history:current.repeatHistory + current.history,
            excluded:current.excluded,feedback:current.feedback,preferences:preferences)
        let retriever = LocalTaplistRetriever(eligible:eligible,history:current.history,feedback:current.feedback,
            preferences:preferences,context:context)
        let candidates = retriever.candidates(previousIDs:previousIDs)
        guard !candidates.isEmpty else { message = "No eligible beers match these preferences. Try adjusting your style request, container, or ABV preference."; return }
        let provider = provider, semanticRetriever = semanticRetriever
        let retrievalTimeout = retrievalTimeout
        let retrievalToken = semanticRetriever?.validityToken
        func isCurrent() -> Bool {
            guard token == generation, preferences == self.preferences, current == model.recommendationSnapshot,
                  owner == model.recommendationAccount,
                  retrievalToken == semanticRetriever?.validityToken else { return false }
            do { return context == (try owner.map { try model.db?.choiceContexts(account:$0) ?? [] } ?? []) }
            catch { return false }
        }
        func remaining() -> Double {
            let value = ContinuousClock.now.duration(to:deadline).components
            return max(0,Double(value.seconds) + Double(value.attoseconds)/1e18)
        }
        let task = Task { @MainActor () -> PipelineResult? in
            guard mode == .appleIntelligence else { return nil }
            guard !model.previewMode || ranksInPreview else {
                return PipelineResult(ids:nil,candidates:candidates,source:.local,failure:.providerFailure)
            }
            return await RecommendationDeadline.run(seconds:remaining()) {
                var shortlist = candidates
                var source = RecommendationRetrievalSource.local
                if preferences.styleRequest.needsModel, let semanticRetriever, let owner, isCurrent() {
                    let request = SemanticRetrievalRequest(epoch:current.epoch,account:owner,taplist:current.taplist,
                        eligibleIDs:Set(eligible.map(\.id)),query:preferences.request)
                    let ids = await RecommendationDeadline.run(seconds:min(retrievalTimeout,remaining())) {
                        await semanticRetriever.retrieve(request) ?? []
                    }
                    guard !Task.isCancelled, isCurrent(), remaining() > 0 else { throw CancellationError() }
                    if let ids, !ids.isEmpty {
                        shortlist = SemanticCandidates.merge(ids:ids,local:retriever,previousIDs:previousIDs)
                        if shortlist.contains(where:{ $0.semanticEvidence != nil }) {
                            source = shortlist.allSatisfy { $0.semanticEvidence != nil } ? .semantic : .mixed
                        }
                    }
                }
                guard !Task.isCancelled, isCurrent(), remaining() > 0 else { throw CancellationError() }
                do {
                    let ids = try await provider.rank(history:current.history,candidates:shortlist,feedback:current.feedback,preferences:preferences,context:context)
                    return PipelineResult(ids:ids,candidates:shortlist,source:source)
                } catch RecommendationUnavailable.contextBudget where source != .local {
                    // Semantic evidence must not disable otherwise available local AI.
                    // This retry remains inside the original pipeline deadline.
                    guard !Task.isCancelled, isCurrent(), remaining() > 0 else { throw CancellationError() }
                    shortlist = candidates; source = .local
                    do {
                        let ids = try await provider.rank(history:current.history,candidates:shortlist,feedback:current.feedback,preferences:preferences,context:context)
                        return PipelineResult(ids:ids,candidates:shortlist,source:source)
                    }
                    catch { return Self.failed(error,candidates:shortlist,source:source) }
                } catch {
                    return Self.failed(error,candidates:shortlist,source:source)
                }
            }
        }
        rankingTask = task
        let result = await task.value
        if token == generation { rankingTask = nil }
        guard !Task.isCancelled, isCurrent() else {
            if token == generation { cancel(); message = "Your taplist or queue changed. Find fresh suggestions." }
            return
        }
        if result?.cancelled == true { return }
        if let result, let ids = result.ids, let ranked = RecommendationRules.choose(ids:ids,from:result.candidates) {
            suggestions = ranked; usedModel = true; retrievalSource = result.source
            recordAppleIntelligence(.answered,since:started)
        } else {
            // A failed/late model always uses the established local fallback order.
            suggestions = Array(candidates.prefix(3)); usedModel = false; retrievalSource = .local
            if mode == .appleIntelligence {
                // Past the staleness guard, an empty result means the shared deadline expired.
                fallback = result.map { $0.failure ?? .invalidOutput } ?? .deadlineExpired
                recordAppleIntelligence(fallback.map(Diagnostics.SuggestionOutcome.init) ?? .invalidOutput,since:started)
            }
            if preferences.styleRequest.needsModel {
                message = "Local matching applied your filters, but couldn’t interpret the additional style or mood wording. Try a simple style such as IPA or stout."
            }
        }
        resultMode = mode
        UsageEvent.suggestionOutcome(mode:mode,usedModel:usedModel,fallback:fallback).forEach { model.recordUsage($0) }
        if let account = model.recommendationAccount {
            let choice = BeerChoiceContext(taplist:current.taplist,shown:suggestions.map(\.id),preferences:preferences,usedModel:usedModel,taplistValidation:current.taplistValidation)
            do { try model.db?.saveChoicePresentation(choice,account:account); choiceID = choice.id }
            catch { model.error = error.localizedDescription }
        }
    }
    private func recordAppleIntelligence(_ outcome: Diagnostics.SuggestionOutcome, since started: ContinuousClock.Instant) {
        guard model?.previewMode == false else { return }
        let elapsed = started.duration(to:.now).components
        diagnostics.recordSuggestion(outcome,seconds:Double(elapsed.seconds) + Double(elapsed.attoseconds)/1e18)
    }
    #if DEBUG
    private func submitPreview(ids: Set<String>, outcomes results: [CheckInResult]) async {
        guard !generating, !submitting, !results.isEmpty, ids.isSubset(of:Set(suggestions.map(\.id))) else { return }
        let token = generation
        let selected = suggestions.filter { ids.contains($0.id) && outcomes[$0.id] == nil }
        submitting = true; message = nil
        defer { if token == generation { submitting = false } }
        try? await Task.sleep(for:previewSubmitDelay)
        guard token == generation else { return }
        for (index,suggestion) in selected.enumerated() { outcomes[suggestion.id] = results[index % results.count] }
    }
    #endif
    private static func failed(_ error: Error, candidates: [BeerSuggestion], source: RecommendationRetrievalSource) -> PipelineResult {
        if error is CancellationError { return PipelineResult(ids:nil,candidates:candidates,source:source,cancelled:true) }
        let reason: RecommendationFallback
        if case RecommendationUnavailable.contextBudget = error { reason = .contextBudgetExhausted } else { reason = .providerFailure }
        return PipelineResult(ids:nil,candidates:candidates,source:source,failure:reason)
    }
    func submit(ids: Set<String>) async {
        #if DEBUG
        if let model, model.previewMode, let previewCheckInOutcomes {
            await submitPreview(ids:ids,outcomes:previewCheckInOutcomes); return
        }
        #endif
        guard !generating, !submitting, let model, !model.previewMode, let snapshot,
              !ids.isEmpty, ids.isSubset(of:Set(suggestions.map(\.id))),
              snapshot.epoch == model.recommendationSnapshot.epoch,
              snapshot.identity == model.session?.identity else { return }
        let token = generation
        let selected = suggestions.filter { ids.contains($0.id) && outcomes[$0.id] == nil }
        guard !selected.isEmpty else { return }
        for suggestion in selected { recordSelection(id:suggestion.id,selected:true) }
        submitting = true; message = nil
        defer { if token == generation { submitting = false } }
        guard await model.validateRecommendationSources() else {
            if token == generation { message = "Couldn’t confirm current availability. Nothing was added. Refresh and try again." }
            return
        }
        let validated = model.recommendationSnapshot
        guard token == generation, snapshot.epoch == validated.epoch, snapshot.identity == validated.identity else { return }
        for suggestion in selected {
            let current = model.recommendationSnapshot
            guard token == generation, !Task.isCancelled, current.epoch == validated.epoch,
                  current.identity == validated.identity, current.taplistValidation == validated.taplistValidation,
                  current.tastingValidation == validated.tastingValidation, !current.offline else {
                if token == generation { message = "Submission stopped. Review the per-beer results before trying again." }
                return
            }
            let matching = RecommendationRules.eligible(taplist:current.taplist,history:current.repeatHistory + current.history,excluded:current.excluded,feedback:current.feedback,preferences:preferences)
            guard matching.contains(where:{ $0.id == suggestion.id }), !current.excluded.contains(suggestion.id),
                  let beer = current.taplist.first(where:{ $0.id == suggestion.id }), preferences.allows(beer),
                  preferences.abv == .any || beer.abv.map({ $0.isFinite && $0 >= 0 }) == true else {
                outcomes[suggestion.id] = .unavailable; recordOutcome(id:suggestion.id,result:.unavailable); continue
            }
            let result = await model.checkIn(beer,recommendation:true,choiceContextID:choiceID)
            guard token == generation, validated.epoch == model.recommendationSnapshot.epoch else { return }
            outcomes[suggestion.id] = result
            recordOutcome(id:suggestion.id,result:result)
        }
        self.snapshot = model.recommendationSnapshot
    }
}
