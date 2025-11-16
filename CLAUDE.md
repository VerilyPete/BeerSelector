# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BeerSelector is a React Native mobile app built with Expo SDK 52 for beer enthusiasts to browse taplists, track tastings, and manage their Flying Saucer UFO Club experience. The app supports both authenticated UFO Club members and visitor mode with limited access.

### UFO Club Business Logic

**The 200 Beer Challenge:**
- Users work toward drinking 200 unique beers at Flying Saucer locations
- **All Beers**: Complete taplist at current location
- **Tasted Beers**: Beers user has already checked in (stored in `tasted_brew_current_round` table)
- **Beerfinder**: Beers available to check-in = All Beers that are NOT in Tasted Beers
- When users reach 200 tasted beers, the tasted list resets to 0 and they start a new round
- Users can only check-in beers that aren't already on their tasted brew list

**Key Rule**: Beerfinder count = All Beers - Tasted Beers (set difference, not simple subtraction)

### Visitor Mode vs Member Mode

**Visitor Mode (Guest Login):**
- Limited access for users without UFO Club membership
- **Can access**: All Beers list only (view taplist at current location)
- **Cannot access**: Tasted Brews tab, Beerfinder tab, Rewards
- No tasted brews to sync from database
- No check-in functionality
- No personal data or tracking

**Member Mode (UFO Club Login):**
- Full access to all features
- Can view All Beers, Tasted Brews, Beerfinder, and Rewards
- Can check-in beers and track progress toward 200
- Personal data syncs from Flying Saucer API

**Implementation**: Check `is_visitor_mode` preference to conditionally show/hide tabs and features

## Common Commands

### Development
```bash
npm start                 # Start Expo development server
npm run ios              # Run on iOS simulator
npm run android          # Run on Android emulator
npm run web              # Run web version
```

### Testing
```bash
npm test                 # Run tests in watch mode
npm run test:ci          # Run tests with coverage report (CI mode)

# Run specific test suites
npx jest src/services/__tests__/dataUpdateService.test.ts
npx jest src/services/__tests__/dataUpdateService.integration.test.ts --coverage
npx jest src/services/__tests__/dataUpdateService --coverage --collectCoverageFrom=src/services/dataUpdateService.ts
```

### Utilities
```bash
npm run reset-project    # Reset project state
npm run lint             # Run ESLint
```

### iOS Build Number Management
```bash
# Increment build number in Xcode project
./scripts/increment-build.sh
```

### Environment Configuration

The app supports environment variables for dynamic configuration without code changes. See `docs/ENVIRONMENT_VARIABLES.md` for complete documentation.

```bash
# Quick setup
cp .env.example .env.development
# Edit .env.development with your settings
npm start
```

**Available environments**: development, staging, production
**Key variables**: API URLs, network timeouts, external service URLs

See also:
- `docs/ENVIRONMENT_VARIABLES.md` - Complete environment variable guide
- `.env.example` - Template with all available variables
- `src/config/` - Configuration module

## Architecture

### Database Layer (expo-sqlite 15.1.4)

The app uses SQLite for offline-first data storage with a **repository pattern**:

- **Connection Management**: Single database instance (`beers.db`) managed through `src/database/connection.ts`
- **Transaction API**: ALWAYS use `withTransactionAsync()` instead of the old `transaction()` method (expo-sqlite 15.1+ requirement)
- **Repository Pattern**: All database operations go through repositories (BeerRepository, MyBeersRepository, RewardsRepository)
- **Concurrency Locks**: Database operations use locks (`dbOperationInProgress`) to prevent concurrent modifications
- **Initialization Flow**: Database setup happens in `app/_layout.tsx` with retry logic before app renders

**IMPORTANT - Repository Pattern (HP-7 COMPLETED)**:
- ❌ **DO NOT import from `src/database/db.ts`** - This file is deprecated
- ✅ **USE repositories directly**:
  ```typescript
  import { beerRepository } from '@/src/database/repositories/BeerRepository';
  import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
  import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';
  ```
- ✅ **USE preferences module for settings**:
  ```typescript
  import { getPreference, setPreference, areApiUrlsConfigured } from '@/src/database/preferences';
  ```
- See `MIGRATION_GUIDE_REPOSITORIES.md` for complete migration examples

**Main Tables**:
- `allbeers` - Complete beer catalog from Flying Saucer API
- `tasted_brew_current_round` - User's tasted beers for current plate
- `rewards` - UFO Club rewards and achievements
- `preferences` - App configuration (API URLs, user settings)
- `untappd_cookies` - Untappd authentication tokens

**Critical Database Patterns**:
```typescript
// Always use withTransactionAsync for transactions
await database.withTransactionAsync(async () => {
  // Multiple operations here
});

// Use type guards for data validation
import { isBeer, isPreference } from './database/types';
```

### Configuration Module

The app uses a centralized configuration system in `src/config/config.ts` that provides a single source of truth for all API endpoints, URLs, and app settings.

**Key Features**:
- Environment-based configuration (development, staging, production)
- Support for environment variables via `.env` files
- Dynamic URL construction for all API endpoints
- Type-safe endpoint and referer management

