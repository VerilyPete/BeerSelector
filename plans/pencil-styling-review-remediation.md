# Pencil Styling Branch — Review Remediation Plan

**Branch:** `pencilStylingNext`
**Base:** `06379b2` (main)
**Date:** 2026-03-01

This plan addresses all findings from the comprehensive code review of the `pencilStylingNext` branch.

---

## Phase 1: Colors.ts Foundation (C-2, W-2, W-3, I-3)

All color token changes in a single pass. No other files depend on these until Phase 2+.

### 1a. Add missing light-mode tokens (C-2 — Critical)

`steelLabelPlate` and `steelLabelBorder` only exist in `Colors.dark`. In light mode, consumers get `undefined`.

**File:** `constants/Colors.ts`
**Change:** Add to `Colors.light`:
```typescript
steelLabelPlate: '#8A919A',
steelLabelBorder: 'rgba(90, 96, 105, 0.25)',
```

**Consumers:** `index.tsx` (3 usages), `Rewards.tsx`, `SettingsSection.tsx`

### 1b. Export chrome gradient constant (W-2 — partial)

**File:** `constants/Colors.ts`
**Change:** Add export:
```typescript
export const CHROME_GRADIENT = ['#8A919A', '#B8BFC7', '#8A919A'] as const;
```

### 1c. Add `progressTrack` token (W-3)

**File:** `constants/Colors.ts`
**Change:** Add to both themes:
```typescript
// Colors.dark
progressTrack: '#1A2A2A',
// Colors.light
progressTrack: '#C0C7CE',
```

### 1d. Verify `chromeBarBorder` token values (I-3 — prep)

Confirm dark = `rgba(255, 255, 255, 0.15)`, light = `rgba(255, 255, 255, 0.2)`. These tokens will be consumed in Phase 3 (ChromeStatusBar).

---

## Phase 2: TDD Tests for New Components (BEFORE extraction)

Per TDD: write failing tests first, then create the components.

### 2a. ChromeShell tests

**File:** `components/ui/__tests__/ChromeShell.test.tsx`

**Behaviors to test:**
1. Renders children
2. Applies custom `borderRadius` and `padding`
3. Accepts custom `colors` prop
4. Default props produce valid output (no crash when `colors` omitted)
5. `style` prop is applied to the outer shell

**Mock strategy:**
```typescript
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID}>{children}</View>;
  },
}));
```

### 2b. ChromeStatusBar tests

**File:** `components/ui/__tests__/ChromeStatusBar.test.tsx`

**Behaviors to test:**
1. Renders with safe area inset height (`insets.top + 6`)
2. Uses `chromeBar` background color token
3. Uses `chromeBarBorder` border color token

**Mock strategy:** Requires `useColorScheme` inline mock and relies on `jest.setup.js` mock for `useSafeAreaInsets` (`{ top: 0 }` → expects height of 6).

---

## Phase 3: Architecture Extractions (W-2, I-3, I-4)

Now that failing tests exist from Phase 2, create the components to make them green.

### 3a. Create `ChromeShell` component

**File:** `components/ui/ChromeShell.tsx`

**API:**
```typescript
type ChromeShellProps = {
  children: React.ReactNode;
  borderRadius?: number;   // default 14
  padding?: number;        // default 3
  style?: ViewStyle;
  colors?: readonly [string, string, string];  // default CHROME_GRADIENT
};
```

Renders: `View` (shell, overflow hidden) + `LinearGradient` (absoluteFill) + `{children}`.

**Consumers (updated in Phase 5):**
- `SearchBar.tsx` — replaces `chromeShell` style + inline `LinearGradient`
- `FilterBar.tsx` — replaces `chromeShell` style + inline `LinearGradient` (all 3 chips)
- `Beerfinder.tsx` — replaces `modalChromeShell` style + inline `LinearGradient`

### 3b. Create `ChromeStatusBar` component

**File:** `components/ui/ChromeStatusBar.tsx`

**API:** Zero props. Encapsulates `useSafeAreaInsets()`, `useColorScheme()`, and the chrome bar styles.

```typescript
export const ChromeStatusBar: React.FC = () => {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];
  return (
    <View style={{
      height: insets.top + 6,
      backgroundColor: colors.chromeBar,
      borderBottomWidth: 1,
      borderBottomColor: colors.chromeBarBorder,
    }} />
  );
};
```

**Consumers (updated in Phase 5):** Replace identical markup in all 4 tab screens.

