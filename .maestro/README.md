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

## How Maestro validates this suite

Canonical statement of the CLI behaviours this suite depends on. Several flow
files and both workflow files used to restate these inline; they now point
here instead. All four were verified against Maestro **2.4.0**, the pinned
version, by running the failing case — not inferred from documentation.

**1. Validation is whole-directory and happens before any test runs.**
`maestro test .maestro/` parses every flow in the directory first. One invalid
property in one flow aborts the entire run with **zero tests executed** — the
other flows do not run and do not report. Verified: a directory holding one
valid flow and one flow with `matching: contains` under `scrollUntilVisible`
produced only `Unknown Property: matching`; the valid flow never started.

This is why a single bad line reads as "the whole suite is broken" rather than
"one test failed", and why a parse fault must be fixed before any result from
this directory means anything.

**2. Validation reaches nested `runFlow: commands:`.**
There is no depth at which an invalid command stops being checked. A `wait: 500`
nested inside `runFlow: commands:` is rejected with the same error, pointing at
the nested line, as one at the top level. Maestro has no `wait` command at all;
`waitForAnimationToEnd` with a `timeout` is the bounded wait it does have, and
it returns as soon as animations settle, so it is a ceiling rather than a fixed
sleep — better for a test, but not identical to a sleep.

**3. Only the first two YAML documents in a file are read.**
A flow file is `header --- commands`. Maestro reads that pair and **silently
ignores every subsequent document**. Anything after the second `---` is dead
text: it is not executed, and it is not even parse-checked, so an invalid
command there raises nothing. Verified: a file whose third and fourth documents
contained both an invalid `wait` and a guaranteed-failing assertion ran only
`launchApp` and **reported success**.

`beer-list-loading.yaml` was built this way — 12 flows in one file, of which
Maestro ran the first. It has been split into `20-loading-*.yaml` through
`31-loading-*.yaml` (Wave 7.1) and removed. Those 12 are currently RED and
deliberately unregistered; each states why in its own header.

If you are adding a flow, one file is one flow. A second `appId:` in a file is
always a bug, and `grep -c '^appId:' .maestro/*.yaml` finds it.

**4. The pin makes local a truthful predictor only if local matches.**
CI pins `MAESTRO_VERSION=2.4.0` and asserts it took. Nothing pins or checks
your machine. Local `maestro test .maestro/` predicts CI only while your CLI is
also 2.4.0, which nothing enforces — confirm before trusting a local pass:

```bash
maestro --version   # must print 2.4.0 to match CI
```

`latest` is how this suite rotted in the first place: flows written against an
older CLI stopped parsing when Maestro moved on, and nobody noticed because the
pipeline was already failing earlier for a different reason.

**5. Tapping a tab by its title is not what it looks like, and may not work
after the first hop.**

This one corrects an earlier claim made in this README's own history. Flows tap
`"All Beer"`, `"Beerfinder"` and `"Tasted Brews"`, and those were once
justified by citing the `Tabs.Screen options={{ title: ... }}` values in
`app/(tabs)/_layout.tsx`. **That citation was wrong.** The custom
`TerminalTabBar` renders `TAB_CONFIGS` labels — `HOME`, `BEERS`, `FINDER`,
`TASTED` — and never reads `options.title`. Those titles are dead config; no
tab bar item carries the text any flow taps.

Where the strings actually live:

| String                                            | Real source                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `"All Beers"` / `"Beerfinder"` / `"Tasted Brews"` | Home tab `NavigationCard` titles, `app/(tabs)/index.tsx:199-225` |
| `"All Beer"`                                      | `ScanlineTitle` on `beerlist.tsx`                                |
| `"Beerfinder"`                                    | `ScanlineTitle` on `mybeers.tsx:60`                              |
| `"Tasted Brews"`                                  | `ScanlineTitle` on `tastedbrews.tsx`                             |

**Maestro anchors the text regex to the element's WHOLE text.** A bare
substring does not match. Verified against 2.4.0 on a booted simulator with
"Settings" on screen:

| selector       | result       |
| -------------- | ------------ |
| `"Setting"`    | **no match** |
| `"Setting.*"`  | matches      |
| `".*etting.*"` | matches      |
| `"Settings"`   | matches      |

An earlier version of this point claimed the opposite — that `"All Beer"`
matches the `"All Beers"` card because matching is by regex. The premise is
true and the inference was false, and 16 selectors were changed on the strength
of it. Metacharacters work; substrings do not.

