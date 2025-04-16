#!/bin/bash

# Script to run Jest tests for Xcode integration
# This script can be added as a Run Script phase in Xcode

# Set up environment
export NODE_BINARY=$(command -v node)
export PATH=$PATH:$NODE_BINARY

# Set working directory to project root
cd "${SRCROOT}/.."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Run tests
echo "Running tests..."
npm run test:ci

# Check test results
if [ $? -eq 0 ]; then
  echo "Tests passed!"
  exit 0
else
  echo "Tests failed!"
  exit 1
fi
