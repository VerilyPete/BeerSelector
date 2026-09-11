# Robocop chrome implementation

Visual source: `/Users/pete/claude/RobocopChrome.pen`. The user's chrome design takes precedence over approximations in the prior native implementation. These are SwiftUI gradients and geometry, so the metal remains sharp on iPhone and iPad.

| Pen component | Native treatment |
|---|---|
| BeerRow, SearchBar, NavCard | Five-stop polished rim: #E8ECF0 at 0, #A0A7B0 at .15, #6B727B at .5, #8A919A at .85, #D4D8DD at 1. Three-point rim, one-point inside white edge, dark inner border. |
| SteelPanel | #D4D8DD → #8A919A at .3 → #6B727B, 16/13 outer/inner radii, 3-point rim, bright edge. Home and Rewards add four 7-point radial steel rivets. |
| StatusBar | Seven-stop brushed silver band behind the real system clock and indicators. No fake status indicators. |
| TabBar | Reverse brushed band, five-stop polished pill, 4-point rim, recessed dark inner pill, cyan selected border. |
| Beer and Home icon wells | #B8BFC7 → #8A919A → #6B727B steel, cyan/amber edge, dark etched glyph with white highlight offset. |
| FilterButton | Three-stop chrome rim, 2-point inset, 10/8 radii, inside highlight and inner dark border. |
| ActionButton | #FFD54F → #FFB300 at .3 → #E6A200, 2-point rim, amber well/edges, layered glow, Space Mono label. |
| Labels and titles | Dark steel gradient nameplates with inside edge/shadow; cyan title displays with scanlines. |

Implementation lives in `UI/RobocopTheme.swift`, shared by RootView, beer screens, Settings, and Rewards. Current filter actions and API behavior are preserved. Layout may wrap at larger type sizes.

Component IDs from the source document:

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