Consequences, since they are not symmetrical:

- `"Beerfinder"` and `"Tasted Brews"` **are** the exact `NavigationCard`
  titles, so those taps have a real target from Home.
- `"All Beer"` is **not**. The card is `"All Beers"` (plural); the only element
  whose whole text is `"All Beer"` is the `ScanlineTitle` on `beerlist.tsx:26`
  — the header of the screen the tap is trying to _reach_. So use `"All Beers"`
  to navigate and `"All Beer"` only to assert arrival. They are different
  strings for different jobs, which is exactly how this went wrong.

A **second** tab tap, issued after leaving Home, is the open question.
React Navigation detaches inactive screens by default
(`detachInactiveScreens`, and `ResourceSavingView` sets `display: none`), which
removes Home's cards from the hierarchy — so there may be nothing left to
match. **This is unverified in both directions.** It is source-level reasoning;
no configured simulator was available to run it (see 7.3 in
`plans/review-remediation-round-8.md`).

Ten registered flows depend on this — `05-navigation-and-tabs.yaml` alone taps
14 times — so if the multi-hop assumption is false, it is false for flows that
predate this work and are presumed to pass. Establish it on a configured
simulator before trusting any multi-hop flow, new or old. Navigating via Home
between hops, or matching `testID="nav-*"` on the cards, are the obvious
alternatives if it does not hold.

---

## Test Suite Overview

**Flow files:** 39 (**21** registered in `config.yaml`; the rest run nowhere — see Wave 7.2)
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

## Running these tests

**These flows do not run in CI. They are run by hand.**

`e2e-tests.yml` and `maestro-e2e.yml` were deleted on 2026-08-11. Between them
they ran 143 times and **never once passed**. Every run failed the same way —
21/21 flows dying on their opening assertion — because the `.app` under test was
built with `SKIP_BUNDLING enabled; skipping.` and therefore contained no
JavaScript. The two workflows also duplicated each other on push and PR, both on
`macos-latest` (billed at 10×), at ~46 minutes per iOS job: 23 minutes building a
bundle-less app and 14 minutes running flows against it that could not pass.

Nothing about the flows themselves was established to be wrong — they were never
given a working build to run against. If you want them back in CI, fix the
bundling first and get one green run locally before spending runner time on it.

### Running locally

The suite is **iOS-only** — all 39 flows hardcode `org.verily.FSbeerselector`.
There is no Android path; `test:e2e:android` was removed because it ran the iOS
suite against an Android build and could only mislead.

**A local Debug build has no JS bundle either** — `ios/BeerSelector.xcodeproj/project.pbxproj:334`
sets `SKIP_BUNDLING=1` whenever `$CONFIGURATION` contains `Debug`, and no
`.xcode.env.updates` exists to unset it. That is the same hole CI fell into.

What makes local work is **Metro**, not the build: `npm run ios` leaves the
bundler serving JS to the app. So Metro must stay running in its own terminal
for the whole Maestro run. Kill it and you are testing CI's bundle-less app.

```bash
# 1. Terminal A — build, install, and LEAVE METRO RUNNING. Do not Ctrl-C it.
npm run ios

# 2. Terminal B — registered suite, the 21 flows listed in config.yaml (~15 min)
npm run test:e2e

# 3. Terminal B — a single flow. Much the faster loop while iterating, and the
#    only way to run one of the 18 unregistered files (see "Test Suite Overview")
npm run test:e2e:single .maestro/20-loading-all-beers.yaml
```

Check `maestro --version` prints **2.4.0** first — see "How Maestro validates
this suite", point 4. Nothing enforces your local version now that CI is gone,
and a mismatched CLI is how this suite rotted the first time.

Set the environment variables below in your shell or a local `.env` first; they
were previously supplied as GitHub secrets. Flows that exercise login need
`TEST_UFO_EMAIL` / `TEST_UFO_PASSWORD` and will fail without them.

### Credentials

Export these in your shell or a local `.env` — **never commit them**:

```bash
TEST_UFO_EMAIL          # Test account email (for authenticated tests)
TEST_UFO_PASSWORD       # Test account password
EXPO_TOKEN              # Expo authentication token (optional)
```

### Environment Variables

```bash
EXPO_PUBLIC_USE_MOCK_SERVER=true      # Use mock API server
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_API_TIMEOUT=30000         # generous timeout for E2E runs
```

---

## Test Files

### Core Functionality

