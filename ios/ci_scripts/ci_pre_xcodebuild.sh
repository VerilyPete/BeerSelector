#!/bin/bash
set -e

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

# Install project dependencies
echo "Installing npm dependencies..."
npm install

# Now go back to iOS directory to install CocoaPods
cd ios
echo "Installing CocoaPods..."
pod install

echo "Setup completed successfully!"
