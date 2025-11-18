# Maestro E2E Tests - BeerSelector

Comprehensive end-to-end test suite for the BeerSelector React Native application using [Maestro](https://maestro.mobile.dev).

---

## Quick Start

### Run All Tests

```bash
# From project root
maestro test .maestro/
```

### Run Specific Test

```bash
maestro test .maestro/01-beer-list-rendering.yaml
```

### Run with Debug Output

```bash
maestro test .maestro/ --debug
```

---

## Test Suite Overview

**Total Tests:** 19 test files
**Total Scenarios:** 100+ test scenarios
**Coverage:** Core user flows, error handling, offline support

### Test Categories

**Core Functionality (Tests 01-05)**
- Beer list rendering and scrolling
- Search and filter operations
- Beer item expansion and details
- Empty state handling
- Navigation and tab switching

**Authentication & Settings (Tests 06-11)**
- Member login flow
- Visitor mode login
- Auto-login functionality
- Data refresh operations
- Settings configuration
- First launch setup

**Error Handling & Resilience (Tests 12-16)**
- Offline scenarios (airplane mode)
- Network timeout recovery
- API error handling
- Configuration validation
- Offline mode indicators

**Advanced Flows**
- Login WebView error handling (`LOGIN_WEBVIEW_ERROR_HANDLING.yaml`)
- Settings auto-login (`SETTINGS_AUTO_LOGIN.yaml`)
- Operation queue tests (`MP-7-STEP-2-OPERATION-QUEUE-TESTS.yaml`)

---

## Running in CI/CD

### Quick Setup

1. Copy `.github/workflows/maestro-e2e.yml` to your workflows directory
2. Configure environment variables in GitHub Settings → Secrets
3. Push to trigger the workflow

### Required Secrets

Configure these in your CI/CD platform:

```bash
EXPO_TOKEN              # Expo authentication token (optional)
TEST_UFO_EMAIL          # Test account email (for authenticated tests)
TEST_UFO_PASSWORD       # Test account password
```

### Environment Variables

```bash
EXPO_PUBLIC_USE_MOCK_SERVER=true      # Use mock API server
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_API_TIMEOUT=30000         # 30 second timeout for CI
```

### GitHub Actions Example

```yaml
- name: Install Maestro
  run: |
    curl -fsSL https://get.maestro.mobile.dev | bash
    echo "$HOME/.maestro/bin" >> $GITHUB_PATH

- name: Run Maestro Tests
  env:
    APP_ID: org.verily.FSbeerselector
  run: |
    maestro test .maestro/ \
      --format junit \
      --output maestro-results.xml
```

### CI Test Strategy

**Pull Request Validation (Fast - ~15 min with parallel execution)**
```bash
# Run only critical P0 tests
maestro test .maestro/01-beer-list-rendering.yaml
maestro test .maestro/06-login-flow-member.yaml
maestro test .maestro/07-login-flow-visitor.yaml
```

**Nightly Builds (Comprehensive - ~45 min)**
```bash
# Run full test suite
maestro test .maestro/
```

**Release Candidates (Exhaustive)**
```bash
# Run all tests on both platforms
npm run test:e2e:ios
npm run test:e2e:android
```

### Parallel Test Execution

**GitHub Actions automatically runs tests in parallel on pull requests**, reducing feedback time from 45 minutes to ~15 minutes. Tests are organized into logical groups that run concurrently:

**Test Groups:**
1. **login-flows** (3 tests) - Authentication and login flows
2. **settings** (3 tests) - Settings and configuration
3. **beer-features** (5 tests) - Beer list features and navigation
4. **offline-network** (4 tests) - Offline support and network handling
5. **error-handling** (3 tests) - Error handling and edge cases

**Run Parallel Tests Locally:**

```bash
# Using background jobs (simple approach)
maestro test .maestro/06-login-flow-member.yaml &
maestro test .maestro/07-login-flow-visitor.yaml &
maestro test .maestro/10-settings-configuration.yaml &
maestro test .maestro/01-beer-list-rendering.yaml &
wait  # Wait for all background jobs to complete
```

```bash
# Using GNU parallel (advanced - requires gnu-parallel installation)
# Run all tests in parallel with 4 concurrent jobs
parallel -j 4 maestro test ::: .maestro/*.yaml
```

**Benefits of Parallel Execution:**
- 3x faster test execution (45min sequential → 15min parallel)
- Faster PR feedback loop
- Better CI resource utilization
- Isolated test failures (easier debugging)

**Trade-offs:**
- Requires more CI minutes/runner instances
- May require more simulator/emulator resources locally
- Test failures may be harder to debug without sequential context
- Potential simulator resource contention on macOS

---

## Test Files

### Core Functionality

| File | Purpose | Duration |
|------|---------|----------|
| `01-beer-list-rendering.yaml` | Beer list display and scrolling | ~2 min |
| `02-search-and-filter.yaml` | Search/filter operations | ~4 min |
| `03-beer-item-expansion.yaml` | Beer details expansion | ~3 min |
| `04-empty-states.yaml` | Empty state handling | ~3 min |
| `05-navigation-and-tabs.yaml` | Tab navigation | ~3 min |

### Authentication & Settings

| File | Purpose | Duration |
|------|---------|----------|
| `06-login-flow-member.yaml` | UFO Club member login | ~5 min |
| `07-login-flow-visitor.yaml` | Visitor mode login | ~6 min |
| `08-auto-login.yaml` | Auto-login on startup | ~6 min |
| `09-refresh-functionality.yaml` | Data refresh operations | ~5 min |
| `10-settings-configuration.yaml` | Settings screen flows | ~7 min |
| `11-settings-first-launch.yaml` | First launch setup | ~8 min |

### Error Handling

| File | Purpose | Duration |
|------|---------|----------|
| `12-offline-scenarios.yaml` | Offline mode testing | ~8 min |
| `13-network-timeout-recovery.yaml` | Network timeout handling | ~11 min |
| `14-api-error-handling.yaml` | API error scenarios | ~13 min |
| `15-config-validation.yaml` | Configuration validation | ~6 min |
| `16-offline-mode.yaml` | Offline indicators | ~3 min |

### Advanced Flows

| File | Purpose | Duration |
|------|---------|----------|
| `LOGIN_WEBVIEW_ERROR_HANDLING.yaml` | WebView error recovery | ~12 min |
| `SETTINGS_AUTO_LOGIN.yaml` | Settings auto-login flow | ~16 min |
| `MP-7-STEP-2-OPERATION-QUEUE-TESTS.yaml` | Operation queue testing | ~4 min |

---

## Test Execution Tips

### Run Tests by Priority

**P0 - Critical (Must pass before merge)**
```bash
maestro test .maestro/01-beer-list-rendering.yaml
maestro test .maestro/06-login-flow-member.yaml
maestro test .maestro/07-login-flow-visitor.yaml
```

**P1 - Important (Should pass before release)**
```bash
maestro test .maestro/09-refresh-functionality.yaml
maestro test .maestro/10-settings-configuration.yaml
maestro test .maestro/SETTINGS_AUTO_LOGIN.yaml
```

**P2 - Nice to have (Optional, manual testing OK)**
```bash
maestro test .maestro/12-offline-scenarios.yaml
maestro test .maestro/13-network-timeout-recovery.yaml
```

### Run Tests by Feature

**Beer List Features**
```bash
maestro test .maestro/01-beer-list-rendering.yaml
maestro test .maestro/02-search-and-filter.yaml
maestro test .maestro/03-beer-item-expansion.yaml
```

**Login & Authentication**
```bash
maestro test .maestro/06-login-flow-member.yaml
maestro test .maestro/07-login-flow-visitor.yaml
maestro test .maestro/LOGIN_WEBVIEW_ERROR_HANDLING.yaml
```

**Settings & Configuration**
```bash
maestro test .maestro/10-settings-configuration.yaml
maestro test .maestro/11-settings-first-launch.yaml
maestro test .maestro/SETTINGS_AUTO_LOGIN.yaml
```

---

## Mock Server Setup

For CI/CD and local testing without external API dependencies:

### 1. Create Mock Server

```javascript
// mock-server.js
const express = require('express');
const app = express();

app.use(express.json());

// Mock all beers endpoint
app.get('/all_beers.php', (req, res) => {
  res.json([
    {},
    {
      brewInStock: [
        { id: 1, name: 'Test Beer 1', brewery: 'Test Brewery' },
        { id: 2, name: 'Test Beer 2', brewery: 'Another Brewery' }
      ]
    }
  ]);
});

// Mock my beers endpoint
app.get('/my_beers.php', (req, res) => {
  res.json([
    {},
    {
      brewInStock: [
        { id: 1, name: 'Tasted Beer 1', brewery: 'Test Brewery' }
      ]
    }
  ]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Mock server running on port ${PORT}`);
});
```

### 2. Start Mock Server

```bash
# Add to package.json
{
  "scripts": {
    "mock-server": "node mock-server.js"
  }
}

