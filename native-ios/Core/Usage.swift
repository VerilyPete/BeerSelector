import Foundation

/// Feature-use counters reported to the worker's POST /usage. Raw values are wire names and
/// must match ufobeer's USAGE_EVENTS; add a case there and deploy it before adding it here.
enum UsageEvent: String, CaseIterable, Sendable {
    case sessionStarted = "session_started"
    case viewHome = "view_home"
    case viewAllBeers = "view_all_beers"
    case viewBeerfinder = "view_beerfinder"
    case viewTasted = "view_tasted"
    case viewRewards = "view_rewards"
    case viewQueue = "view_queue"
    case viewPendingOperations = "view_pending_operations"
    case viewMissedCredit = "view_missed_credit"
    case checkinQueued = "checkin_queued"
    case checkinFromSuggestion = "checkin_from_suggestion"
    case queueEntryDeleted = "queue_entry_deleted"
    case operationRetried = "operation_retried"
    case rewardQueued = "reward_queued"
    case rewardsRefreshedManual = "rewards_refreshed_manual"
    case beerRated = "beer_rated"
    case missedCreditResolved = "missed_credit_resolved"
    case untappdOpened = "untappd_opened"
    case suggestionsOpened = "suggestions_opened"
    case appleIntelligenceUsed = "apple_intelligence_used"
    case localMatchingUsed = "local_matching_used"
    case fallbackDeadlineExpired = "fallback_deadline_expired"
    case fallbackProviderFailure = "fallback_provider_failure"
    case fallbackInvalidOutput = "fallback_invalid_output"
    case fallbackContextBudget = "fallback_context_budget"
}

enum UsageAIStatus: String, Sendable {
    case appleIntelligence = "apple_intelligence"
    case requiresNewerOS = "requires_newer_os"
    case deviceNotEligible = "device_not_eligible"
    case notEnabled = "not_enabled"
    case modelNotReady = "model_not_ready"
    case unsupportedLocale = "unsupported_locale"
    case unavailable

    init(_ compatibility: RecommendationCompatibility) {
        switch compatibility {
        case .appleIntelligence: self = .appleIntelligence
        case .requiresNewerOS: self = .requiresNewerOS
        case .deviceNotEligible: self = .deviceNotEligible
        case .notEnabled: self = .notEnabled
        case .modelNotReady: self = .modelNotReady
        case .unsupportedLocale: self = .unsupportedLocale
        case .unavailable: self = .unavailable
        }
    }
}

struct UsageEventCount: Equatable, Sendable {
    let event: UsageEvent
    let count: Int
}

struct UsageBatch: Equatable, Sendable {
    let installID: UUID
    let batchID: UUID
    let appVersion: String
    let aiStatus: UsageAIStatus
    let osMajor: Int
    let events: [UsageEventCount]

    private struct Wire: Encodable {
        struct Item: Encodable { let name: String; let count: Int }
        let install_id: String
        let batch_id: String
        let app_version: String
        let ai_status: String
        let os_major: Int
        let events: [Item]
    }

    func encoded() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(Wire(
            install_id:installID.uuidString.lowercased(),
            batch_id:batchID.uuidString.lowercased(),
            app_version:appVersion,
            ai_status:aiStatus.rawValue,
            os_major:osMajor,
            events:events.map { Wire.Item(name:$0.event.rawValue,count:$0.count) }
        ))
    }
}
