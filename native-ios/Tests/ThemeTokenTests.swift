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

    func testContrastRatioMatchesWCAGReferencePoints() {
        XCTAssertEqual(Robo.contrastRatio(0x000000,0xFFFFFF),21,accuracy:0.01)
        XCTAssertEqual(Robo.contrastRatio(0xFFFFFF,0x000000),21,accuracy:0.01)
        XCTAssertEqual(Robo.contrastRatio(0x777777,0xFFFFFF),4.48,accuracy:0.01)
    }

    func testLabelPlateTextIsReadableAcrossTheWholeSteelGradient() {
        for (stop,_) in Robo.labelSteelStops {
            XCTAssertGreaterThanOrEqual(Robo.contrastRatio(Robo.labelPlateInk,stop),4.5,String(format:"stop %06X",stop))
        }
    }

    func testCyanLabelPlateTextIsReadable() {
        XCTAssertGreaterThanOrEqual(Robo.contrastRatio(Robo.labelPlateInk,0x00FFD0),4.5)
    }
}