# Start in background
npm run mock-server &
```

### 3. Configure App

```bash
# Create .env.test
EXPO_PUBLIC_USE_MOCK_SERVER=true
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_API_TIMEOUT=30000
```

---

## Platform-Specific Setup

### iOS

```bash
# Install Maestro
brew tap mobile-dev-inc/tap
brew install maestro

# Start simulator
xcrun simctl boot "iPhone 15 Pro"

# Build and install app
npx expo prebuild --platform ios
cd ios
xcodebuild -workspace BeerSelector.xcworkspace -scheme BeerSelector -configuration Debug -sdk iphonesimulator build
cd ..

# Run tests
APP_ID=org.verily.FSbeerselector maestro test .maestro/
```

### Android

```bash
# Install Maestro
curl -fsSL https://get.maestro.mobile.dev | bash

# Start emulator
emulator -avd Pixel_5_API_31 &
adb wait-for-device

# Build and install app
npx expo prebuild --platform android
cd android
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
cd ..

# Run tests
APP_ID=com.yourcompany.beerselector maestro test .maestro/
```

---

## Troubleshooting

### Tests Fail to Find App

**Issue:** Maestro can't launch the app

**Solution:**
```bash
# Verify app is installed
# iOS:
xcrun simctl listapps booted | grep FSbeerselector

