# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Common Commands

- **Install dependencies**: `npm install`
- **Start development server (Expo)**: `npx expo start`
- **Run on iOS simulator**: `npm run ios`
- **Run on Android emulator**: `npm run android`
- **Run web version**: `npm run web`
- **Run tests (watch mode)**: `npm test`
- **Run a single test file**: `npm test -- <path/to/test>` or `jest <path/to/test>`
- **Run CI tests with coverage**: `npm run test:ci`
- **Lint code**: `npm run lint`
- **Reset project state**: `npm run reset-project`

## Project Structure

- **app/** — Expo Router directory
  - **(tabs)/** — Tab-based navigation screens
  - **screens/** — Additional screen components
  - **_layout.tsx** — Root layout and navigation setup
- **components/** — Reusable UI components (with `ui/` and `__tests__/` subfolders)
- **src/**
  - **api/** — Service modules for API calls and authentication
  - **database/** — SQLite schema and data access code
  - **services/** — Business logic implementations
  - **types/** — TypeScript type definitions
  - **utils/** — Standalone helper functions
- **assets/** — Static images, fonts, and other media
- **constants/** — Application-wide constants and configuration
- **__tests__/** — Integration and end-to-end tests

## Architecture Overview

BeerSelector is a React Native application built with Expo and TypeScript, leveraging Expo Router for file-based navigation. The app persists data locally in SQLite (via `expo-sqlite`), with secure credential storage through `expo-secure-store`. UI logic is separated into `components/` and screen definitions under `app/`. Business logic and data access live in `src/services` and `src/database`, keeping networking and persistence concerns decoupled from presentation.

Key points:
- **Navigation**: Defined by file structure in `app/`, using nested layouts and tabs.
- **Data Layer**: SQLite-backed tables for beers, tasting history, rewards, and preferences.
- **Auth**: UFO Club integration and Untappd OAuth handled in `src/api`.
- **Styling & Theming**: Light/dark mode based on system preferences, configured in root layout.

## Existing Documentation

- Core usage and setup instructions are detailed in `README.md`.
- For project-specific guidelines (e.g., code formatting, test conventions), refer to workspace or global Warp rules.