**Note:** All 4 screens can drop `useSafeAreaInsets` import entirely after extraction.

---

## Phase 4: Critical Code Fixes (C-1, C-3, C-4, W-1)

### 4a. Fix dead ternary (C-1)

**File:** `app/(tabs)/_layout.tsx`, line 50
**Change:** `const activeColor = isFocused ? colors.tint : colors.tint;` → `const activeColor = colors.tint;`

### 4b. Remove debug console.log (W-1)

**File:** `app/(tabs)/_layout.tsx`, lines 140-142
**Change:** Remove entire `useEffect` block. Also remove `useEffect` from the import (line 2) — no other usage in this file. (Do NOT confuse with `app/_layout.tsx` root layout which has multiple `useEffect` calls.)

### 4c. Remove dead hook call (C-3)

**File:** `components/AllBeers.tsx`
**Change:** Remove `import { useUntappdColor } from '@/hooks/useUntappdColor';` and `const untappdColor = useUntappdColor();`

### 4d. Fix hardcoded StatusBar style (C-4)

**File:** `app/_layout.tsx`, line 386
**Change:** `<StatusBar style="dark" />` → `<StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />`
(`colorScheme` already in scope at line 83; null/undefined correctly falls through to `'dark'` style)

---

## Phase 5: Warning Fixes (W-2 consumers, W-3, W-4, W-5, W-6, W-7, W-8)

### 5a. Update chrome gradient consumers to use `ChromeShell` (W-2)

Replace hardcoded `['#8A919A', '#B8BFC7', '#8A919A']` + shell patterns in:
- `SearchBar.tsx` — use `<ChromeShell>`, pass `colors` prop for focused state (e.g. `colors={[colors.tint, colors.tint, colors.tint]}`)
- `FilterBar.tsx` — use `<ChromeShell borderRadius={8} padding={1.5}>` for all 3 chips:
  - Sort chip and direction chip always use `<ChromeShell>` (unconditional gradient)
  - Container filter chip: use `<ChromeShell>` when inactive, plain `<View style={{ backgroundColor: colors.tint }}>` when active (no gradient in active state — matches current behavior)
- `Beerfinder.tsx` — use `<ChromeShell borderRadius={16} style={{ width: '90%', maxHeight: '80%' }}>`

### 5b. Replace chrome bar markup with `ChromeStatusBar` (I-3, I-4)

Replace identical chrome bar `View` in all 4 tab screens with `<ChromeStatusBar />`. Drop `useSafeAreaInsets` import from all 4 files.

### 5c. Use `progressTrack` token (W-3)

**File:** `app/(tabs)/index.tsx`, line 91
**Change:** `{ backgroundColor: '#1A2A2A' }` → `{ backgroundColor: colors.progressTrack }`

### 5d. Remove dead `isTasted` prop (W-4)

**File:** `components/beer/BeerItem.tsx`
**Change:** Remove `isTasted?: boolean;` from `BeerItemProps` type and `isTasted = false,` from destructuring. No call sites pass this prop.

### 5e. Delete orphaned TabBarBackground files (W-5)

**Delete:**
- `components/ui/TabBarBackground.tsx`
- `components/ui/TabBarBackground.ios.tsx`

Confirmed zero consumers in production code.

### 5f. Fix `as any` on Ionicons name (W-6)

**File:** `app/(tabs)/index.tsx`
**Change:** In `NavigationCard` props, change `iconName: string` to `iconName: React.ComponentProps<typeof Ionicons>['name']`. Remove `as any` from the JSX usage.

### 5g. Fix indentation in queue modal (W-7)

**File:** `components/Beerfinder.tsx`
**Change:** Properly indent `modalContent` View and its children inside `modalChromeShell`.

### 5h. Add missing color props to modal text (W-8)

**File:** `components/Beerfinder.tsx`
**Changes:**
- `modalTitle`: add `{ color: colors.text }`
- `noQueuesText`: add `{ color: colors.textSecondary }`
- `queuedBeerDate`: add `{ color: colors.textSecondary }`
- `errorText` (line 355): add `{ color: colors.text }` — also lacks a color prop

---

## Phase 6: Additional Test Coverage

### 6a. ActionButton tests

**File:** `components/ui/__tests__/ActionButton.test.tsx`

**Behaviors to test:**
1. Renders label text when not loading
2. Renders ActivityIndicator when `loading={true}`
3. Does not render label when loading
4. TouchableOpacity disabled when `disabled={true}`
5. TouchableOpacity disabled when `loading={true}`
6. Calls `onPress` when pressed in normal state
7. Custom `style` prop is applied to outer TouchableOpacity
8. Dark mode uses dark-mode gradient colors
9. Light mode uses light-mode gradient colors

