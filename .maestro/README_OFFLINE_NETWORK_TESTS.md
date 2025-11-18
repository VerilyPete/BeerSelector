# Offline & Network Error Tests - Quick Reference Guide

This guide provides quick instructions for running the offline and network error tests (Tests 12-14).

---

## Test Files Overview

### Test 12: Offline Scenarios (`12-offline-scenarios.yaml`)
**Purpose**: Verify offline-first architecture and local data access without network connectivity

**Key Tests**:
- App launches and loads local data while offline
- Search and filter work on cached data
- Beer item expansion from SQLite database
- Pull-to-refresh error handling when offline
- Navigation between tabs without network
- Settings accessible offline

**Manual Setup Required**: Enable airplane mode before running

---

### Test 13: Network Timeout Recovery (`13-network-timeout-recovery.yaml`)
**Purpose**: Verify network timeout handling, error recovery, and graceful degradation

**Key Tests**:
- Successful refresh baseline
- Loading indicators during refresh
- Rapid refresh throttling
- Local data fallback on network errors
- Manual refresh timeout handling (up to 45s)
- Post-error state recovery

**Manual Setup Required**: Optional - network throttling for slow network testing

---

### Test 14: API Error Handling (`14-api-error-handling.yaml`)
**Purpose**: Verify API error handling, data validation, and session management

**Key Tests**:
- Valid configuration baseline
- Empty state handling (zero beers)
- Search and filter on empty data
- Visitor mode error handling
- Session validation
- Error recovery after bad refresh
- App restart after errors

**Manual Setup Required**: Optional - invalid URLs for error testing

---

## Running the Tests

### Quick Start (All Tests)

Run all offline and network tests:
```bash
# From project root
cd /workspace/BeerSelector

# Run individual tests
maestro test .maestro/12-offline-scenarios.yaml
maestro test .maestro/13-network-timeout-recovery.yaml
maestro test .maestro/14-api-error-handling.yaml

# Or run full suite (includes all 14 tests)
maestro test .maestro/config.yaml
```

---

## Test 12: Offline Scenarios

