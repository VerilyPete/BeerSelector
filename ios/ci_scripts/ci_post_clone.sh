#!/bin/bash
set -e

echo "====================== CI POST-CLONE SCRIPT ======================"
echo "Starting post-clone process at $(date)"

# Function to handle errors
handle_error() {
  echo "ERROR: An error occurred on line $1"
  exit 1
}

# Set up error handling
trap 'handle_error $LINENO' ERR

# Navigate to the root of the repository
cd "${CI_WORKSPACE}"
echo "CI workspace directory: $(pwd)"

echo "Setting up Node.js environment..."
export NVM_DIR="${HOME}/.nvm"
mkdir -p $NVM_DIR
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 18
nvm use 18
node -v
npm -v

# Install project dependencies
echo "Installing npm dependencies..."
npm install

# Verify critical paths
echo "Verifying package paths..."
node --print "require.resolve('expo/package.json')" || echo "WARNING: expo/package.json path resolution failed"
node --print "require.resolve('react-native/package.json')" || echo "WARNING: react-native/package.json path resolution failed"

# Setup CocoaPods
echo "Installing CocoaPods dependencies..."
cd ios
pod install

# Create a marker file to indicate post-clone has completed
echo "$(date)" > "${CI_WORKSPACE}/ios/ci_scripts/.post_clone_completed"
echo "Created marker file: ${CI_WORKSPACE}/ios/ci_scripts/.post_clone_completed"

echo "Post-clone setup completed successfully!"
echo "====================== END OF POST-CLONE SCRIPT ======================" 