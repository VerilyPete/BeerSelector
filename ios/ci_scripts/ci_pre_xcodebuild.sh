#!/bin/bash
set -e

echo "====================== CI PRE-BUILD SCRIPT ======================"
echo "Starting pre-build process at $(date)"

# Function to handle errors
handle_error() {
  echo "ERROR: An error occurred on line $1"
  exit 1
}

# Set up error handling
trap 'handle_error $LINENO' ERR

echo "Setting up Node.js environment..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 18
nvm use 18

echo "Current directory: $(pwd)"
cd "$(dirname "$0")/.."
echo "Changed to iOS directory: $(pwd)"
cd ..
echo "Changed to project root: $(pwd)"

echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Check for package.json
if [ ! -f "package.json" ]; then
  echo "ERROR: package.json not found in the current directory"
  exit 1
fi

# List directory contents for debugging
echo "Project root contents:"
ls -la

# Install project dependencies with detailed logging
echo "Installing npm dependencies..."
npm install --verbose

# Verify expo package is installed
if [ ! -d "node_modules/expo" ]; then
  echo "ERROR: expo package not found in node_modules after npm install"
  echo "node_modules contents:"
  ls -la node_modules | head -20
  exit 1
fi

echo "Verifying critical paths..."
node --print "require.resolve('expo/package.json')" || echo "WARNING: expo/package.json path resolution failed"
node --print "require.resolve('react-native/package.json')" || echo "WARNING: react-native/package.json path resolution failed"

# Now go back to iOS directory to install CocoaPods
echo "Changing back to iOS directory..."
cd ios
echo "Current directory: $(pwd)"

# Check for Podfile
if [ ! -f "Podfile" ]; then
  echo "ERROR: Podfile not found in iOS directory"
  exit 1
fi

echo "Installing CocoaPods..."
pod install --verbose

echo "Pods directory after installation:"
ls -la Pods || echo "WARNING: Pods directory not found or accessible"

# Run the diagnostic script first
echo "Running diagnostics script..."
./ci_scripts/ci_diagnostics.sh

# Run the build fix script
echo "Running build fix script..."
./ci_scripts/ci_buildfix.sh

# Final check: make sure we have everything needed for the build
echo "Final verification of critical build components..."
if [ ! -d "Pods/Headers" ]; then
  echo "WARNING: Pods/Headers directory not found, CocoaPods installation may have issues"
fi

echo "Setup completed successfully at $(date)"
echo "====================== END OF PRE-BUILD SCRIPT ======================"
