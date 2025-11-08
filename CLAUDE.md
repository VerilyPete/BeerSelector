# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BeerSelector is a React Native mobile app built with Expo SDK 52 for beer enthusiasts to browse taplists, track tastings, and manage their Flying Saucer UFO Club experience. The app supports both authenticated UFO Club members and visitor mode with limited access.

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

## Architecture

### Database Layer (expo-sqlite 15.1.4)

The app uses SQLite for offline-first data storage with the following key patterns:

- **Connection Management**: Single database instance (`beers.db`) managed through `src/database/db.ts`
- **Transaction API**: ALWAYS use `withTransactionAsync()` instead of the old `transaction()` method (expo-sqlite 15.1+ requirement)
- **Concurrency Locks**: Database operations use locks (`dbOperationInProgress`) to prevent concurrent modifications
- **Initialization Flow**: Database setup happens in `app/_layout.tsx` with retry logic before app renders

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
- `src/services/__tests__/` - Service function tests (unit + integration)

**Integration Tests**: Use real JSON data from `allbeers.json` and `mybeers.json` in project root to test against actual API response structures.

**Mock Strategy**:
- Expo modules mocked in `__mocks__/` directory
- SQLite operations mocked in database tests
- API calls mocked with jest.fn()

**Important**: Component integration tests were removed due to React Native testing environment issues. Focus on service-level integration tests instead.

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

- `app/_layout.tsx` - App initialization, database setup, auto-refresh
- `src/database/db.ts` - All database operations (200+ lines)
- `src/services/dataUpdateService.ts` - Data fetching and refresh logic
- `src/api/authService.ts` - Authentication flow
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
