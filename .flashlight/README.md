# Flashlight Performance Testing for BeerSelector

This directory contains performance test configurations for the BeerSelector app using Flashlight.

## Overview

Flashlight is a performance testing tool for React Native apps that measures:
- **FPS (Frames Per Second)** during scrolling and animations
- **Interaction delays** (tap to response time)
- **App startup time** (cold and warm starts)
- **Memory usage** and CPU utilization
- **Network performance** for API calls

## Test Suites

### 1. Beer List Scroll Performance
- **Purpose**: Measure FPS and frame drops during list scrolling
- **Threshold**: Minimum 55 FPS, maximum 18ms frame time
- **Tests**:
  - Slow scroll down (3 seconds)
  - Slow scroll up (3 seconds)
  - Fast scroll down (1 second)
  - Fast scroll up (1 second)

### 2. Search and Filter Performance
- **Purpose**: Measure responsiveness of search input and filters
- **Threshold**: Maximum 300ms interaction delay
- **Tests**:
  - Search input responsiveness
  - Filter button tap response
  - Sort toggle response

### 3. Beer Item Expansion Performance
- **Purpose**: Measure performance of expanding/collapsing items
- **Threshold**: Maximum 200ms interaction delay
- **Tests**:
  - Single item expansion
  - Single item collapse
  - Multiple rapid expansions

### 4. App Startup Performance
- **Purpose**: Measure cold and warm start times
- **Thresholds**:
  - Cold start: Maximum 3 seconds
  - Warm start: Maximum 1 second
- **Tests**:
  - Cold start (cleared state)
  - Warm start (backgrounded then foregrounded)

### 5. Tab Navigation Performance
- **Purpose**: Measure tab switching performance
- **Threshold**: Maximum 500ms navigation time
- **Tests**:
  - Navigate between all tabs
  - Measure interaction delay for each tap

### 6. Pull-to-Refresh Performance
- **Purpose**: Measure refresh gesture and API call performance
- **Threshold**: Maximum 10 seconds for complete refresh
- **Tests**:
  - Pull-to-refresh gesture
  - API call timing
  - Refresh animation FPS

## Running Performance Tests

### Prerequisites

1. Install Flashlight globally:
```bash
npm install -g @shopify/flashlight
```

2. Build your app with performance profiling enabled:
```bash
# iOS
npm run ios -- --configuration Release

# Android
npm run android -- --variant=release
```

### Running Tests

#### Run all performance tests:
```bash
flashlight test --config .flashlight/performance-tests.yaml
```

#### Run specific test:
```bash
flashlight test --config .flashlight/performance-tests.yaml --test "Beer List Scroll Performance"
```

#### Run tests and generate report:
```bash
flashlight test --config .flashlight/performance-tests.yaml --report
```

### Viewing Reports

Performance reports are saved to `.flashlight/reports/` in JSON format.

View the report in your browser:
```bash
flashlight report .flashlight/reports/latest.json
```

## Performance Baselines

### Target Device Performance

| Device | Min FPS | Max Interaction Delay |
|--------|---------|----------------------|
| iPhone 12 Pro | 60 | 200ms |
| iPhone SE (2nd gen) | 55 | 300ms |
| Android Pixel 5 | 55 | 300ms |
| Android Samsung S20 | 58 | 250ms |

### Expected Performance Metrics

#### Beer List Scrolling
- **Target FPS**: 60 FPS
- **Acceptable FPS**: 55 FPS minimum
- **Frame drops**: Maximum 5 dropped frames per scroll
- **Memory**: Stable (no memory leaks during virtualization)

#### Search and Filter
- **Input delay**: < 100ms
- **Filter render time**: < 200ms
- **Sort render time**: < 200ms
- **Total interaction delay**: < 300ms

#### Beer Item Expansion
- **Tap response**: < 100ms
- **Expansion animation**: < 300ms
- **Collapse animation**: < 300ms

#### App Startup
- **Cold start**: < 3 seconds to interactive
- **Warm start**: < 1 second to interactive
- **Database initialization**: < 2 seconds

## Troubleshooting

### Tests Failing Due to Performance Issues

1. **Low FPS during scrolling**
   - Check FlatList configuration (windowSize, maxToRenderPerBatch)
   - Profile component re-renders
   - Ensure React.memo is used on BeerItem component

2. **High interaction delay**
   - Check for unnecessary re-renders
   - Profile state management
   - Verify no blocking operations on main thread

3. **Slow app startup**
   - Profile database initialization
   - Check for blocking operations in app/_layout.tsx
   - Verify lazy loading is implemented

### Device-Specific Issues

If tests fail on specific devices:
1. Adjust thresholds in `performance-tests.yaml`
2. Check device-specific performance profiles
3. Test on different OS versions

## Continuous Integration

### Running in CI

Add to your CI pipeline:
```yaml
# GitHub Actions example
- name: Run Flashlight Performance Tests
  run: |
    flashlight test --config .flashlight/performance-tests.yaml --ci
```

### Performance Regression Detection

Flashlight can compare against baseline:
```bash
flashlight test --config .flashlight/performance-tests.yaml --baseline .flashlight/reports/baseline.json
```

If performance regresses beyond thresholds, the CI job will fail.

## Contributing

When adding new features:
1. Add corresponding performance tests
2. Set realistic thresholds based on target devices
3. Document expected performance characteristics
4. Update baseline after significant changes

## Resources

- [Flashlight Documentation](https://github.com/bamlab/flashlight)
- [React Native Performance](https://reactnative.dev/docs/performance)
- [FlatList Optimization](https://reactnative.dev/docs/optimizing-flatlist-configuration)