# Android:
adb shell pm list packages | grep beerselector

# Reinstall if needed
```

### Tests Timeout

**Issue:** Tests hang or timeout

**Solution:**
1. Increase timeouts in test files
2. Check simulator/emulator performance
3. Close other apps consuming resources
4. Use `--debug` flag to see where it's stuck

### WebView Tests Fail

**Issue:** WebView interactions don't work

**Solution:**
1. Verify WebView testIDs are present
2. Add longer waits for WebView rendering
3. Check network connectivity (if not using mock server)

### Offline Tests Fail

**Issue:** Test 12 (offline scenarios) fails

**Solution:**
1. Enable airplane mode BEFORE running test
2. Ensure app has data from previous online session
3. Don't force quit app before running test

---

## Best Practices

### DO ✅

1. **Run critical tests locally before pushing** - Catch issues early
2. **Use mock server for consistent results** - No external dependencies
3. **Add testIDs to new UI components** - Makes tests more reliable
4. **Keep test files focused** - One feature per test file
5. **Use descriptive test names** - Clear what's being tested
6. **Wait for animations to complete** - Avoid flaky tests
7. **Reset app state between tests** - Clean slate for each test

### DON'T ❌

1. **Don't hardcode timing** - Use `waitForAnimationToEnd` instead of `sleep`
2. **Don't rely on exact text matching** - Text may change, use testIDs
3. **Don't skip error scenarios** - Error handling is critical
4. **Don't test implementation details** - Test user-facing behavior
5. **Don't create long test files** - Keep tests modular and focused

---

## Contributing

### Adding New Tests

1. **Create test file** - Use descriptive name: `XX-feature-name.yaml`
2. **Follow naming convention** - Numbered for core tests (01-19)
3. **Add to config.yaml** - Include in main test suite
4. **Document in README** - Update this file with test details
5. **Test locally** - Verify on iOS and Android
6. **Add to CI** - Include in appropriate CI job

### Test File Template

```yaml
appId: ${APP_ID}
---
# Test Name: Feature Description
# Priority: P0/P1/P2
# Duration: ~X min
# Prerequisites: Any required setup

- launchApp:
    clearState: true

- assertVisible:
    text: "Expected Element"

- tapOn:
    testID: "button-id"

- waitForAnimationToEnd:
    timeout: 5000
```

---

## Additional Resources

### Documentation

- **Maestro Docs:** https://maestro.mobile.dev/docs
- **BeerSelector CLAUDE.md:** `/workspace/BeerSelector/CLAUDE.md`
- **CI/CD Integration:** See `MAESTRO_MIGRATION_PHASE_2_SUMMARY.md` (CI/CD Integration section)
- **Offline Tests Guide:** `.maestro/README_OFFLINE_NETWORK_TESTS.md`

### Related Files

- **GitHub Workflow:** `.github/workflows/maestro-e2e.yml`
- **Config File:** `.maestro/config.yaml`
- **Environment Example:** `.env.example`
- **Mock Server Patterns:** `docs/MOCK_SERVER_PATTERNS.md` (if exists)

### Support

For questions or issues:
1. Check this README and related documentation
2. Review test file comments for detailed explanations
3. Check GitHub Issues for known problems
4. Create new issue with test results and logs

---

**Last Updated:** 2025-11-17
**Maintainer:** BeerSelector Team
**Version:** 2.0
