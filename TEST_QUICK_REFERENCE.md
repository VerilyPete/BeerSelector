# Test Hanging Quick Reference

**Last Updated:** 2025-11-16

---

## Quick Test Status Guide

### ✅ Safe to Run (Complete in <10s)

These tests run quickly and reliably:

```bash
# Run all safe unit tests
npm test -- src/ hooks/ --testPathIgnorePatterns="integration" --watchAll=false

# Run specific safe test categories
npm test -- hooks/__tests__/useBeerFilters.test.ts --watchAll=false
npm test -- src/database/repositories/__tests__/ --watchAll=false
npm test -- src/api/__tests__/apiClient.test.ts --watchAll=false
npm test -- src/config/__tests__/ --watchAll=false
npm test -- components/beer/__tests__/BeerItem.test.tsx --watchAll=false
```

**Total:** 60+ test files ✅

---

### ❌ Hanging Tests (NEVER RUN - Skip These)

**DO NOT RUN** these tests - they hang indefinitely:

| File | Why It Hangs | Alternative |
|------|--------------|-------------|
| `context/__tests__/NetworkContext.test.tsx` | NetInfo.fetch() deadlock | Use Maestro offline tests |
| `components/__tests__/OfflineIndicator.test.tsx` | Wraps NetworkProvider | Use Maestro offline tests |
| `components/__tests__/LoginWebView.test.tsx` | WebView async chain | Use Maestro login flow tests |
| `components/__tests__/UntappdLoginWebView.test.tsx` | WebView navigation deadlock | Use Maestro Untappd tests |

---

### ⚠️ Slow but Complete (30-60s)

These may timeout but eventually complete:

```bash
# Increase timeout for slow tests
npm test -- context/__tests__/AppContext.test.tsx --testTimeout=60000 --watchAll=false
npm test -- app/__tests__/settings.integration.test.tsx --testTimeout=60000 --watchAll=false
```

---

## How to Skip Hanging Tests

### Method 1: Command Line Flag

```bash
# Skip hanging tests by pattern
npm test -- --testPathIgnorePatterns="NetworkContext|OfflineIndicator|LoginWebView|UntappdLoginWebView" --watchAll=false
```

---

### Method 2: Update jest.config.js

Add to `testPathIgnorePatterns` array in `/workspace/BeerSelector/jest.config.js`:

```javascript
testPathIgnorePatterns: [
  '/node_modules/',
  '/ios/',
  '/android/',
  // ADD THESE:
  'NetworkContext.test.tsx',
  'OfflineIndicator.test.tsx',
  'LoginWebView.test.tsx',
  'UntappdLoginWebView.test.tsx',
],
```

---

### Method 3: Create npm Script

Add to `package.json`:

```json
{
  "scripts": {
    "test:unit": "jest --testPathIgnorePatterns=NetworkContext OfflineIndicator LoginWebView UntappdLoginWebView --watchAll=false",
    "test:safe": "jest src/ hooks/ --watchAll=false"
  }
}
```

Then run:
```bash
npm run test:unit
npm run test:safe
```

---

## Kill Hanging Processes

If tests are stuck, kill them:

```bash
# Kill all hanging jest processes
pkill -f "jest"

# Or kill by specific pattern
pkill -f "jest.*NetworkContext"
```

---

## Use Maestro Instead

For integration tests, use Maestro (already configured):

```bash
# Run all E2E tests
npm run test:integration

# Run specific flows
maestro test .maestro/tests/offline-network.yaml
maestro test .maestro/tests/login-flow.yaml
maestro test .maestro/MP-5-LOGIN-TESTS/
```

---

## Test Categories by Safety

### ✅ Always Safe

- Pure function tests (`src/utils/`, `src/types/`)
- Database repository tests (`src/database/repositories/`)
- API service tests (`src/api/`)
- Config tests (`src/config/`)
- Hook tests without RN dependencies (`hooks/useBeerFilters`)

### ⚠️ Use Caution

- Context tests (`context/__tests__/AppContext.test.tsx`)
- Integration tests (`app/__tests__/settings.integration.test.tsx`)
- Component tests with complex mocks

### ❌ Never Run in Jest

- NetworkContext tests (use Maestro)
- OfflineIndicator tests (use Maestro)
- LoginWebView tests (use Maestro)
- UntappdLoginWebView tests (use Maestro)

---

## Common Test Commands

```bash
# Run only safe unit tests
npm test -- src/ hooks/ components/beer/__tests__/BeerItem --watchAll=false

# Run with coverage
npm run test:ci -- --testPathIgnorePatterns="NetworkContext|OfflineIndicator|LoginWebView|UntappdLoginWebView"

# Run Maestro integration tests
npm run test:e2e

# Run specific Maestro test
maestro test .maestro/tests/login-flow.yaml

# List all test files
npm test -- --listTests
```

---

## Troubleshooting

### Problem: Tests hanging for 30+ seconds

**Solution:** Press Ctrl+C to stop, then skip hanging tests:

```bash
npm test -- --testPathIgnorePatterns="NetworkContext|OfflineIndicator|LoginWebView" --watchAll=false
```

---

### Problem: Multiple background processes running

**Solution:** Kill all jest processes:

```bash
pkill -f jest
ps aux | grep jest  # Verify they're gone
```

---

### Problem: Test timeout even with increased timeout

**Solution:** Don't run the test - use Maestro instead:

```bash
# Instead of:
npm test -- components/__tests__/LoginWebView.test.tsx  # ❌ HANGS

# Use:
maestro test .maestro/tests/login-flow.yaml  # ✅ WORKS
```

---

## Why Some Tests Hang

**Root Cause:** Jest's jsdom environment can't properly mock React Native native modules like NetInfo and WebView.

**Technical Details:**
- NetInfo.fetch() creates Promise that never resolves in Jest event loop
- WebView callbacks create async chains that deadlock
- React Native Testing Library + native modules = incompatible in jsdom

**Solution:** Use Maestro E2E tests for component integration testing.

---

## Related Documentation

- **Full Analysis:** `TEST_HANGING_ANALYSIS.md` (comprehensive report)
- **Testing Strategy:** `CLAUDE.md` lines 270-322
- **Previous Fixes:** `TEST_FIXES_SUMMARY.md` (BeerItem timer fix)
- **Maestro Tests:** `.maestro/` directory

---

**Quick Summary:**
- ✅ 60+ tests are safe to run
- ❌ 4 tests hang (skip them)
- ⚠️ 2 tests are slow (increase timeout)
- Use Maestro for integration tests
