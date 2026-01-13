# Key Files Reference

Quick reference for important files in the BeerSelector codebase.

## Data Access Layer (Primary)

### Repositories
Use these directly for all database operations:

| File | Purpose |
|------|---------|
| `src/database/repositories/BeerRepository.ts` | All beers CRUD with lock management |
| `src/database/repositories/MyBeersRepository.ts` | Tasted beers (Beerfinder) with lock management |
| `src/database/repositories/RewardsRepository.ts` | UFO Club rewards with lock management |
| `src/database/repositories/OperationQueueRepository.ts` | Queued operations for offline retry |

### Database Core
| File | Purpose |
|------|---------|
| `src/database/db.ts` | Database initialization orchestration |
| `src/database/connection.ts` | SQLite connection management |
| `src/database/preferences.ts` | App preferences (key-value store) |
| `src/database/types.ts` | Type definitions and type guards |
| `src/database/schema.ts` | Table creation and migrations |

## Core Application Files

| File | Purpose |
|------|---------|
| `app/_layout.tsx` | Root layout, initialization, auto-refresh |
| `app/(tabs)/index.tsx` | All Beers tab |
| `app/(tabs)/beerlist.tsx` | Beerfinder tab |
| `app/(tabs)/tastedbrews.tsx` | Tasted Brews tab |
| `app/settings.tsx` | Settings screen with login/logout |
| `app/screens/rewards.tsx` | Rewards detail screen |

## Services

| File | Purpose |
|------|---------|
| `src/services/dataUpdateService.ts` | Data fetching and refresh coordination |
| `src/api/authService.ts` | Authentication (member and visitor modes) |
| `src/api/apiClient.ts` | HTTP client with cookie management |
| `src/api/sessionManager.ts` | Cookie persistence with SecureStore |
| `src/api/sessionValidator.ts` | Session validation logic |

## Configuration

| File | Purpose |
|------|---------|
| `src/config/config.ts` | Centralized configuration (URLs, endpoints) |
| `src/config/index.ts` | Config module exports |
| `.env.example` | Environment variable template |
| `app.json` | Expo app configuration |

## Components

| File | Purpose |
|------|---------|
| `components/AllBeers.tsx` | Beer list with search/filter |
| `components/Beerfinder.tsx` | Advanced search for untasted beers |
| `components/TastedBrewList.tsx` | Tasted beers with empty state |
| `components/icons/ContainerIcon.tsx` | Beer container type icons |
| `components/ThemedText.tsx` | Theme-aware text component |
| `components/ThemedView.tsx` | Theme-aware view component |

## Expo Local Modules

### Live Activity Module (`modules/live-activity/`)

| File | Purpose |
|------|---------|
| `ios/LiveActivityModule.swift` | Pure Swift implementation |
| `ios/LiveActivity.podspec` | CocoaPods config (`DEFINES_MODULE = YES`) |
| `src/index.ts` | TypeScript interface and types |
| `expo-module.config.json` | Module configuration for autolinking |

### Widget Extension (`ios/BeerQueueWidget/`)

| File | Purpose |
|------|---------|
| `BeerQueueWidget.swift` | Widget entry point |
| `BeerQueueWidgetLiveActivity.swift` | Live Activity UI (SwiftUI) |
| `BeerQueueWidgetBundle.swift` | Widget bundle configuration |

## Tests

| Directory | Purpose |
|-----------|---------|
| `src/services/__tests__/` | Service unit tests |
| `src/database/__tests__/` | Database operation tests |
| `maestro/` | E2E tests (Maestro flows) |

## iOS Native

| File | Purpose |
|------|---------|
| `ios/BeerSelector.xcworkspace` | Xcode workspace (use this, not .xcodeproj) |
| `ios/Podfile` | CocoaPods dependencies |
| `ios/BeerSelector/Info.plist` | App configuration |
| `ios/BeerSelector/BeerSelector.entitlements` | App entitlements (App Groups) |
