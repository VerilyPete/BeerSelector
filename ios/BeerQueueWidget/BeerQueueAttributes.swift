//
//  BeerQueueAttributes.swift
//  BeerQueueWidget
//
//  Live Activity attributes and data models for the beer queue feature.
//  This file defines the data structures used by the Live Activity.
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
