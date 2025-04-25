// Read the existing configuration from app.json
const config = require('./app.json');

// Export the combined configuration
module.exports = {
  ...config,
  // Add dev client settings
  extra: {
    ...config.expo.extra,
    // Disable React DevTools connection
    reactNativeDevTools: false,
  },
  plugins: [
    "expo-secure-store"
    // Removed expo-network from plugins to avoid native module errors
    // The app will use fallback mechanisms when the native module is not available
  ]
};