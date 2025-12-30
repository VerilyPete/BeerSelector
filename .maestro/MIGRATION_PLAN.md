# Maestro E2E Test Migration Plan

This document tracks which Maestro tests need updates as part of the UI redesign initiative. Each phase of the redesign may affect test selectors, assertions, and flows.

---

## Table of Contents

1. [Test Inventory](#test-inventory)
2. [Current TestID Map](#current-testid-map)
3. [Phase-by-Phase Impact Analysis](#phase-by-phase-impact-analysis)
4. [TestID Migration Checklist](#testid-migration-checklist)
5. [Testing Strategy During Migration](#testing-strategy-during-migration)
6. [Rollback Procedures](#rollback-procedures)

---

## Test Inventory

### Core Functionality Tests (01-05)

| File                          | Purpose                                        | Priority | Est. Duration |
| ----------------------------- | ---------------------------------------------- | -------- | ------------- |
| `01-beer-list-rendering.yaml` | Beer list display, scrolling, pull-to-refresh  | P0       | ~2 min        |
| `02-search-and-filter.yaml`   | Search input, filter buttons, sort toggle      | P0       | ~4 min        |
| `03-beer-item-expansion.yaml` | Beer card expand/collapse, description display | P1       | ~3 min        |
| `04-empty-states.yaml`        | Empty search results, edge cases               | P1       | ~3 min        |
| `05-navigation-and-tabs.yaml` | Tab switching, state persistence               | P0       | ~3 min        |

### Authentication Tests (06-11)

| File                             | Purpose                             | Priority | Est. Duration |
| -------------------------------- | ----------------------------------- | -------- | ------------- |
| `06-login-flow-member.yaml`      | UFO Club member login, WebView flow | P0       | ~5 min        |
| `07-login-flow-visitor.yaml`     | Visitor mode login                  | P0       | ~6 min        |
| `08-auto-login.yaml`             | Auto-login on startup               | P1       | ~6 min        |
| `09-refresh-functionality.yaml`  | Pull-to-refresh, manual refresh     | P1       | ~5 min        |
| `10-settings-configuration.yaml` | Settings screen, data management    | P1       | ~7 min        |
| `11-settings-first-launch.yaml`  | First launch setup flow             | P1       | ~8 min        |

### Error Handling Tests (12-16)

| File                               | Purpose                  | Priority | Est. Duration |
| ---------------------------------- | ------------------------ | -------- | ------------- |
| `12-offline-scenarios.yaml`        | Offline mode testing     | P2       | ~8 min        |
| `13-network-timeout-recovery.yaml` | Network timeout handling | P2       | ~11 min       |
| `14-api-error-handling.yaml`       | API error scenarios      | P2       | ~13 min       |
| `15-config-validation.yaml`        | Configuration validation | P2       | ~6 min        |
| `16-offline-mode.yaml`             | Offline indicators       | P2       | ~3 min        |

### Advanced Flows

| File                                     | Purpose                  | Priority | Est. Duration |
| ---------------------------------------- | ------------------------ | -------- | ------------- |
| `LOGIN_WEBVIEW_ERROR_HANDLING.yaml`      | WebView error recovery   | P2       | ~12 min       |
| `SETTINGS_AUTO_LOGIN.yaml`               | Settings auto-login flow | P2       | ~16 min       |
| `MP-7-STEP-2-OPERATION-QUEUE-TESTS.yaml` | Operation queue testing  | P2       | ~4 min        |
| `live-activity-*.yaml`                   | Live Activity tests      | P2       | ~10 min       |
| `beer-list-*.yaml`                       | Legacy beer list tests   | P2       | ~5 min        |

---

## Current TestID Map

### AllBeers Component (`components/AllBeers.tsx`)

| TestID                | Element               | Used In Tests      |
| --------------------- | --------------------- | ------------------ |
| `all-beers-container` | Main container View   | 01, 05, 09, 10     |
| `error-container`     | Error state container | 14                 |
| `error-message`       | Error message text    | 14                 |
| `try-again-button`    | Retry button          | 14                 |
| `beer-count`          | Beer count display    | 01, 02, 04, 05, 09 |

### SearchBar Component (`components/SearchBar.tsx`)

| TestID                | Element               | Used In Tests  |
| --------------------- | --------------------- | -------------- |
| `search-bar`          | Search container      | 01, 09         |
| `search-input`        | Text input field      | 02, 03, 04, 05 |
| `clear-search-button` | Clear search X button | 02, 03, 04, 05 |

### FilterBar Component (`components/beer/FilterBar.tsx`)

| TestID                  | Element               | Used In Tests      |
| ----------------------- | --------------------- | ------------------ |
| `filter-bar`            | Filter container      | 01                 |
| `filter-draft-button`   | Draft filter toggle   | 02, 03, 04, 05, 09 |
| `filter-heavies-button` | Heavies filter toggle | 02, 04             |
| `filter-ipa-button`     | IPA filter toggle     | 02, 04             |
| `sort-toggle-button`    | Sort order toggle     | 02, 04, 05         |
| `sort-button-text`      | Sort button label     | 02                 |

### BeerList Component (`components/beer/BeerList.tsx`)

| TestID                    | Element               | Used In Tests          |
| ------------------------- | --------------------- | ---------------------- |
| `beer-list`               | FlatList container    | 01, 02, 03, 04, 05, 09 |
| `beer-list-empty`         | Empty state container | 04                     |
| `beer-list-empty-message` | Empty state message   | 04                     |

### BeerItem Component (`components/beer/BeerItem.tsx`)

| TestID                            | Element             | Used In Tests  |
| --------------------------------- | ------------------- | -------------- |
| `beer-item-{id}`                  | Beer card container | 01, 03, 04, 05 |
| `beer-name-{id}`                  | Beer name text      | -              |
| `beer-brewer-{id}`                | Brewery name text   | -              |
| `beer-style-{id}`                 | Style row container | -              |
| `beer-date-{id}`                  | Date added text     | -              |
| `beer-description-container-{id}` | Description wrapper | 03             |
| `beer-description-{id}`           | Description text    | 03             |

### LoginWebView Component (`components/LoginWebView.tsx`)

| TestID                 | Element         | Used In Tests |
| ---------------------- | --------------- | ------------- |
| `login-webview-modal`  | Modal container | 06, 10        |
| `close-webview-button` | Close X button  | 06, 10        |

### Settings Components

| TestID                    | Element             | Location                  | Used In Tests |
| ------------------------- | ------------------- | ------------------------- | ------------- |
| `about-section`           | About container     | AboutSection.tsx          | 10            |
| `app-name-text`           | App name display    | AboutSection.tsx          | -             |
| `version-text`            | Version display     | AboutSection.tsx          | -             |
| `data-management-section` | Data mgmt container | DataManagementSection.tsx | 10            |
| `refresh-all-data-button` | Refresh button      | DataManagementSection.tsx | 09, 10        |
| `login-button`            | Login button        | DataManagementSection.tsx | 10            |
| `developer-section`       | Dev tools container | DeveloperSection.tsx      | -             |
| `welcome-section`         | Welcome container   | WelcomeSection.tsx        | 06, 11        |

### Other Components

| TestID                   | Element               | Location           | Used In Tests |
| ------------------------ | --------------------- | ------------------ | ------------- |
| `tasted-brews-container` | TastedBrews container | TastedBrewList.tsx | 09            |
| `beerfinder-container`   | Beerfinder container  | Beerfinder.tsx     | 05            |
| `skeleton-loader`        | Loading skeleton      | SkeletonLoader.tsx | -             |
| `skeleton-item-{n}`      | Individual skeleton   | SkeletonLoader.tsx | -             |

---

## Phase-by-Phase Impact Analysis

### Phase 0: Prerequisites (No Test Changes)

**Impact**: None - these are foundational changes that don't affect test selectors.

- [ ] Extract `useHomeScreenState` hook - No UI changes
- [ ] Fix hardcoded colors - No UI changes
- [ ] Create this migration plan - Documentation only
- [ ] Create accessibility checklist - Documentation only

---

### Phase 1: Foundation (Low Impact)

**Affected Files**: `Colors.ts`, `ThemedView.tsx`, `ThemedText.tsx`, `theme.ts`

**Test Impact**: Minimal - semantic colors don't affect testIDs

| Test File | Impact Level | Changes Needed                |
| --------- | ------------ | ----------------------------- |
| All tests | LOW          | Verify visual regression only |

**Action Items**:

- [ ] Run full test suite after color changes
- [ ] Manual visual verification in light/dark modes
- [ ] No testID changes expected

---

### Phase 2: Core Components (Medium Impact)

**Affected Components**: `BeerItem.tsx`, `SearchBar.tsx`, `FilterBar.tsx`

**Test Impact**: Potential testID changes, new interactive elements

| Test File                     | Impact Level | Changes Needed                                        |
| ----------------------------- | ------------ | ----------------------------------------------------- |
| `01-beer-list-rendering.yaml` | MEDIUM       | Update scroll assertions if card height changes       |
| `02-search-and-filter.yaml`   | MEDIUM       | Update search bar interactions, filter chip selectors |
| `03-beer-item-expansion.yaml` | HIGH         | Expansion animation timing may change                 |
| `04-empty-states.yaml`        | LOW          | Empty state testIDs unchanged                         |
| `05-navigation-and-tabs.yaml` | MEDIUM       | State persistence with new components                 |

#### Planned TestID Changes - Phase 2

**SearchBar Redesign**:
| Current TestID | New TestID | Reason |
|----------------|------------|--------|
| `search-bar` | `search-bar` | No change |
| `search-input` | `search-input` | No change |
| `clear-search-button` | `search-clear-button` | Naming consistency |
| - | `search-voice-button` | New element (future) |

**FilterBar Redesign**:
| Current TestID | New TestID | Reason |
|----------------|------------|--------|
| `filter-bar` | `filter-bar` | No change |
| `filter-draft-button` | `filter-chip-draft` | Chip design |
| `filter-heavies-button` | `filter-chip-heavies` | Chip design |
| `filter-ipa-button` | `filter-chip-ipa` | Chip design |
| `sort-toggle-button` | `sort-button` | Simplified name |
| `sort-button-text` | `sort-button-label` | Naming consistency |
| - | `filter-count-badge` | New element |

**BeerItem Redesign**:
| Current TestID | New TestID | Reason |
|----------------|------------|--------|
| `beer-item-{id}` | `beer-card-{id}` | Card-based design |
| `beer-description-container-{id}` | `beer-card-expanded-{id}` | Clearer semantics |
| - | `beer-card-action-{id}` | New action button |
| - | `beer-card-glass-icon-{id}` | New glass icon |

**Action Items**:

- [ ] Create mapping script to update all test files
- [ ] Update `02-search-and-filter.yaml` with new filter chip selectors
- [ ] Update `03-beer-item-expansion.yaml` with new card selectors
- [ ] Add wait times for new animations (card expand, haptic feedback)
- [ ] Test on both iOS and Android simulators

---

### Phase 3: Screen Updates (High Impact)

**Affected Screens**: Home (`index.tsx`), Settings (`settings.tsx`), Rewards

**Test Impact**: Navigation changes, new UI elements, restructured screens

| Test File                        | Impact Level | Changes Needed             |
| -------------------------------- | ------------ | -------------------------- |
| `05-navigation-and-tabs.yaml`    | HIGH         | New home screen layout     |
| `06-login-flow-member.yaml`      | MEDIUM       | Settings restructure       |
| `07-login-flow-visitor.yaml`     | MEDIUM       | Home screen changes        |
| `09-refresh-functionality.yaml`  | MEDIUM       | New settings layout        |
| `10-settings-configuration.yaml` | HIGH         | Complete settings redesign |
| `11-settings-first-launch.yaml`  | HIGH         | New welcome flow           |

#### Planned TestID Changes - Phase 3

**Home Screen Redesign**:
| Current TestID | New TestID | Reason |
|----------------|------------|--------|
| - | `home-container` | New container |
| - | `home-stats-card` | New stats display |
| - | `home-nav-card-allbeer` | Navigation card |
| - | `home-nav-card-beerfinder` | Navigation card |
| - | `home-nav-card-tasted` | Navigation card |
| - | `home-nav-card-rewards` | Navigation card |
| - | `home-progress-indicator` | 200 beer progress |

**Settings Screen Redesign**:
| Current TestID | New TestID | Reason |
|----------------|------------|--------|
| `about-section` | `settings-section-about` | Grouped sections |
| `data-management-section` | `settings-section-data` | Grouped sections |
| `developer-section` | `settings-section-developer` | Grouped sections |
| - | `settings-profile-card` | New profile section |
| - | `settings-row-{name}` | Individual setting rows |

**Action Items**:

- [ ] Create new home screen test flow
- [ ] Update settings navigation tests
- [ ] Add tests for new navigation card interactions
- [ ] Update first launch flow for new welcome experience
- [ ] Test profile card display for logged-in users

---

### Phase 4: Tablet Support (Medium Impact)

**Affected**: Layout changes across all screens for tablet breakpoints

**Test Impact**: Tests should work but may need viewport-specific assertions

| Test File           | Impact Level | Changes Needed             |
| ------------------- | ------------ | -------------------------- |
| All beer list tests | MEDIUM       | Column layout assertions   |
| Navigation tests    | LOW          | Verify tab bar vs side nav |

**Action Items**:

- [ ] Add tablet-specific test flows (optional)
- [ ] Verify all existing tests pass on iPad simulator
- [ ] Add assertions for multi-column layouts
- [ ] Test side navigation (if implemented for lg+ breakpoints)

---

### Phase 5: Polish (Low Impact)

**Affected**: Animation timing, micro-interactions

**Test Impact**: May need timing adjustments for animations

| Test File | Impact Level | Changes Needed                            |
| --------- | ------------ | ----------------------------------------- |
| All tests | LOW          | Increase `waitForAnimationToEnd` timeouts |

**Action Items**:

- [ ] Review all animation wait times
- [ ] Test 60fps animations don't cause flakiness
- [ ] Verify haptic feedback doesn't interfere with tap detection

---

## TestID Migration Checklist

Use this checklist when updating tests for each phase:

### Before Component Changes

- [ ] Run full test suite, record baseline results
- [ ] Document any currently failing/flaky tests
- [ ] Create branch for test updates

### During Component Changes

- [ ] Update testIDs in component first
- [ ] Run affected tests, expect failures
- [ ] Update test files with new testIDs
- [ ] Verify tests pass with new selectors

### After Component Changes

- [ ] Run full test suite
- [ ] Verify no regression in unaffected tests
- [ ] Update this migration plan with actual changes
- [ ] Commit test updates with component changes

### TestID Naming Conventions

Follow these conventions for new testIDs:

1. **Container elements**: `{component}-container` or `{screen}-container`
2. **Interactive elements**: `{component}-{action}-button` or `{component}-{element}`
3. **Dynamic elements**: `{component}-{element}-{id}` (e.g., `beer-card-123`)
4. **State-specific**: `{component}-{state}` (e.g., `beer-list-empty`)
5. **Section grouping**: `{screen}-section-{name}` (e.g., `settings-section-about`)

---

## Testing Strategy During Migration

### Parallel Test Maintenance

Maintain both old and new tests during migration:

```yaml
# Example: Support both old and new testIDs
- runFlow:
    when:
      visible:
        id: 'filter-chip-draft' # New testID
    commands:
      - tapOn:
          id: 'filter-chip-draft'
    else:
      - tapOn:
          id: 'filter-draft-button' # Old testID (fallback)
```

### Feature Flags for Tests

If using feature flags for gradual rollout:

```yaml
# Check for new UI before running specific assertions
- runFlow:
    when:
      visible:
        id: 'home-nav-card-allbeer' # New home screen
    commands:
      # New home screen test flow
      - tapOn:
          id: 'home-nav-card-allbeer'
    else:
      # Legacy home screen test flow
      - tapOn: 'All Beer'
```

### CI/CD Integration

Update CI workflows during migration:

1. **Phase-specific test jobs**: Run only affected tests per phase
2. **Visual regression**: Add screenshot comparison for UI changes
3. **Performance baseline**: Track animation performance metrics

---

## Rollback Procedures

### If Tests Fail After Component Update

1. **Immediate**: Revert component changes, verify tests pass
2. **Investigation**: Compare testID changes against this plan
3. **Fix forward**: Update tests if component changes are correct
4. **Document**: Update migration plan with lessons learned

### If Visual Regression Detected

1. **Screenshot comparison**: Review before/after images
2. **Verify intentional**: Confirm change matches design spec
3. **Update baseline**: Accept new screenshots if correct
4. **Rollback if incorrect**: Revert component changes

### Emergency Rollback Commands

```bash
# Revert last component changes
git revert HEAD

# Restore test files from main branch
git checkout main -- .maestro/*.yaml

# Re-run full test suite
maestro test .maestro/
```

---

## Related Documentation

- **UI Redesign Plan**: `docs/UI_REDESIGN_PLAN.md`
- **Accessibility Checklist**: `docs/ACCESSIBILITY_CHECKLIST.md`
- **Maestro README**: `.maestro/README.md`
- **Test Execution Tips**: `.maestro/README.md#test-execution-tips`

---

**Last Updated**: 2025-12-05
**Maintainer**: BeerSelector Team
**Status**: Phase 0 - Prerequisites
