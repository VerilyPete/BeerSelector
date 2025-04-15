#!/bin/bash
set -e

echo "Setting up Node.js environment..."
# Install Node.js using the built-in Ruby
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 18 # or whatever version you need

echo "Current directory: $(pwd)"
cd "$(dirname "$0")/../"
echo "Changed to iOS directory: $(pwd)"

echo "Node version: $(node --version)"
echo "Installing CocoaPods..."
pod install --repo-update
