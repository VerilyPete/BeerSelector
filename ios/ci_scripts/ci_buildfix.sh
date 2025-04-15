#!/bin/bash
set -e

echo "====================== CI BUILD FIX SCRIPT ======================"
echo "Starting build fix process at $(date)"

# Navigate to the iOS directory
cd "$(dirname "$0")/.."
echo "Current directory: $(pwd)"

# Clean CocoaPods cache if needed - sometimes helps with build issues
echo "Cleaning CocoaPods cache..."
pod cache clean --all

# Reinstall pods to apply Podfile changes
echo "Reinstalling CocoaPods..."
pod install --verbose

# Check xcconfig files for potential issues
find . -name "*.xcconfig" -exec grep -l "LIBRARY_SEARCH_PATHS" {} \; | while read -r file; do
  echo "Checking $file for potential build issues..."
  # Backup the file
  cp "$file" "${file}.bak"
  # Fix paths in xcconfig files if needed
  sed -i '' 's|$(inherited)|$(inherited) "${PODS_CONFIGURATION_BUILD_DIR}/React-hermes"|g' "$file"
done

# Fix React Native project settings if needed
echo "Checking React Native project settings..."
find . -name "project.pbxproj" -exec grep -l "ENABLE_BITCODE" {} \; | while read -r file; do
  echo "Fixing bitcode settings in $file..."
  # Backup the file
  cp "$file" "${file}.bak"
  # Disable bitcode (common issue with Expo/React Native projects)
  sed -i '' 's/ENABLE_BITCODE = YES;/ENABLE_BITCODE = NO;/g' "$file"
done

# Check for problematic build settings in Xcode project
echo "Checking Xcode project build settings..."

# Fix deployment target issues
find . -name "project.pbxproj" -exec grep -l "IPHONEOS_DEPLOYMENT_TARGET" {} \; | while read -r file; do
  echo "Ensuring consistent deployment target in $file..."
  # Set minimum deployment target to 15.1 (match what's in Podfile)
  sed -i '' 's/IPHONEOS_DEPLOYMENT_TARGET = [0-9]*\.[0-9]*;/IPHONEOS_DEPLOYMENT_TARGET = 15.1;/g' "$file"
done

# Ensure node_modules are accessible during build
echo "Verifying node_modules accessibility..."
cd ..
if [ -d "node_modules" ]; then
  echo "node_modules exists with permissions:"
  ls -la node_modules | head -5
else
  echo "ERROR: node_modules directory not found!"
  exit 1
fi

# Fix module resolution issues
echo "Setting up module resolution symlinks if needed..."
if [ -d "node_modules/expo" ] && [ -d "ios/Pods" ]; then
  mkdir -p ios/build/moduleCache
  echo "Creating symlinks for critical modules..."
  ln -sf "$(pwd)/node_modules/expo" ios/build/moduleCache/expo
  ln -sf "$(pwd)/node_modules/react-native" ios/build/moduleCache/react-native
fi

echo "Build fix completed successfully at $(date)"
echo "====================== END OF BUILD FIX SCRIPT ======================" 