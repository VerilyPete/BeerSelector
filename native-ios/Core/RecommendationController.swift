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

@MainActor final class RecommendationController: ObservableObject {
    @Published private(set) var suggestions: [BeerSuggestion] = []
    @Published private(set) var generating = false
    @Published private(set) var submitting = false
    @Published private(set) var message: String?
    @Published private(set) var usedModel = false
    @Published private(set) var historyCount = 0
    @Published private(set) var outcomes: [String:CheckInResult] = [:]
    @Published private(set) var preferences = SuggestionPreferences()
    func setPreferences(_ value: SuggestionPreferences) {
        guard !submitting, value != preferences else { return }
        cancel(); preferences = value
    }
    var provider: any RecommendationProvider
    var timeout: Double = 8
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
    private var rankingTask: Task<[String]?,Never>?
    init(model: AppModel, provider: (any RecommendationProvider)? = nil) {
        self.model = model; self.provider = provider ?? OnDeviceRecommendationProvider()
    }
    func cancel() {
        rankingTask?.cancel(); rankingTask = nil
        generation = UUID(); snapshot = nil; choiceID = nil; suggestions = []; outcomes = [:]
        generating = false; submitting = false; message = nil; historyCount = 0; usedModel = false
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
        let preferences = preferences
        let previousIDs = Set(suggestions.map(\.id))
        cancel()
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
        let current = model.recommendationSnapshot
        snapshot = current; historyCount = current.history.count
        let context: [BeerChoiceContext]
        do { context = try model.recommendationAccount.map { try model.db?.choiceContexts(account:$0) ?? [] } ?? [] }
        catch { model.error = error.localizedDescription; context = [] }
        var candidates = RecommendationRules.shortlist(taplist:RecommendationRules.excludingRecent(current.taplist,history:current.repeatHistory),history:current.history,excluded:current.excluded,feedback:current.feedback,preferences:preferences,context:context,presentationExcluded:previousIDs)
        if candidates.count < min(3,current.taplist.count) {
            let fallback = RecommendationRules.shortlist(taplist:RecommendationRules.excludingRecent(current.taplist,history:current.repeatHistory),history:current.history,excluded:current.excluded,feedback:current.feedback,preferences:preferences,context:context)
            if candidates.isEmpty { candidates = fallback }
            else {
                // Keep the unseen choices when the preference band cannot supply
                // three new beers; fill remaining cards from previous choices.
                let unseenIDs = Set(candidates.map(\.id))
                candidates += fallback.filter { !unseenIDs.contains($0.id) }.prefix(3-candidates.count)
            }
        }
        guard !candidates.isEmpty else { message = "No eligible beers match these preferences. Try adjusting your style request, container, or ABV preference."; return }
        let provider = provider
        // Preview is deterministic and never invokes a model or a network write.
        let shortlist = candidates
        let timeout = timeout
        let task = Task { @MainActor () -> [String]? in
            guard !model.previewMode else { return nil }
            return await RecommendationDeadline.run(seconds:timeout) {
                try await provider.rank(history:current.history,candidates:shortlist,feedback:current.feedback,preferences:preferences,context:context)
            }
        }
        rankingTask = task
        let ids = await task.value
        if token == generation { rankingTask = nil }
        guard token == generation, !Task.isCancelled, current == model.recommendationSnapshot else {
            if token == generation { cancel(); message = "Your taplist or queue changed. Find fresh suggestions." }
            return
        }
        if let ids, let ranked = RecommendationRules.choose(ids:ids,from:candidates) {
            suggestions = ranked; usedModel = true
        } else {
            suggestions = Array(candidates.prefix(3)); usedModel = false
            if preferences.styleRequest.needsModel {
                message = "Local matching applied your filters, but couldn’t interpret the additional style or mood wording. Try a simple style such as IPA or stout."
            }
        }
        if let account = model.recommendationAccount {
            let choice = BeerChoiceContext(taplist:current.taplist,shown:suggestions.map(\.id),preferences:preferences,usedModel:usedModel,taplistValidation:current.taplistValidation)
            do { try model.db?.saveChoicePresentation(choice,account:account); choiceID = choice.id }
            catch { model.error = error.localizedDescription }
        }
    }
    func submit(ids: Set<String>) async {
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
