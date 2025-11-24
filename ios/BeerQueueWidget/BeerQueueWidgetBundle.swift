//
//  BeerQueueWidgetBundle.swift
//  BeerQueueWidget
//
//  Created by Test User on 11/21/25.
//

import WidgetKit
import SwiftUI

@main
struct BeerQueueWidgetBundle: WidgetBundle {
    var body: some Widget {
        BeerQueueWidget()
        if #available(iOS 18.0, *) {
            BeerQueueWidgetControl()
        }
        BeerQueueWidgetLiveActivity()
    }
}
