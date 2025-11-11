# E2E Testing Quickstart Guide

This guide helps you get started with E2E testing for BeerSelector in under 10 minutes.

## Prerequisites Check

Before starting, ensure you have:
- ✅ Node.js 18+ installed
- ✅ Xcode (for iOS testing) or Android Studio (for Android testing)
- ✅ iOS Simulator or Android Emulator set up
- ✅ BeerSelector app runs successfully (`npm run ios` or `npm run android`)

## Step 1: Install Maestro (2 minutes)

### macOS / Linux
```bash
curl -fsSL https://get.maestro.mobile.dev | bash
```

### Windows (PowerShell)
```bash
iwr https://get.maestro.mobile.dev | iex
```

### Verify installation
```bash
maestro --version
# Should output: Maestro version X.X.X
```

## Step 2: Build the App (3-5 minutes)

### iOS
```bash
# Navigate to project
cd /workspace/BeerSelector

# Build and install on simulator
npm run ios
```

### Android
```bash
# Build and install on emulator
npm run android
```

> The app must be installed on the simulator/emulator before running E2E tests.

## Step 3: Run Your First E2E Test (1 minute)

```bash
# Run all E2E tests
npm run test:e2e
```

Or run a specific test:
```bash
# Test beer list rendering
npm run test:e2e:single .maestro/01-beer-list-rendering.yaml
```

## Step 4: Watch the Magic ✨

Maestro will:
1. 🚀 Launch the app automatically
2. 🔍 Navigate to All Beer tab
3. ✅ Verify list renders correctly
4. 📜 Test scrolling performance
5. 🔄 Test pull-to-refresh

You'll see real-time output in the terminal and the simulator/emulator performing actions!

## What Tests Are Available?

| Test | File | Duration | What It Tests |
|------|------|----------|---------------|
| **Beer List Rendering** | `01-beer-list-rendering.yaml` | ~45s | List loading, scrolling, refresh |
| **Search & Filter** | `02-search-and-filter.yaml` | ~60s | Search input, filters, sort |
| **Item Expansion** | `03-beer-item-expansion.yaml` | ~50s | Tap to expand, collapse |
| **Empty States** | `04-empty-states.yaml` | ~55s | Edge cases, error handling |
| **Navigation** | `05-navigation-and-tabs.yaml` | ~70s | Tab switching, state |

Run all tests:
```bash
npm run test:e2e
# Total duration: ~5 minutes
```

## Quick Commands

```bash
# All tests
npm run test:e2e

# iOS specific
npm run test:e2e:ios

# Android specific
npm run test:e2e:android

# Single test
npm run test:e2e:single .maestro/02-search-and-filter.yaml

# Performance tests (requires Flashlight)
npm run test:performance
```

## Troubleshooting

### "No devices found"
```bash
# Check available devices
maestro devices

# For iOS: ensure simulator is running
open -a Simulator

# For Android: ensure emulator is running
emulator -avd Pixel_5_API_31
```

### "Element not found"
- Wait for app to fully load (database initialization takes ~5-10 seconds)
- Check that API URLs are configured in Settings
- Ensure you have beer data loaded

### "App not installed"
```bash
# Rebuild and install app
npm run ios   # or npm run android
```

### Tests are too slow
- Tests run on Debug builds (slower than Release)
- First run includes database initialization
- Subsequent runs are faster (~3-4 minutes total)

## Next Steps

1. **Read Full Documentation**: See [e2e/README.md](./e2e/README.md)
2. **Add Performance Testing**: Install Flashlight
3. **Write Custom Tests**: Follow examples in `.maestro/` directory
4. **Set Up CI**: GitHub Actions workflow already configured

## Performance Testing (Optional)

Want to test scroll FPS and interaction delays?

### Install Flashlight
```bash
npm install -g @shopify/flashlight
```

### Run Performance Tests
```bash
npm run test:performance
```

### View Performance Report
```bash
npm run test:performance:report
# Opens interactive report in browser
```

## Need Help?

- 📖 [Full E2E Documentation](./e2e/README.md)
- 🔧 [Maestro Docs](https://maestro.mobile.dev/docs)
- 💬 [Open an Issue](https://github.com/your-repo/issues)

## Success Criteria

Your E2E tests are working if you see:
```
✅ 01-beer-list-rendering.yaml - PASSED
✅ 02-search-and-filter.yaml - PASSED
✅ 03-beer-item-expansion.yaml - PASSED
✅ 04-empty-states.yaml - PASSED
✅ 05-navigation-and-tabs.yaml - PASSED

📊 5/5 tests passed
```

Happy testing! 🎉