| File                          | Purpose                         | Duration |
| ----------------------------- | ------------------------------- | -------- |
| `01-beer-list-rendering.yaml` | Beer list display and scrolling | ~2 min   |
| `02-search-and-filter.yaml`   | Search/filter operations        | ~4 min   |
| `03-beer-item-expansion.yaml` | Beer details expansion          | ~3 min   |
| `04-empty-states.yaml`        | Empty state handling            | ~3 min   |
| `05-navigation-and-tabs.yaml` | Tab navigation                  | ~3 min   |

### Authentication & Settings

| File                             | Purpose                 | Duration |
| -------------------------------- | ----------------------- | -------- |
| `06-login-flow-member.yaml`      | UFO Club member login   | ~5 min   |
| `07-login-flow-visitor.yaml`     | Visitor mode login      | ~6 min   |
| `08-auto-login.yaml`             | Auto-login on startup   | ~6 min   |
| `09-refresh-functionality.yaml`  | Data refresh operations | ~5 min   |
| `10-settings-configuration.yaml` | Settings screen flows   | ~7 min   |
| `11-settings-first-launch.yaml`  | First launch setup      | ~8 min   |

### Error Handling

| File                               | Purpose                  | Duration |
| ---------------------------------- | ------------------------ | -------- |
| `12-offline-scenarios.yaml`        | Offline mode testing     | ~8 min   |
| `13-network-timeout-recovery.yaml` | Network timeout handling | ~11 min  |
| `14-api-error-handling.yaml`       | API error scenarios      | ~13 min  |
| `15-config-validation.yaml`        | Configuration validation | ~6 min   |
| `16-offline-mode.yaml`             | Offline indicators       | ~3 min   |

### Advanced Flows

| File                                     | Purpose                  | Duration |
| ---------------------------------------- | ------------------------ | -------- |
| `LOGIN_WEBVIEW_ERROR_HANDLING.yaml`      | WebView error recovery   | ~12 min  |
| `SETTINGS_AUTO_LOGIN.yaml`               | Settings auto-login flow | ~16 min  |
| `MP-7-STEP-2-OPERATION-QUEUE-TESTS.yaml` | Operation queue testing  | ~4 min   |

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
        { id: 2, name: 'Test Beer 2', brewery: 'Another Brewery' },
      ],
    },
  ]);
});

// Mock my beers endpoint
app.get('/my_beers.php', (req, res) => {
  res.json([
    {},
    {
      brewInStock: [{ id: 1, name: 'Tasted Beer 1', brewery: 'Test Brewery' }],
    },
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

# Build and install app.
#
# NOTE: -configuration Debug sets SKIP_BUNDLING=1 (project.pbxproj:334), so the
# resulting .app contains NO JavaScript. Running Maestro against it reproduces
# the exact failure that made CI return 21/21 failed for 143 runs. Two ways out:
#
#   (a) Debug + Metro — build as below, then keep `npx expo start` running in
#       another terminal for the whole Maestro run. This is what `npm run ios`
#       does for you, and is the normal loop.
#   (b) Release — embeds the bundle, so no Metro needed. Slower to build.
#
npx expo prebuild --platform ios
cd ios
xcodebuild -workspace BeerSelector.xcworkspace -scheme BeerSelector -configuration Release -sdk iphonesimulator build
cd ..

# Run tests (Metro running too, if you built Debug)
maestro test .maestro/
```

### Android

**Not currently supported.** Every flow's `appId:` header hardcodes
`org.verily.FSbeerselector` — the iOS bundle ID — directly, by decision, not
oversight. Running `maestro test .maestro/` against an Android build (package
`org.verily.FSBeerselector`, per `app.json` — capital B, genuinely a
different string) will fail at `launchApp` immediately; that's expected, not
a setup problem to chase. `.maestro/config.yaml` documents both bundle IDs
for reference, in case Android support is added back later.

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
5. **Test locally** - Verify on iOS (Android is not currently supported)
6. **Add to CI** - Include in appropriate CI job

### Test File Template

```yaml
appId: org.verily.FSbeerselector
---
# Test Name: Feature Description
# Priority: P0/P1/P2
# Duration: ~X min
# Prerequisites: Any required setup

- launchApp:
    clearState: true

- assertVisible:
    text: 'Expected Element'

- tapOn:
    testID: 'button-id'

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

- **GitHub Workflow:** none — these flows are run by hand, see "Running these tests"
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