**Usage Patterns**:
```typescript
import { config } from '@/src/config';

// Get full URL for an endpoint
const url = config.api.getFullUrl('memberQueues');
// Returns: https://tapthatapp.beerknurd.com/memberQueues.php

// Access endpoint paths
const endpoint = config.api.endpoints.addToQueue;
// Returns: /addToQueue.php

// Access referer URLs
const referer = config.api.referers.memberDashboard;
// Returns: https://tapthatapp.beerknurd.com/member-dash.php

// Get base URL
const baseUrl = config.api.baseUrl;

// Network configuration
const timeout = config.network.timeout;
const retries = config.network.retries;

// External services
const untappdUrl = config.external.untappd.loginUrl;
```

**Available Endpoints**:
- `memberQueues` - User's queued beers
- `deleteQueuedBrew` - Delete a queued beer
- `addToQueue` - Add beer to queue (check-in)
- `addToRewardQueue` - Add reward beer to queue
- `memberDashboard` - Member dashboard page
- `memberRewards` - Rewards listing page
- `kiosk` - Login/kiosk page
- `visitor` - Visitor mode page

**Available Referers**:
- `memberDashboard` - For API requests from member dashboard
- `memberRewards` - For API requests from rewards page
- `memberQueues` - For API requests from queues page

**IMPORTANT**:
- ❌ **DO NOT hardcode URLs** - Always use the config module
- ✅ **USE config.api.getFullUrl()** for constructing full URLs
- ✅ **USE config.api.endpoints** for endpoint paths
- ✅ **USE config.api.referers** for HTTP referer headers

**Environment Configuration**:
Set environment variables in `.env.development`, `.env.staging`, or `.env.production`:
```bash
EXPO_PUBLIC_API_BASE_URL=https://your-api-server.com
EXPO_PUBLIC_API_TIMEOUT=15000
EXPO_PUBLIC_API_RETRIES=3
```

See `docs/ENVIRONMENT_VARIABLES.md` for complete configuration options.

### API & Authentication Layer

**Authentication Flow**:
1. User logs in via WebView → gets session cookies
2. Cookies stored in `apiClientInstance.ts` and SecureStore
3. Auto-login attempted on app startup via `authService.autoLogin()`
4. Two modes: UFO Club member (full access) vs Visitor (read-only taplist)

**API Client Pattern**:
- Centralized HTTP client in `src/api/apiClient.ts` with cookie management
- Session validation through `sessionValidator.ts`
- Flying Saucer API returns nested response format: `[{}, { brewInStock: [...beers] }]`

**Key Services**:
- `src/api/authService.ts` - Login, auto-login, visitor mode
- `src/api/sessionManager.ts` - Cookie persistence with SecureStore
- `src/services/dataUpdateService.ts` - Fetch and sync beer data

### Data Refresh Strategy

**Automatic Refresh** (in `app/_layout.tsx`):
- Triggers on every app open if API URLs configured
- Refreshes all beers and rewards in parallel
- Uses `manualRefreshAllData()` from `dataUpdateService.ts`
- Timestamp-based: only refreshes if >2 hours since last refresh (see `REFRESH_PLAN.md`)

**Refresh Logic** (`src/services/dataUpdateService.ts`):
```typescript
// Check last refresh timestamp (2-hour window)
const lastRefresh = await getPreference('last_all_beers_refresh');
if (lastRefresh && Date.now() - parseInt(lastRefresh) < 2 * 60 * 60 * 1000) {
  return; // Skip refresh
}
```

**Important**: The refresh logic was recently unified (see git history). Always clear old timestamp data when writing new data to prevent stale data accumulation.

### Navigation Structure (Expo Router)

File-based routing with tabs:
- `app/(tabs)/` - Tab navigation screens
  - `index.tsx` - All Beers list
  - `beerlist.tsx` - Beerfinder (filtered search)
  - `tastedbrews.tsx` - Tasted beers history
  - `mybeers.tsx` - (deprecated/unused)
- `app/settings.tsx` - Settings screen
- `app/screens/rewards.tsx` - Rewards detail screen
- `app/_layout.tsx` - Root layout with initialization logic

**First Launch Flow**: If API URLs not set or `first_launch` preference is true, app redirects to settings screen.

### Component Architecture

**Key Components**:
- `components/AllBeers.tsx` - Beer list with search/filter
- `components/Beerfinder.tsx` - Advanced search for untasted beers
- `components/TastedBrewList.tsx` - Tasted beers with empty state handling
- `components/Rewards.tsx` - Rewards display
- `components/UntappdWebView.tsx` - Untappd integration (alpha)

**Theming**: App supports dark/light mode via `useColorScheme()` hook. When adding UI elements, ensure they don't render white-on-white or black-on-black in dark mode.

**Component Patterns**:
- Functional components with hooks
- `ThemedText` and `ThemedView` for consistent styling
- Haptic feedback on interactions via `expo-haptics`

### Testing Architecture

**Test Organization**:
- `__tests__/` - Component snapshot tests
- `src/api/__tests__/` - API service tests
- `src/database/__tests__/` - Database operation tests
- `src/services/__tests__/` - Service function tests (unit tests only)
- `context/__tests__/` - Context and state management tests

