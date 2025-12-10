# BeerSelector 🍺

A comprehensive React Native mobile app for beer enthusiasts to discover, track, and manage their beer tasting experiences. Built with Expo and designed for the Flying Saucer UFO Club.

![BeerSelector App](ufobeer.png)

## Features

### 🍻 Core Functionality

- **All Beers**: Browse through taplists at any of the Flying Saucer locations
- **Beerfinder**: Filtering to display only beers you haven't sampled on your current plate with search across all fields to find your perfect beer.
- **Tasted Brews**: Track beers you've already tried on your curret plate with tasting dates and ratings
- **Rewards System**: View and redeem your UFO Club rewards
- **Offline Support**: Access your latest synced data with built-in SQLite support

### 🔐 Authentication & User Management

- **UFO Club Integration**: Full integration with Flying Saucer UFO Club accounts
- **Visitor Mode**: Limited access mode for non-members to browse available taplists
- **Untappd Integration**: Connect your Untappd account for enhanced beer information and ratings (alpha quality)
- **Secure Session Management**: Persistent login with secure token storage

### 🎨 User Experience

- **Dark/Light Mode**: Automatic theme switching based on system preferences
- **Responsive Design**: Optimized for both iOS and Android devices
- **Haptic Feedback**: Enhanced user interaction with tactile responses
- **Modern UI**: Clean, intuitive interface with smooth animations
- **Search & Filtering**: Powerful search capabilities across all beer data

## Technology Stack

### Core Framework