**Mock strategy:**
```typescript
jest.mock('@/hooks/useColorScheme', () => ({ useColorScheme: jest.fn(() => 'dark') }));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID}>{children}</View>;
  },
}));
```

**Factory pattern:** `createDefaultProps()` returning `{ label, onPress: jest.fn(), loading: false, disabled: false }`. Use `React.ComponentProps<typeof ActionButton>` for the props type — `ActionButtonProps` is not exported from the component.

### 6b. MetricCard tests (TDD extraction)

**Extract to:** `components/ui/MetricCard.tsx`
**Test file:** `components/ui/__tests__/MetricCard.test.tsx`

**TDD sequence:** Write failing test importing from new location → extract component → green.

**Behaviors to test:**
1. Displays `tastedCount` number
2. Displays "/200" denominator
3. Shows "0.0% UFO CLUB PROGRESS" at 0 beers
4. Shows "50.0% UFO CLUB PROGRESS" at 100 beers
5. Shows "100.0% UFO CLUB PROGRESS" at 200 beers
6. Progress capped at 100% for counts > 200
7. Progress fill width is "0%" at 0 beers
8. Progress fill width is "50%" at 100 beers
9. Progress fill width capped at "100%" for counts > 200
10. Ghost segment always displays "888"

**Mock strategy:** None needed — pass `Colors.dark` directly from the real import.

### 6c. Tab bar visitor filtering tests (TDD extraction)

**Extract to:** Pure function `filterVisibleRoutes()` exported from `app/(tabs)/_layout.tsx`
**Test file:** `app/(tabs)/__tests__/tabBarFiltering.test.ts`

**TDD sequence:** Write failing test → extract filter function → green.

**Function signature:** Must accept `tabConfigs` as a parameter (not close over the module-level constant) to be a proper pure function:
```typescript
export function filterVisibleRoutes(
  routes: readonly { name: string; key: string }[],
  descriptors: Record<string, { options: { href?: string | null } }>,
  isVisitor: boolean,
  tabConfigs: Record<string, { memberOnly?: boolean }>
): readonly { name: string; key: string }[]
```

**Behaviors to test:**
1. Member sees all 4 tabs (HOME, BEERS, FINDER, TASTED)
2. Visitor sees only non-`memberOnly` tabs (HOME, BEERS)
3. Non-memberOnly routes are always visible regardless of visitor status
4. Routes with `href === null` are hidden
5. Routes not in `tabConfigs` are hidden

**Mock strategy:** None — pure function test.

### 6d. Fix weakened FilterBar test

**File:** `components/beer/__tests__/FilterBar.test.tsx`

Replace "active and inactive states render different label text" (which duplicates existing tests) with gradient presence/absence tests:
- Add `testID="filter-container-gradient"` to the `LinearGradient` in FilterBar
- Add `expo-linear-gradient` mock to test file (passes `testID` through via a `View` wrapper)
- Test: inactive state renders the gradient; active state does not

Also fix brittle assertions:
- Remove `backgroundColor: '#F5F5F0'` negative assertion — `#F5F5F0` is not in the design system, making this a trivially-passing false positive
- Replace hardcoded `'#0a7ea4'` with `Colors.light.tint` reference

---

## Execution Order Summary

| Phase | Scope | Files | Dependencies |
|-------|-------|-------|-------------|
| 1 | Colors.ts tokens | 1 file | None |
| 2 | TDD tests for new components | 2 new test files | None (tests fail initially) |
| 3 | Architecture extractions | 2 new components | Phase 1 (CHROME_GRADIENT), Phase 2 (failing tests) |
| 4 | Critical fixes | 3 files | None |
| 5 | Warning fixes + consumer migration | ~8 files | Phase 1 (tokens), Phase 3 (ChromeShell, ChromeStatusBar) |
| 6 | Additional test coverage | 4 new test files + 1 modified | Phase 3 (MetricCard extraction) |

**TDD compliance:** Phase 2 tests are written BEFORE Phase 3 extractions. Phase 6b MetricCard follows TDD sequence (failing test → extraction → green).

**Estimated commits:** 6 (one per phase), or group Phases 4+5 into one commit.

**Test suite expectation:** All existing tests green after every phase except Phase 5 (new tests fail until Phase 6). New tests add ~40-50 test cases.