### Prerequisites
1. Run app online first to populate database with beer data
2. Enable airplane mode on device/simulator
3. Keep app in background (don't force quit)

### Running the Test

**iOS Simulator**:
```bash
# 1. Enable airplane mode in simulator
# Hardware → Network → Enable Airplane Mode (or use Control Center)

# 2. Run offline test
maestro test .maestro/12-offline-scenarios.yaml

# 3. Expected results:
# ✅ App launches without network
# ✅ Beer list loads from SQLite database
# ✅ Search and filter work on cached data
# ✅ Pull-to-refresh shows error (but data remains visible)
# ✅ All tabs accessible offline

# 4. Disable airplane mode after test
# Hardware → Network → Disable Airplane Mode
```

**Android Emulator**:
```bash
# 1. Enable airplane mode in emulator
# Settings → Network & Internet → Airplane Mode → ON
# Or swipe down and tap airplane mode in quick settings

# 2. Run offline test
maestro test .maestro/12-offline-scenarios.yaml

# 3. Expected results: Same as iOS

# 4. Disable airplane mode after test
```

### What to Observe
- App should work normally without network
- Beer list displays data from local database
- Search filters results locally (no API calls)
- Pull-to-refresh triggers error alert but doesn't crash
- Data remains visible throughout offline session

### Common Issues
- **Test fails immediately**: Ensure airplane mode is enabled BEFORE running test
- **No data visible**: Run app online first to populate database
- **App crashes on refresh**: Bug - app should handle offline gracefully (file issue)

---

## Test 13: Network Timeout Recovery

### Prerequisites
- Normal network connection (test handles timeouts automatically)
- OR throttled network for realistic timeout testing (optional)

### Running the Test

**Normal Network** (Recommended for first run):
```bash
# No setup needed - run directly
maestro test .maestro/13-network-timeout-recovery.yaml

# Expected results:
# ✅ Refreshes complete successfully (or timeout gracefully)
# ✅ Loading indicators appear during refresh
# ✅ Rapid refreshes are throttled (prevents duplicates)
# ✅ Local data fallback works on errors
# ✅ App recovers after errors
```

**Throttled Network** (For realistic timeout testing):
```bash
# iOS Simulator:
# 1. Enable network throttling
# Settings → Developer → Network Link Conditioner → Enable
# Settings → Developer → Network Link Conditioner → 3G/Edge/etc.

# Android Emulator:
# 1. Use emulator network throttling
# Extended Controls (... button) → Cellular → Network Type → 3G/Edge

# 2. Run test with slow network
maestro test .maestro/13-network-timeout-recovery.yaml

# 3. Observe:
# - Longer loading times (>5s)
# - Potential timeouts after 15s
# - Error alerts on timeout
# - Local data still visible

# 4. Disable throttling after test
```

### What to Observe
- Pull-to-refresh should show spinner during network request
- If timeout occurs (15s), error alert should appear
- Local data remains visible even if refresh fails
- App should not crash or hang on timeout
- Manual refresh from Settings can take up to 45s (3 endpoints × 15s)

### Common Issues
- **No timeouts observed**: Network is fast - use throttling to test timeout behavior
- **App hangs on timeout**: Bug - should show error and recover (file issue)
- **Data disappears on error**: Bug - offline-first should keep local data visible (file issue)

---

## Test 14: API Error Handling

### Prerequisites
- App configured with valid API URLs (normal state)
- OR invalid URLs for error testing (optional)

### Running the Test

**Normal Configuration** (Default):
```bash
# No setup needed - run directly
maestro test .maestro/14-api-error-handling.yaml

# Expected results:
# ✅ Settings shows API URL configuration
# ✅ Manual refresh works correctly
# ✅ Empty states handled gracefully
# ✅ Search and filter work on empty data
# ✅ App recovers from errors
# ✅ App restarts cleanly after errors
```

**Invalid URLs** (For error testing):
```bash
# Manual setup:
# 1. Open app and navigate to Settings
# 2. Edit "All Beers API URL" to invalid value (e.g., "http://invalid-url")
# 3. Save settings

# 2. Run test
maestro test .maestro/14-api-error-handling.yaml

# 3. Observe:
# - Refresh fails with network error
# - Error alert shows user-friendly message
# - Local data remains visible
# - Retry works after fixing URL

# 4. Restore valid URLs after test
```

### What to Observe
- Empty state messages should be user-friendly
- Search on empty data should show "No beers found"
- Invalid URLs should trigger validation errors
- Session validation should prevent unauthorized access
- App should restart cleanly after any errors

### Common Issues
- **No errors observed**: URLs are valid - manually set invalid URLs to test error handling
- **App crashes on invalid URL**: Bug - should show error gracefully (file issue)
- **Empty state not shown**: Bug - should display friendly message when zero beers (file issue)

---

## Manual Test Scenarios

The following scenarios require manual setup and cannot be fully automated with Maestro:

### 1. Slow Network Testing (Test 13)
**Setup**:
1. Enable network throttling (3G/Edge)
2. Run test and observe longer loading times
3. Verify timeout occurs after 15 seconds
4. Verify error message shown
5. Disable throttling

### 2. Partial Network Failure (Test 13)
**Setup**:
1. Use proxy/firewall to block specific API endpoints
2. Block `my_beers_api_url` but allow `all_beers_api_url`
3. Run refresh
4. Verify partial error alert shows specific messages
5. Verify successful endpoint still updates database

### 3. Server Error Responses (Test 14)
**Setup**:
1. Configure mock server to return 500 error
2. Update API URLs to point to mock server
3. Run refresh
4. Verify SERVER_ERROR handling
5. Verify user-friendly error message
6. Restore real API URLs

### 4. Session Expiration (Test 14)
**Setup**:
1. Use app normally for 24+ hours
2. Wait for server session to expire
3. Attempt refresh
4. Verify auto-login attempt
5. Verify data refresh after re-authentication

### 5. Empty API Response (Test 14)
**Setup**:
1. Configure mock server to return empty `brewInStock` array
2. Update API URLs to point to mock server
3. Run refresh
4. Verify database cleared
5. Verify empty state shown in UI
6. Verify no crashes
7. Restore real API URLs

### 6. Invalid JSON Response (Test 14)
**Setup**:
1. Configure mock server to return malformed JSON
2. Update API URLs to point to mock server
3. Run refresh
4. Verify PARSE_ERROR handling
5. Verify error message: "There was a problem processing the server response"
6. Verify local data unchanged
7. Restore real API URLs

---

## Expected Error Messages

### From useDataRefresh.ts:
- **"API URLs Not Configured"** - When URLs not set
- **"Server Connection Error"** - When all endpoints fail with network errors
- **"Data Refresh Error"** - When partial failures occur with specific messages
- **"Failed to refresh beer data"** - Generic error fallback

### From dataUpdateService.ts:
- **"All beers API URL not set. Please log in to configure API URLs."**
- **"Network connection error: request timed out while fetching beer data."**
- **"Server error: [status text]"**
- **"Failed to parse server response"**
- **"Invalid data format received from server: [errors]"**
- **"No valid beer data received from server"**

### From notificationUtils.ts:
- **NETWORK_ERROR**: "Unable to connect to the server. Please check your internet connection and try again."
- **TIMEOUT_ERROR**: "The server is taking too long to respond. Please try again later."
- **SERVER_ERROR**: "The server encountered an error. Please try again later."
- **PARSE_ERROR**: "There was a problem processing the server response. Please try again."
- **VALIDATION_ERROR**: Custom message based on validation failure
- **INFO**: "My beers not available in visitor mode."

---

## Troubleshooting

### Test 12 Issues

**Problem**: Test fails because data not available offline
**Solution**: Run app online first to populate database, then enable airplane mode

**Problem**: App crashes on pull-to-refresh while offline
**Solution**: This is a bug - app should handle offline gracefully (file issue)

**Problem**: Search doesn't work offline
**Solution**: This is a bug - search should filter local data without network (file issue)

### Test 13 Issues

**Problem**: No timeouts observed even on slow network
**Solution**: Timeouts only trigger after 15s - ensure network is very slow or use proxy to drop packets

**Problem**: App hangs during timeout
**Solution**: This is a bug - app should show error after 15s (file issue)

**Problem**: Data disappears after network error
**Solution**: This is a bug - offline-first should keep local data visible (file issue)

### Test 14 Issues

**Problem**: No errors observed with invalid URLs
**Solution**: Ensure URLs are truly invalid (not just slow) - use "http://invalid-url-that-does-not-exist"

**Problem**: Empty state not shown when database empty
**Solution**: This is a bug - should show "No beers found" message (file issue)

**Problem**: App crashes on malformed API response
**Solution**: This is a bug - should show PARSE_ERROR gracefully (file issue)

---

## CI/CD Integration

### Running in CI

```yaml
# Example GitHub Actions workflow
- name: Run Offline Tests
  run: |
    # Note: Airplane mode must be enabled manually in CI environment
    # These tests may need to be excluded from automated CI
    maestro test .maestro/13-network-timeout-recovery.yaml
    maestro test .maestro/14-api-error-handling.yaml

- name: Run Manual Network Tests
  run: |
    # These require manual setup and should be run locally
    # Document results in PR comments
    echo "Manual tests required for offline scenarios"
```

### Recommended CI Strategy

**Automated in CI**:
- Test 13: Network timeout recovery (with normal network)
- Test 14: API error handling (with valid configuration)

**Manual Testing** (before release):
- Test 12: Offline scenarios (requires airplane mode)
- Test 13: Slow network scenarios (requires throttling)
- Test 14: Invalid URL scenarios (requires manual URL modification)

---

## Test Results Interpretation

### Successful Test Run

All assertions pass, app remains stable:
```
✓ 12-offline-scenarios.yaml
✓ 13-network-timeout-recovery.yaml
✓ 14-api-error-handling.yaml
```

### Partial Failure

Some assertions fail, investigate specific failures:
```
✗ 12-offline-scenarios.yaml
  ✗ Step 20: assertVisible "beer-list" - Not found
```

**Interpretation**: Data not available offline (bug) or airplane mode not enabled (setup issue)

### Complete Failure

Test cannot complete, likely setup issue:
```
✗ 12-offline-scenarios.yaml
  ✗ Step 1: launchApp - Failed to launch
```

**Interpretation**: Check airplane mode is enabled, app has data from previous online session

---

## Next Steps

After running these tests:

1. **Document Results**: Note any failures or unexpected behavior
2. **File Issues**: Create GitHub issues for bugs discovered
3. **Add testIDs**: Implement missing testIDs for better error testing
4. **Enhance Error Handling**: Improve error messages based on test feedback
5. **Automate Manual Tests**: Set up mock servers for automated error scenario testing

---

## Support

For questions or issues:
- Review test file comments for detailed explanations
- Check `MP-5_STEP_3_OFFLINE_NETWORK_TESTS_SUMMARY.md` for comprehensive documentation
- File issues on GitHub with test results and logs
- Review existing tests (01-11) for patterns and examples

---

## Test File Locations

```
.maestro/
├── 12-offline-scenarios.yaml          # 325 lines
├── 13-network-timeout-recovery.yaml   # 442 lines
├── 14-api-error-handling.yaml         # 506 lines
├── config.yaml                        # Includes all 14 tests
└── README_OFFLINE_NETWORK_TESTS.md    # This file
```

**Total Offline/Network Test Coverage**: 1,273 lines of comprehensive test scenarios