- **[React Native](https://reactnative.dev/)** - Cross-platform mobile framework
- **[Expo](https://expo.dev/)** - React Native development platform with SDK 52
- **[Expo Router](https://docs.expo.dev/router/introduction/)** - File-based routing system
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety and better development experience

### Database & Storage

- **[Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)** - Local database storage (v15.1.4)
- **[Expo Secure Store](https://docs.expo.dev/versions/latest/sdk/securestore/)** - Secure credential storage
- **[Expo File System](https://docs.expo.dev/versions/latest/sdk/filesystem/)** - File management

### UI & Animation

- **[React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/)** - Smooth animations and gestures
- **[Expo Vector Icons](https://docs.expo.dev/versions/latest/sdk/vector-icons/)** - Icon library
- **[Expo Haptics](https://docs.expo.dev/versions/latest/sdk/haptics/)** - Haptic feedback
- **[React Native Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/)** - Touch handling

### Web Integration

- **[React Native WebView](https://github.com/react-native-webview/react-native-webview)** - Web content integration
- **[Expo Web Browser](https://docs.expo.dev/versions/latest/sdk/webbrowser/)** - External web browser integration

## Installation

Ping Pete for an invite to the Testflight beta group

### Prerequisites

- **Node.js** (LTS version 18+ recommended)
- **npm** or **yarn** package manager
- **Expo CLI** (`npm install -g @expo/cli`)
- **iOS Simulator** (for Mac users) or **Android Emulator**
- **Git** for version control

### Setup Instructions

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/BeerSelector.git
   cd BeerSelector
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Start the development server:**

   ```bash
   npx expo start
   ```

4. **Run on your preferred platform:**
   - **iOS Simulator**: Press `i` in the terminal or scan QR code with Expo Go
   - **Android Emulator**: Press `a` in the terminal
   - **Physical Device**: Scan the QR code with the Expo Go app

## Configuration

### API Setup

The app requires configuration of API endpoints for beer data:

1. **Navigate to Settings** in the app
2. **Login** with your UFO Club credentials or as a Visitor
3. **Configure API URLs** for beer data sources
4. **Optional**: Connect your Untappd account for enhanced features

### Database Structure

The app uses SQLite with the following main tables:

- `allbeers` - Complete beer database with brewery information
- `tasted_brew_current_round` - Your tasted beers with ratings and dates
- `rewards` - Achievement and reward tracking
- `preferences` - App configuration and user settings

## Usage

### Getting Started

1. **First Launch**: The app will guide you through initial setup
2. **Login**: Choose between UFO Club member or Visitor mode
3. **Data Sync**: Initial beer data will be downloaded automatically
4. **Start Exploring**: Use the tab navigation to access different features

### Main Features

#### All Beers Tab

- Browse the complete beer database
- Search by name, brewery, or style
- View detailed beer information
- Filter by various criteria

#### Beerfinder Tab (Members Only)

- Advanced search and filtering
- Find beers by style, ABV, availability
- Save favorite search criteria
- Get personalized recommendations

#### Tasted Brews Tab (Members Only)

- View your beer tasting history
- Add new tastings with ratings
- Track tasting dates and locations
- Export tasting data

#### Rewards Tab

- View your progress toward club rewards
- Track achievements and milestones
- See upcoming reward opportunities

### Settings

Access comprehensive app configuration:

- **Account Management**: Login/logout, switch between member/visitor modes
- **API Configuration**: Manage data source endpoints
- **Untappd Integration**: Connect/disconnect Untappd account
- **Data Management**: Refresh beer data, clear cache
- **Theme Settings**: Toggle between light and dark modes

## Development

### Project Structure

```
BeerSelector/
├── app/                    # Expo Router app directory
│   ├── (tabs)/            # Tab-based navigation screens
│   ├── screens/           # Additional screens
│   └── _layout.tsx        # Root layout
├── components/            # Reusable React components
│   ├── ui/               # UI-specific components
│   └── __tests__/        # Component tests
├── src/                  # Source code
│   ├── api/             # API services and authentication
│   ├── database/        # Database operations and types
│   ├── services/        # Business logic services
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Utility functions
├── assets/              # Static assets (images, fonts)
├── __tests__/           # Integration tests
└── constants/           # App constants and configuration
```

### Available Scripts

```bash
# Development
npm start                 # Start Expo development server
npm run ios              # Run on iOS simulator
npm run android          # Run on Android emulator
npm run web              # Run web version

# Testing
npm test                 # Run tests in watch mode
npm run test:ci          # Run tests with coverage report

# Utilities
npm run reset-project    # Reset project state
npm run lint             # Run ESLint
```

### Testing

The project includes comprehensive testing:

- **Unit Tests**: Individual component and function testing
- **Integration Tests**: API and database operation testing
- **Component Tests**: React component rendering tests
- **Type Tests**: TypeScript type guard validation

Run tests with:

```bash
npm test                 # Watch mode
npm run test:ci          # Single run with coverage
```

## Deployment

### Building for Production

1. **Configure app.json** with your app details
2. **Build for platforms:**

   ```bash
   # iOS
   npx expo run:ios --configuration Release

   # Android
   npx expo run:android --variant release
   ```

3. **Submit to app stores** using Expo's build service or EAS Build

### Environment Configuration

- **Development**: Uses Expo development server
- **Production**: Configured for app store deployment
- **API Endpoints**: Managed through app settings

### Code Style

- Use TypeScript for all new code
- Follow React Native best practices
- Use functional components with hooks
- Implement proper error handling
- Add JSDoc comments for complex functions

## Troubleshooting

### Common Issues

**App won't start:**

- Ensure all dependencies are installed: `npm install`
- Clear Metro cache: `npx expo start --clear`
- Check Node.js version compatibility

**Database issues:**

- Reset the database: `npm run reset-project`
- Check API URL configuration in settings
- Verify network connectivity

**Build errors:**

- Update Expo CLI: `npm install -g @expo/cli@latest`
- Clear build cache: `npx expo run:ios --clear` or `npx expo run:android --clear`

### Getting Help

- Check the [Expo documentation](https://docs.expo.dev/)
- Review [React Native documentation](https://reactnative.dev/docs/getting-started)
- Open an issue in the GitHub repository

## Acknowledgements

- **Flying Saucer UFO Club** for letting me bang on their API
- **Untappd** for beer rating and review integration
- **Expo team** for the excellent development platform
- **React Native community** for the robust mobile framework
- **All the beer brewers** around the world for creating amazing beers

---

**BeerSelector** - Your ultimate companion for beer discovery and tracking! 🍺
