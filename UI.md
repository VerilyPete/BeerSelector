# UI.md

Refer to this file when working on UI components, styling, theming, or container/glass type logic.

## Container Type System

Beers display different icons based on their serving container. The `container_type` field is pre-computed during database sync for performance.

**Container Types:**

- `pint` - Pint glass for regular draft beers (<8% ABV)
- `tulip` - Tulip glass for high ABV draft beers (>=8% ABV)
- `can` - Can icon for canned beers
- `bottle` - Bottle icon for bottled beers
- `flight` - Flight icon for beer flights (4 tasting glasses)
- `null` - Unknown container (displays "?" icon)

**Container Type Rules (in priority order):**

1. **Flight detection**: Name contains "flight" (word boundary) OR style equals "flight" → `flight`
2. **Can detection**: Container contains "can" → `can`
3. **Bottle detection**: Container contains "bottle" → `bottle`
4. **Draft/Draught with size override**:
   - "13oz draft" or "13 oz draft" → `tulip` (skip ABV)
   - "16oz draft" or "16 oz draft" → `pint` (skip ABV)
5. **Draft/Draught ABV-based**:
   - ABV >= 8% → `tulip`
   - ABV < 8% → `pint`
6. **Style keyword fallback** (when no ABV found):
   - "pilsner" or "lager" → `pint`
   - "imperial", "tripel", "quad", or "barleywine" → `tulip`

**Key Files:**

- `src/utils/beerGlassType.ts` - Container type calculation logic (`getContainerType()`, `extractABV()`)
- `src/database/utils/glassTypeCalculator.ts` - Calculates container_type and ABV during sync
- `components/icons/ContainerIcon.tsx` - Renders appropriate icon based on type
- `components/icons/BeerIcon.tsx` - Custom IcoMoon font with beer glyphs

## Custom Beer Icon Font

The app uses an IcoMoon-generated custom font for beer container icons.

**Available glyphs:**

- `tulip` (0xf000)
- `pint` (0xf001)
- `can` (0xf002)
- `bottle` (0xf003)
- `flight` (0xf004)

**Font file:** `assets/fonts/BeerIcons.ttf`

**Usage:**

```typescript
import BeerIcon from '@/components/icons/BeerIcon';
<BeerIcon name="tulip" size={24} color="#000" />

// Or use the higher-level component:
import { ContainerIcon } from '@/components/icons/ContainerIcon';
<ContainerIcon type={beer.container_type} size={24} color={iconColor} />
```

## Theming

**Dark/Light Mode:**

- App supports dark/light mode via `useColorScheme()` hook
- Always use `ThemedText` and `ThemedView` for consistent styling
- Test all UI changes in both light and dark modes
- Avoid hardcoded colors - use theme colors

**Component Patterns:**

- Functional components with hooks
- Haptic feedback on interactions via `expo-haptics`

**Common Pitfalls:**

- White text on white background in light mode
- Black text on black background in dark mode
- Always verify contrast in both modes

## Key UI Components

- `components/AllBeers.tsx` - Beer list with search/filter
- `components/Beerfinder.tsx` - Advanced search for untasted beers
- `components/TastedBrewList.tsx` - Tasted beers with empty state handling
- `components/Rewards.tsx` - Rewards display
- `components/UntappdWebView.tsx` - Untappd integration (alpha)

**UntappdWebView Safari Cookie Sharing (CRITICAL):**

The `UntappdWebView.tsx` MUST use `WebBrowser.openAuthSessionAsync()` (NOT `openBrowserAsync()`):

- `openAuthSessionAsync` uses `ASWebAuthenticationSession` which shares cookies with Safari
- `openBrowserAsync` uses `SFSafariViewController` which does NOT share cookies
- Users expect automatic Untappd login if logged in via Safari

```typescript
// CORRECT - Shares Safari cookies
WebBrowser.openAuthSessionAsync(searchUrl, undefined, { ... });

// WRONG - Does NOT share Safari cookies
WebBrowser.openBrowserAsync(searchUrl, { ... });
```
