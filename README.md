<<<<<<< HEAD

=======
# BeerSelector 🍺

A mobile app for beer enthusiasts to discover, track, and rate their favorite brews. Built with React Native and Expo.

![BeerSelector App](8bitbeer.png)

## Features

- **Beer Discovery**: Browse through thousands of beers from various breweries
- **Beerfinder**: Find beers based on style, brewery, or other criteria
- **Tasted Brews**: Keep track of beers you've tried
- **Rewards Tracking**: Track your beer tasting rewards and achievements
- **Dark Mode Support**: Enjoy the app in both light and dark modes
- **Offline Support**: Access your beer data even without an internet connection

## Technology Stack

- [React Native](https://reactnative.dev/) - Cross-platform mobile framework
- [Expo](https://expo.dev/) - React Native development platform
- [Expo Router](https://docs.expo.dev/router/introduction/) - File-based routing
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/) - Local database storage
- [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/) - Animations
- [TypeScript](https://www.typescriptlang.org/) - Type safety

## Installation

### Prerequisites

- Node.js (LTS version recommended)
- npm or yarn
- Expo CLI
- iOS Simulator (for Mac users) or Android Emulator

### Setup

1. Clone the repository:

```bash
git clone https://github.com/yourusername/BeerSelector.git
cd BeerSelector
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npx expo start
```

4. Follow the instructions in the terminal to open the app in:
   - iOS Simulator
   - Android Emulator
   - Your physical device using Expo Go app

## Usage

### Home Screen
Navigate through the app using the main buttons:
- **All Beers**: Browse the complete beer database
- **Beerfinder**: Search for specific beers based on criteria
- **Tasted Brews**: View beers you've already tried
- **Rewards**: Check your achievements and rewards

### Settings
Configure your app settings and account information from the settings page.

## Database

The app uses SQLite for local storage with the following main tables:
- `allbeers`: Information about all available beers
- `mybeers`: Your personally tracked beers
- `tasted`: Beers you've tried

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Flying Saucer for beer data
- All the beer brewers around the world
- Icons from Expo Vector Icons
>>>>>>> cfa217a (Removed extensions from github tracking, first crack at a readme.md)
