# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BeerSelector is a React Native mobile app built with Expo SDK 54 for beer enthusiasts to browse taplists, track tastings, and manage their Flying Saucer UFO Club experience. The app supports both authenticated UFO Club members and visitor mode with limited access.

**Minimum Requirements**: iOS 17.6 or greater.

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

### Flying Saucer Store Locations

The Flying Saucer taplist API uses store IDs (`sid`) to fetch location-specific beer lists:

```
https://fsbs.beerknurd.com/bk-store-json.php?sid={store_id}
```

**Store ID Reference:**
| Store ID | Location |
|----------|----------|
| 13885 | Little Rock |
| 13888 | Charlotte |
| 13877 | Raleigh |
| 13883 | Cordova |
| 13881 | Memphis |
| 18686214 | Cypress Waters |
| 13891 | Fort Worth |
| 13884 | The Lake |
| 18262641 | DFW Airport |
| 13880 | Houston |
| 13882 | San Antonio |
| 13879 | Sugar Land |

**Data Model Notes:**

- Beer `id` is global across all locations (e.g., "7239443" is the same beer everywhere)
- Most beer fields are global: `brew_name`, `brewer`, `brew_style`, `brew_description`
- `added_date` is location-specific (when that location added the beer to their taplist)
- Enrichment data (ABV from external sources) is global and keyed by beer `id`

## Related Documentation

- **UI.md** - Container types, icons, theming, dark mode patterns. Refer when working on UI components or styling.
- **TESTING.md** - Jest vs Maestro patterns, hanging test prevention. Refer when writing or debugging tests.
- **[.claude/key-files.md](.claude/key-files.md)** - Quick reference for important files in the codebase.
- **[.claude/ios-build.md](.claude/ios-build.md)** - iOS build approach and Live Activities documentation.

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

### Environment Configuration

The app supports environment variables for dynamic configuration without code changes. See `.env.example` for available variables.

```bash
# Quick setup
cp .env.example .env.development
# Edit .env.development with your settings
npm start
```

**Available environments**: development, staging, production
**Key variables**: API URLs, network timeouts, external service URLs

See also:

- `.env.example` - Template with all available variables and documentation
- `src/config/` - Configuration module

## Architecture

### Database Layer (expo-sqlite 16.0.x)

The app uses SQLite for offline-first data storage with a **repository pattern**:

- **Connection Management**: Single database instance (`beers.db`) managed through `src/database/connection.ts`
- **Transaction API**: ALWAYS use `withTransactionAsync()` instead of the old `transaction()` method (expo-sqlite 15.1+ requirement)
- **Repository Pattern**: All database operations go through repositories (BeerRepository, MyBeersRepository, RewardsRepository)
- **Concurrency Locks**: Database operations use `DatabaseLockManager` to prevent concurrent modifications
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

**Main Tables**:

- `allbeers` - Complete beer catalog from Flying Saucer API
  - Includes `container_type` (pint/tulip/can/bottle/flight) and `abv` columns
- `tasted_brew_current_round` - User's tasted beers for current plate
- `rewards` - UFO Club rewards and achievements
- `preferences` - App configuration (API URLs, user settings)
- `operation_queue` - Queued operations for offline retry

**Current Schema Version**: v6

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

See `.env.example` for complete configuration options.

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

- Triggers on app open via `initializeBeerDatabase()` from `src/database/db.ts`
- Fetches all beers (blocking), then schedules my beers and rewards in background
- Timestamp-based: only refreshes if >12 hours since last refresh

**Refresh Logic** (`src/services/dataUpdateService.ts`):

```typescript
// Check last refresh timestamp (12-hour default window)
const lastCheck = await getPreference('all_beers_last_check');
if (lastCheck && Date.now() - parseInt(lastCheck) < 12 * 60 * 60 * 1000) {
  return; // Skip refresh
}
```

**Preference Keys**:

- `all_beers_last_check` / `my_beers_last_check` - Last check timestamp
- `all_beers_last_update` / `my_beers_last_update` - Last successful update timestamp

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

See **UI.md** for detailed UI documentation including:

- Container type system (pint/tulip/can/bottle/flight icons)
- Custom BeerIcon font usage
- Theming and dark mode patterns
- UntappdWebView Safari cookie requirements

**Key Components**:

- `components/AllBeers.tsx` - Beer list with search/filter
- `components/Beerfinder.tsx` - Advanced search for untasted beers
- `components/TastedBrewList.tsx` - Tasted beers with empty state handling
- `components/icons/ContainerIcon.tsx` - Beer container icons based on type

### Testing

See **TESTING.md** for detailed testing documentation including:

- Safe vs unsafe Jest patterns (critical for avoiding hanging tests)
- Jest vs Maestro decision guide
- Prevention checklist before writing tests

**Key Rules**:

- **Jest**: Unit tests only (pure functions, database ops, API services)
- **Maestro**: ALL integration and E2E tests
- **Never** use `renderHook()` with React Native hooks - will hang
- **Never** test components using `useThemeColor`/`useColorScheme` in Jest - will hang

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

### Expo SQLite 16.0.x Requirements

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

- 12-hour refresh window to avoid excessive API calls
- Timestamp stored in preferences: `all_beers_last_check`, `my_beers_last_check`
- Clear old data before writing new data

## Key Files Reference

See **[.claude/key-files.md](.claude/key-files.md)** for the complete file reference.

**Most Important Files:**
- `src/database/repositories/` - All database operations (BeerRepository, MyBeersRepository, RewardsRepository)
- `app/_layout.tsx` - App initialization and auto-refresh
- `src/services/dataUpdateService.ts` - Data fetching and sync
- `src/api/authService.ts` - Authentication (member/visitor modes)
- `modules/live-activity/` - iOS Live Activity module

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
- Android: Package name `org.verily.FSBeerselector`
- New Architecture enabled in `app.json`
- Current iOS build number tracked in Xcode project

### iOS Build Approach

See **[.claude/ios-build.md](.claude/ios-build.md)** for detailed iOS build and Live Activities documentation.

**Key Points:**
- **Local Xcode builds** (not EAS) - open `ios/BeerSelector.xcworkspace`
- Bundle ID: `org.verily.FSbeerselector`
- CocoaPods for native dependencies (`cd ios && pod install`)
- Live Activities via `modules/live-activity/` (Expo Modules API, pure Swift)
- Widget Extension: `ios/BeerQueueWidget/`
- App Group: `group.org.verily.FSbeerselector.beerqueue`

## Development Guidelines

- Use functional components with hooks
- Use TypeScript for type safety
- Use expo-sqlite 16.0.x API (not older versions)
- Implement proper offline support
- Ensure dark mode compatibility for all UI elements
