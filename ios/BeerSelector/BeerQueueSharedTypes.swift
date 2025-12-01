//
//  BeerQueueSharedTypes.swift
//  BeerSelector
//
//  Shared types for Live Activity - used by both the main app and widget extension.
//  These types MUST match the definitions in BeerQueueWidget/BeerQueueAttributes.swift
//

import ActivityKit
import Foundation

/// Attributes for the Beer Queue Live Activity
/// - Static attributes are set when the activity starts and don't change
/// - ContentState contains dynamic data that can be updated
struct BeerQueueAttributes: ActivityAttributes {
    /// Dynamic content state that can be updated during the activity lifecycle
    public struct ContentState: Codable, Hashable {
        /// Array of beers currently in the queue
        var beers: [QueuedBeer]
    }

    /// Member ID from Flying Saucer (static, set at activity start)
    var memberId: String

    /// Store ID (static, set at activity start)
    var storeId: String
}

/// Model representing a beer in the queue
struct QueuedBeer: Codable, Hashable, Identifiable {
    /// Unique identifier for the queued beer
    let id: String

    /// Beer name (already stripped of container type by React Native)
    let name: String
}
