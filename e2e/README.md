# End-to-End Testing for BeerSelector

This document provides comprehensive guidance for running E2E tests for the BeerSelector React Native app using Maestro and Flashlight.

## Table of Contents

- [Overview](#overview)
- [Why E2E Testing?](#why-e2e-testing)
- [Test Architecture](#test-architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running Tests](#running-tests)
- [Test Suites](#test-suites)
- [Performance Testing](#performance-testing)
- [Continuous Integration](#continuous-integration)
- [Writing New Tests](#writing-new-tests)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Overview

The BeerSelector app uses two complementary E2E testing tools:

1. **Maestro** - UI automation and functional testing
2. **Flashlight** - Performance testing and profiling

Together, they provide comprehensive coverage of:
- User interactions and workflows
- UI rendering and behavior
- Scroll performance and FPS
- Navigation and state management
- Empty states and edge cases

## Why E2E Testing?

The BeerList component cannot be properly unit tested due to React Native FlatList limitations in Jest (see [TEST_FIXES_SUMMARY.md](../TEST_FIXES_SUMMARY.md), lines 206-250). E2E tests solve this by:

1. **Testing in Real Environment**: Tests run on actual iOS/Android simulators/devices
2. **FlatList Support**: Full FlatList rendering, scrolling, and virtualization
3. **User-Centric**: Tests validate actual user workflows, not implementation details
4. **Performance Validation**: Measure real-world performance metrics
5. **Integration Coverage**: Test how components work together

## Test Architecture

```
e2e/
├── README.md (this file)
├── .maestro/
│   ├── config.yaml                      # Maestro configuration
│   ├── 01-beer-list-rendering.yaml     # List rendering and scrolling
│   ├── 02-search-and-filter.yaml       # Search and filter functionality
│   ├── 03-beer-item-expansion.yaml     # Item expansion interactions
│   ├── 04-empty-states.yaml            # Empty states and edge cases
│   └── 05-navigation-and-tabs.yaml     # Tab navigation and state
└── .flashlight/
    ├── performance-tests.yaml           # Performance test suite
    └── README.md                        # Performance testing guide
```

### Test Coverage

#### BeerList Component (HIGH PRIORITY)
- ✅ Full list rendering with 100+ items
- ✅ Scrolling behavior (up, down, fast, slow)
- ✅ Item expansion/collapse
- ✅ Pull-to-refresh
- ✅ Empty states
- ✅ Loading states

#### Search Functionality
- ✅ Search input responsiveness
- ✅ Search filtering logic
- ✅ Clear search button
- ✅ Empty search results
- ✅ Special characters handling

#### Filter Functionality
- ✅ Draft filter toggle
- ✅ Heavies filter toggle
- ✅ IPA filter toggle
- ✅ Multiple filters combination
- ✅ Filter state persistence

#### Sort Functionality
- ✅ Sort by Date
- ✅ Sort by Name
- ✅ Sort toggle persistence

#### Navigation
- ✅ Tab switching (All Beer, Beerfinder, Tasted Brews)
- ✅ State persistence across tabs
- ✅ Navigation during loading

#### Performance
- ✅ List scroll FPS (target: 55+ FPS)
- ✅ Search response time (< 300ms)
- ✅ Filter application (< 200ms)
- ✅ App startup time (< 3 seconds cold start)

## Prerequisites

### System Requirements

- **macOS** (for iOS testing)
- **Xcode** 14+ (for iOS)
- **Android Studio** (for Android)
- **Node.js** 18+
- **iOS Simulator** or physical iOS device
- **Android Emulator** or physical Android device

### Development Environment

Ensure your Expo development build is set up:

```bash
# Install Expo CLI
npm install -g expo-cli

# Create development build
npx expo prebuild

# Build for iOS
npx expo run:ios

# Build for Android
npx expo run:android
```

## Installation

### 1. Install Maestro

Maestro is the primary E2E testing tool.

#### On macOS (recommended):
```bash
curl -fsSL https://get.maestro.mobile.dev | bash
```

#### On Windows:
```bash
# Using PowerShell
iwr https://get.maestro.mobile.dev | iex
```

#### Verify installation:
```bash
maestro --version
```

### 2. Install Flashlight

Flashlight is used for performance testing.

```bash
npm install -g @shopify/flashlight
```

#### Verify installation:
```bash
flashlight --version
```

### 3. Install Project Dependencies

```bash
cd /workspace/BeerSelector
npm install
```

## Running Tests

### Maestro Tests (Functional)

#### Run all test flows:
```bash
npm run test:e2e
```

Or directly with Maestro:
```bash
maestro test .maestro/
```

#### Run specific test flow:
```bash
maestro test .maestro/01-beer-list-rendering.yaml
```

#### Run on specific device:
```bash
# iOS
maestro test --device "iPhone 14 Pro" .maestro/

# Android
maestro test --device "emulator-5554" .maestro/
```

#### Run with environment variables:
```bash
# iOS
APP_ID=org.verily.FSbeerselector maestro test .maestro/

# Android
APP_ID=com.yourcompany.beerselector maestro test .maestro/
```

#### Generate test report:
```bash
maestro test .maestro/ --format junit --output test-results/maestro.xml
```

### Flashlight Tests (Performance)

#### Run all performance tests:
```bash
npm run test:performance
```

Or directly with Flashlight:
```bash
flashlight test --config .flashlight/performance-tests.yaml
```

#### Run specific performance test:
```bash
flashlight test --config .flashlight/performance-tests.yaml --test "Beer List Scroll Performance"
```

#### Generate performance report:
```bash
flashlight test --config .flashlight/performance-tests.yaml --report
flashlight report .flashlight/reports/latest.json
```

## Test Suites

### 1. Beer List Rendering and Scrolling

**File**: `.maestro/01-beer-list-rendering.yaml`

**Tests**:
- App launch and initialization
- Beer list container visibility
- Search bar presence
- Filter bar presence
- Beer count display
- List item rendering
- Scroll performance (up/down, fast/slow)
- Pull-to-refresh functionality

**Duration**: ~45 seconds

**Run**:
```bash
maestro test .maestro/01-beer-list-rendering.yaml
```

### 2. Search and Filter Functionality

**File**: `.maestro/02-search-and-filter.yaml`

**Tests**:
- Search input interaction
- Search filtering ("IPA", "Stout")
- Clear search button
- Draft filter toggle
- Heavies filter toggle
- IPA filter toggle
- Multiple filters combination
- Sort toggle (Date ↔ Name)
- Combined search + filter + sort

**Duration**: ~60 seconds

**Run**:
```bash
maestro test .maestro/02-search-and-filter.yaml
```

### 3. Beer Item Expansion

**File**: `.maestro/03-beer-item-expansion.yaml`

**Tests**:
- Single item tap to expand
- Single item tap to collapse
- Multiple item expansion (only one expanded at a time)
- Expansion after search
- Expansion after filter
- Expansion persistence during scroll

**Duration**: ~50 seconds

**Run**:
```bash
maestro test .maestro/03-beer-item-expansion.yaml
```

### 4. Empty States and Edge Cases

**File**: `.maestro/04-empty-states.yaml`

**Tests**:
- Empty search results
- Empty filter results
- Search + filter combination leading to empty
- Very long search terms
- Special characters in search
- Rapid filter toggling
- Multiple sort toggles
- App responsiveness after stress

**Duration**: ~55 seconds

**Run**:
```bash
maestro test .maestro/04-empty-states.yaml
```

### 5. Navigation and Tab Switching

**File**: `.maestro/05-navigation-and-tabs.yaml`

**Tests**:
- Basic tab navigation
- State persistence during navigation
- Search filter persistence
- Rapid tab switching
- Navigation during loading
- Memory management after multiple navigations

**Duration**: ~70 seconds

**Run**:
```bash
maestro test .maestro/05-navigation-and-tabs.yaml
```

## Performance Testing

See [.flashlight/README.md](../.flashlight/README.md) for detailed performance testing documentation.

### Quick Performance Test

```bash
# Run all performance tests
npm run test:performance

# View latest report
flashlight report .flashlight/reports/latest.json
```

### Performance Thresholds

| Metric | Target | Acceptable |
|--------|--------|------------|
| Scroll FPS | 60 | 55 |
| Search Response | 100ms | 300ms |
| Filter Application | 150ms | 200ms |
| Item Expansion | 100ms | 200ms |
| Cold Start | 2s | 3s |
| Warm Start | 500ms | 1s |

## Continuous Integration

### GitHub Actions

Add to `.github/workflows/e2e-tests.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  maestro-tests:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Install Maestro
        run: curl -fsSL https://get.maestro.mobile.dev | bash

      - name: Build iOS app
        run: npx expo run:ios --configuration Release

      - name: Run Maestro tests
        run: maestro test .maestro/

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: maestro-results
          path: test-results/

  performance-tests:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Install Flashlight
        run: npm install -g @shopify/flashlight

      - name: Build iOS app
        run: npx expo run:ios --configuration Release

      - name: Run performance tests
        run: flashlight test --config .flashlight/performance-tests.yaml --ci

      - name: Upload performance report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: performance-report
          path: .flashlight/reports/
```

## Writing New Tests

### Maestro Test Structure

```yaml
appId: ${APP_ID}
name: "Your Test Name"
---
# Test Flow Description

# Step 1: Description
- action:
    parameter: value

# Step 2: Another step
- assertVisible:
    id: "element-testid"
```

### Best Practices for Test IDs

When adding new components, include `testID` props:

```typescript
// Good - unique, descriptive testID
<TouchableOpacity testID="beer-item-123">
  <Text testID="beer-name-123">Beer Name</Text>
</TouchableOpacity>

// Bad - no testID (hard to select)
<TouchableOpacity>
  <Text>Beer Name</Text>
</TouchableOpacity>
```

### Test ID Naming Convention

- Use kebab-case: `beer-item-123`
- Be descriptive: `filter-draft-button` not `btn1`
- Include IDs for list items: `beer-item-${beer.id}`
- Use consistent prefixes: `filter-*`, `beer-*`, `sort-*`

### Maestro Commands Reference

```yaml
# Navigation
- tapOn: "Button Text"
- tapOn:
    id: "element-testid"

# Assertions
- assertVisible:
    id: "element-testid"
- assertNotVisible:
    text: "Some Text"

# Input
- inputText: "Search term"

# Scrolling
- scroll:
    direction: DOWN
- scrollUntilVisible:
    element:
      id: "target-element"

# Waiting
- waitForAnimationToEnd:
    timeout: 5000

# Gestures
- swipe:
    direction: DOWN
    from:
      id: "list-element"
```

## Troubleshooting

### Common Issues

#### 1. Test fails with "Element not found"

**Cause**: Element not yet rendered or testID missing

**Solutions**:
- Add `waitForAnimationToEnd` before assertions
- Verify testID is set on component
- Check if element is conditionally rendered
- Use regex for dynamic testIDs: `regex: "beer-item-.*"`

#### 2. Tests are flaky

**Cause**: Race conditions or timing issues

**Solutions**:
- Increase timeout values
- Add explicit waits: `waitForAnimationToEnd`
- Use `assertVisible` with timeout parameter
- Avoid hardcoded delays (use `waitForAnimationToEnd` instead)

#### 3. Performance tests fail

**Cause**: Performance thresholds too strict or device-specific

**Solutions**:
- Check device performance profile
- Adjust thresholds in `.flashlight/performance-tests.yaml`
- Test on target devices (not just dev machines)
- Profile app with React DevTools

#### 4. App doesn't launch

**Cause**: Build issues or incorrect app ID

**Solutions**:
- Verify app is built: `npx expo run:ios` or `npx expo run:android`
- Check APP_ID in `.maestro/config.yaml`
- Ensure simulator/emulator is running
- Check Maestro can see device: `maestro devices`

#### 5. Database not initialized

**Cause**: App launched too quickly

**Solutions**:
- Increase initial wait time
- Add `waitForAnimationToEnd: timeout: 10000` after launch
- Use `clearState: false` in launchApp to preserve data

### Debug Mode

Run tests in debug mode to see what Maestro is doing:

```bash
maestro test --debug .maestro/01-beer-list-rendering.yaml
```

View Maestro Studio (interactive test runner):

```bash
maestro studio
```

## Best Practices

### Test Design

1. **Test User Workflows, Not Implementation**
   - ✅ Good: "User searches for IPA and applies Draft filter"
   - ❌ Bad: "Call filterBeers() with isDraft=true"

2. **Make Tests Independent**
   - Each test should work standalone
   - Don't rely on state from previous tests
   - Use `clearState: false` to preserve data between flows

3. **Use Meaningful Names**
   - Test names should describe what's being tested
   - Step comments should explain why, not what

4. **Keep Tests Focused**
   - One test flow per feature/workflow
   - Break large tests into smaller flows

5. **Handle Async Operations**
   - Always wait for animations/loading
   - Use appropriate timeouts
   - Don't use fixed delays (use `waitForAnimationToEnd`)

### Performance Testing

1. **Set Realistic Thresholds**
   - Base on target devices, not dev machines
   - Account for CI environment overhead

2. **Test on Real Devices**
   - Simulators don't reflect real performance
   - Test on low-end and high-end devices

3. **Monitor Trends**
   - Track performance over time
   - Set up baseline comparisons
   - Alert on regressions

### Maintenance

1. **Update Tests with Features**
   - Add tests for new features immediately
   - Update tests when UI changes
   - Remove tests for removed features

2. **Review Test Failures**
   - Don't ignore flaky tests
   - Fix root cause, don't increase timeouts blindly
   - Document known issues

3. **Keep Documentation Updated**
   - Update this README when adding tests
   - Document new test IDs
   - Explain complex test scenarios

## Resources

### Maestro
- [Official Documentation](https://maestro.mobile.dev/docs)
- [Command Reference](https://maestro.mobile.dev/reference)
- [Best Practices](https://maestro.mobile.dev/best-practices)

### Flashlight
- [GitHub Repository](https://github.com/bamlab/flashlight)
- [Performance Guide](https://reactnative.dev/docs/performance)

### React Native Testing
- [Testing Overview](https://reactnative.dev/docs/testing-overview)
- [FlatList Optimization](https://reactnative.dev/docs/optimizing-flatlist-configuration)

## Contributing

When contributing new tests:

1. Follow the test ID naming convention
2. Add comprehensive comments explaining the test flow
3. Set realistic timeouts and thresholds
4. Test on both iOS and Android if possible
5. Update this documentation
6. Ensure tests are non-flaky (run 5+ times)

## Questions?

For questions or issues with E2E testing:
1. Check this documentation
2. Review [TEST_FIXES_SUMMARY.md](../TEST_FIXES_SUMMARY.md)
3. Check Maestro/Flashlight docs
4. Open an issue with test logs
