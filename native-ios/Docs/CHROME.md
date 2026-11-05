# Robocop chrome implementation

The SwiftUI code is the UI of record. When the code and a design file disagree, the code wins.

## Design file

`/Users/pete/claude/BeerSelectorNative.pen` is a design backup rebuilt from the code at `b3b22e0c` (2026-11-05). Its images live in `/Users/pete/claude/BeerSelectorNative-assets/`; keep the folder next to the `.pen` file. A Read Me note on the canvas lists the rows and screens.

It covers every iPhone screen and sheet, the iPad layouts, visitor, first-run, empty, error, and banner states, system dialogs, and the Live Activity. It leaves out Dynamic Type accessibility layouts, the Untappd browser, and share sheets.

Known substitutions in the backup:

- The Home metric digits are drawn as path segments (`Component/SegDigit`) because pen.dev cannot load DSEG7.
- SF Symbols and BeerIcons glyphs are drawn as Lucide icons: pint is `beer`, tulip is `wine`, bottle is `milk`, can is `cylinder`.
- System text uses Inter instead of SF Pro.
- The brushed-metal grain is left out, and scanlines are drawn as gradient stripes.

Update the backup when the UI changes. Component IDs in the backup:

- `y8K7f6` — Component/StatusBar
- `yY6f6` — Component/TabBar
- `G7DL4u` — Component/DisplayTitle
- `SkgRR` — Component/LabelPlate
- `e1QXU` — Component/IconWell
- `nT1yC` — Component/EtchedIconWell
- `Cs45E` — Component/FilterButton
- `Lyaa4` — Component/ActionButton
- `eZTeS` — Component/SearchBar
- `sSZWL` — Component/BeerCard
- `iWXXp` — Component/NavCard
- `Tg7oG` — Component/SegDigit
- `Fq127` — Component/MetricPanel

## Original chrome design

The chrome was first built from `/Users/pete/claude/RobocopChrome.pen` (last saved 2026-03-02). The app has since moved on from it, so use that file only as history. These are SwiftUI gradients and geometry, so the metal remains sharp on iPhone and iPad.

| Pen component | Native treatment |
|---|---|
| BeerRow, SearchBar, NavCard | Five-stop polished rim: #E8ECF0 at 0, #A0A7B0 at .15, #6B727B at .5, #8A919A at .85, #D4D8DD at 1. Three-point rim, one-point inside white edge, dark inner border. |
| SteelPanel | #D4D8DD → #8A919A at .3 → #6B727B, 16/13 outer/inner radii, 3-point rim, bright edge. Home and Rewards add four 7-point radial steel rivets. |
| StatusBar | Seven-stop brushed silver band behind the real system clock and indicators. No fake status indicators. |
| TabBar | Reverse brushed band, five-stop polished pill, 4-point rim, recessed dark inner pill, cyan selected border. |
| Beer and Home icon wells | #B8BFC7 → #8A919A → #6B727B steel, cyan/amber edge, dark etched glyph with white highlight offset. |
| FilterButton | Three-stop chrome rim, 2-point inset, 10/8 radii, inside highlight and inner dark border. |
| ActionButton | Original: #FFD54F → #FFB300 at .3 → #E6A200, 2-point rim, amber well/edges, layered glow, Space Mono label. Since 2026-09-12, `BeerControlStyle(.amber)` uses a softer #B99742 → #927020 at .3 → #725719 rim with #D4AB50 text; only `RoboButtonStyle` keeps the bright gradient. |
| Labels and titles | Dark steel gradient nameplates with inside edge/shadow; cyan title displays with scanlines. |

Implementation lives in `UI/RobocopTheme.swift`, shared by RootView, beer screens, Settings, and Rewards. Current filter actions and API behavior are preserved. Layout may wrap at larger type sizes.

Component IDs from the original document:

- `99amA` — Component/SteelPanel
- `OdJDZ` — Component/BeerRow
- `2BKCF` — Component/SearchBar
- `hSUuc` — Component/TabBar
- `9BUSG` — Component/StatusBar
- `mNq8R` — Component/NavCard
- `0eQJ5` — Component/FilterButton
- `rHc1V` — Component/ActionButton

Validation uses isolated offline fixture screenshots on simulator `6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3`; the user's signed-in simulator is updated in place only after review. A Pen MCP connection was attempted again but timed out, so source properties are read from the saved design JSON; do not describe this as a rendered pixel comparison against Pen.

Status-bar styling follows [Apple's status-bar customization guidance](https://developer.apple.com/documentation/technotes/tn3105-customizing-uistatusbar-syle): dark system content on the light metal band.

## Home metric user correction — 2026-09-10

The user explicitly requires ghost seven-segment markings. Use DSEG7Classic-Bold for lit digits and underlying ghost 8s, aligned per digit, with ghost cyan opacity 0.12. Retain the larger full-width BEERS TASTED label and tighter counter layout. This overrides the earlier Space Grotesk metric-font choice and subsequent ghost removal.
