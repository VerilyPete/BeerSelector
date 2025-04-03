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
}; 