**Testing Strategy**:
- ✅ **Jest**: Use for unit tests only (functions, utilities, pure logic)
- ✅ **Maestro/Flashlight**: Use for ALL integration and E2E tests
- ❌ **DO NOT use Jest for integration tests** - React Native testing environment causes timeouts
- ❌ **DO NOT write unit tests for React Native hooks** - Hooks that use React Native context (useColorScheme, useThemeColor, etc.) cause timeouts in Jest. Test these hooks indirectly through component tests or Maestro E2E tests.

**Why Maestro for Integration Tests**:
- Jest integration tests consistently timeout in React Native environment
- Maestro provides reliable cross-platform E2E testing
- Flashlight offers performance profiling capabilities
- Better suited for testing actual app flows and user interactions

**Mock Strategy**:
- Expo modules mocked in `__mocks__/` directory
- SQLite operations mocked in database tests (unit tests)
- API calls mocked with jest.fn() (unit tests)
- Real data from `allbeers.json` and `mybeers.json` for service-level tests

**Important Notes**:
- Component integration tests were removed due to React Native testing environment issues
- Focus on unit tests in Jest, comprehensive integration tests in Maestro
- Plan to implement Maestro test suite as part of MP-5 (Missing Integration Tests)

**What to Test Where**:
```typescript
// ✅ Jest Unit Tests - Pure logic hooks
export function useBeerFilters() {
  // Pure logic, no RN dependencies - safe to test with Jest
}

// ❌ DO NOT unit test - React Native hooks
export function useUntappdColor() {
  // Uses useColorScheme(), useThemeColor() - will timeout
  // Instead: Test through component tests or Maestro
}

// ✅ Jest Component Tests - Test RN hooks indirectly
it('should use pink color in dark mode', () => {
  render(<MyComponent />); // Tests useUntappdColor() indirectly
});

// ✅ Maestro E2E - Integration testing
# Test that verifies theme switching works end-to-end
```

### Type System

**Type Guards** (in `src/database/types.ts` and `src/types/`):
```typescript
// Always validate data with type guards
if (isBeer(data)) {
  // Safe to use as Beer type
}
```

**Key Types**:
- `Beer` - Complete beer data structure
- `Beerfinder` - Beer with tasted status
- `Preference` - App preference key-value pair
- `Reward` - UFO Club reward data
- `SessionData` - User session info

## Important Conventions

### Expo SQLite 15.1.4 Requirements
- Use `withTransactionAsync()` for all transactions (not `transaction()`)
- Database initialization must complete before any operations
- Use `getAllAsync()`, `runAsync()`, `execAsync()` (async methods only)

### Data Validation
- Always use type guards before database operations
- Validate API responses before storing (check for required fields like `id`)
- Handle empty/missing data gracefully

### Error Handling
- API errors use `ApiErrorType` enum (NETWORK_ERROR, SERVER_ERROR, etc.)
- Network timeouts set to 15 seconds in data fetches
- Database operations wrapped in try-catch with logging

### Dark Mode Support
- Test all UI changes in both light and dark modes
- Use `ThemedText` and `ThemedView` components
- Avoid hardcoded colors

### Refresh Behavior
- 2-hour refresh window to avoid excessive API calls
- Timestamp stored in preferences: `last_all_beers_refresh`, `last_my_beers_refresh`
- Clear old data before writing new data (see `REFRESH_PLAN.md`)

## Key Files Reference

### Data Access Layer (Primary)
- `src/database/repositories/` - Data access via repository pattern (use these directly)
  - `BeerRepository.ts` - All beers CRUD operations with lock management
  - `MyBeersRepository.ts` - Tasted beers (Beerfinder) operations with lock management
  - `RewardsRepository.ts` - UFO Club rewards operations with lock management
- `src/database/db.ts` - Database initialization orchestration + Untappd cookie management (alpha feature)
- `src/database/preferences.ts` - App preferences management

### Core Application Files
- `app/_layout.tsx` - App initialization, database setup, auto-refresh
- `src/services/dataUpdateService.ts` - Data fetching and refresh logic with sequential coordination
- `src/api/authService.ts` - Authentication flow (member and visitor modes)
- `app/settings.tsx` - Settings UI with login/logout (400+ lines)
- `.cursor/rules/expo-rules.mdc` - Development guidelines

## API Response Format

Flying Saucer API returns nested arrays:
```json
[
  { "something": "else" },
  { "brewInStock": [ ...beers array... ] }
]
```

Extract beers from `brewInStock` property in second array element.

## Build Configuration

- iOS: Bundle identifier `org.verily.FSbeerselector`
- Android: Package name `com.yourcompany.beerselector`
- New Architecture enabled in `app.json`
- Current iOS build number tracked in Xcode project

## Cursor/Copilot Rules

From `.cursor/rules/expo-rules.mdc`:
- Use functional components with hooks
- Use TypeScript for type safety
- Use expo-sqlite 15.1.4 API (not older versions)
- Implement proper offline support
- Ensure dark mode compatibility for all UI elements
