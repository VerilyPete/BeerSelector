import SwiftUI
import UIKit
import XCTest
@testable import BeerSelectorNative

/// Beer screens and the muted Queue, Rewards and Settings palette share one
/// source for text colors, and the body font must actually load: SwiftUI
/// silently falls back to the system font for an unknown name.
final class ThemeTokenTests: XCTestCase {
    func testTextTokensAliasTheQueuePalette() {
        XCTAssertEqual(Robo.textPrimary,QueueChrome.text)
        XCTAssertEqual(Robo.textSecondary,QueueChrome.secondary)
    }

    func testHairlineIsTenPercentWhite() {
        XCTAssertEqual(Robo.hairline,Color.white.opacity(0.1))
    }

    func testBodyFontIsBundledGroteskRegular() {
        XCTAssertEqual(Robo.bodyFontName,"SpaceGrotesk-Regular")
        XCTAssertNotNil(UIFont(name:Robo.bodyFontName,size:13),"the font is registered in Info.plist")
    }
}
