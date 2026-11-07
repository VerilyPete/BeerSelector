# Robocop chrome implementation

The SwiftUI code is the UI of record. When the code and a design file disagree, the code wins.

## Design file

`/Users/pete/claude/BeerSelectorNative.pen` is a design backup rebuilt from the code at `b3b22e0c` (2026-11-05) and updated for the UI polish on 2026-11-06. Its images live in `/Users/pete/claude/BeerSelectorNative-assets/`; keep the folder next to the `.pen` file. A Read Me note on the canvas lists the rows and screens.

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
- `iWXXp` — Component/NavCard (no longer used on any screen)
- `Tg7oG` — Component/SegDigit
- `Fq127` — Component/MetricPanel

## UI polish — 2026-11-06

The polish followed `plans/ui-polish.md` and the approved mocks in `/Users/pete/claude/BeerSelectorPolish-assets/`. Its editable source, `BeerSelectorPolish.pen`, is archived in `/Users/pete/claude/archive/`. Fixture screenshots of the shipped result are the `Docs/Screenshots/polish-*.png` files: iPhone Home (Apple Intelligence, local matching, visitor), All Beers, Beerfinder, Tasted, Rewards and the local matching sheet, plus iPad Home in landscape and at AX5 and Beerfinder in portrait.

### The six rules

1. **Chrome is for hero and control elements only.** Bevels stay on the Home metric panel, the Rewards journey panel, the tab bar, the status band, the search bar, buttons, filter controls, icon wells and label plates. Content cards are flat.
2. **One content-card style.** Beer rows, reward rows, queue rows, operations, Settings groups, recommendation cards and Home panels all use `.contentCard()`. The Rewards milestone bevel is always steel; the full teal fill is the only "reached" signal.
3. **Teal means interactive or active.** Beer names, reward titles and ABV values are off-white. Teal stays on title plates, the selected segment, the sort control, action buttons, the active tab, links and status words such as AVAILABLE. Amber marks Queue, Rewards and Check In.
4. **Mono for data, Grotesk for prose.** Space Mono for ABV, dates, counts, style · container lines and label plates. Space Grotesk Regular for descriptions, brewer names, row subtitles and explanations.
5. **The filter row only filters.** ALL / DRAFT / CANS & BOTTLES segments plus one sort menu (Date, Name, ABV, each with a direction). Beerfinder's Queue and Rewards are amber icon buttons in the header.
6. **iPhone Home doesn't repeat the tab bar.** The compact Home shows the header, the suggestion card, the metric panel, New on Tap and the Rewards card. The wide iPad Home keeps its panel layout.

### Tokens

| Token | Value | Use |
|---|---|---|
| `Robo.textPrimary` | `QueueChrome.text` | Names, titles and values on content cards |
| `Robo.textSecondary` | `QueueChrome.secondary` | Subtitles, details and explanations |
| `Robo.hairline` | white at 10% | The 1pt edge of a content card and row dividers |
| `Robo.body(_:)` | Space Grotesk Regular | Prose |
| `.contentCard()` | `Robo.display`, 14pt radius, hairline edge | Every content card |
| `AmberWell` / `AmberIcon` | amber chrome well, `#D4AB50` glyph | Queue and Rewards buttons, the Home Rewards card |

### Decisions

- The BeerIcons glyphs stay. Restyling may change the wells and rings around them, never the glyphs.
- Every suggestion surface names its source. The Home card is titled Ask Apple Intelligence or Local matching; the sheet shows a mode plate. A fallback from Apple Intelligence shows a notice above the results.
- New on Tap shows the newest beers on the taplist by added date, tasted or not, as compact rows (name, then arrival day · style · container, then ABV). Tapping a row shows its description.
- The compact Home prefers to fit its screen without scrolling: roomy spacing, then tight spacing, then one New on Tap row. With the suggestion card showing, the iPhone test sizes from 16e to 18 Pro Max show two rows at the default text size; `UITests/home-fits.yaml` checks this. It scrolls while a shown description is open (keeping the rows it had), at accessibility text sizes (always with two rows), and as a last resort when even one row doesn't fit, such as a short landscape window or long banners. `CompactHomeMode` decides this and ignores an expansion for a beer Home isn't showing.
- On narrow iPhones the sort chip shortens to the direction (NEW, A-Z, HIGH) and then to its icon, so the filter row stays on one line through XXXL.

### Accepted differences from the mocks

These were reviewed against the approved PNGs in Phase E and kept:

- The segments are separate chrome buttons rather than one joined control. The user approved this on device.
- The sort chip reads NEW, not DATE · NEW, on 402pt-wide iPhones, because the full label doesn't fit beside CANS & BOTTLES.
- The Queue icon is `list.bullet.rectangle` (SF Symbols), and the beer wells keep the BeerIcons glyphs where the mocks use Lucide stand-ins.
- Home drops the mock's WELCOME BACK plate and the suggestion card's APPLE INTELLIGENCE eyebrow, so two New on Tap rows fit under the real tab bar. The Settings gear sits beside the member name.
- The suggestions sheet keeps the system navigation bar with Done and the native segmented ABV picker, and lays the style chips out in an adaptive grid (104pt minimum columns, 220pt at accessibility sizes), where the mock draws a custom close button and flowing chips.
- The redeemed-reward chevron and the card chevrons are neutral grey.
- Label plates (NEW ON TAP and the rest) keep the steel plate from the mocks. Its dark text measures about 2.2–4.3:1 across the gradient, below 4.5:1; changing it is an open design decision, not part of this polish.

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
