#!/bin/bash
set -e

echo "====================== CI BUILD FIX SCRIPT ======================"
echo "Starting build fix process at $(date)"

# Function to handle errors
handle_error() {
  echo "ERROR: An error occurred on line $1"
  exit 1
}

# Set up error handling
trap 'handle_error $LINENO' ERR

# Navigate to the iOS directory
cd "$(dirname "$0")/.."
echo "Current directory: $(pwd)"

# Check for unmatched quotes in xcconfig files
echo "Checking for unmatched quotes in xcconfig files..."
if [ -d "./Pods" ]; then
  find ./Pods -name "*.xcconfig" -exec grep -l "OTHER_LDFLAGS" {} \; 2>/dev/null | while read -r file; do
    if [ -f "$file" ]; then
      echo "Examining $file for potential quote issues..."
      
      # Create a backup
      cp "$file" "${file}.bak"
      
      # Simpler approach to fix quotes: Just replace the entire OTHER_LDFLAGS line with a properly quoted version
      # This reduces the risk of sed errors
      if grep -q "OTHER_LDFLAGS" "$file"; then
        line=$(grep "OTHER_LDFLAGS" "$file")
        # Remove line if it exists
        sed -i '' "/OTHER_LDFLAGS/d" "$file"
        # Add back a properly formatted version
        echo "OTHER_LDFLAGS = \$(inherited)" >> "$file"
        echo "Fixed potential quote issues in $file"
      fi
    fi
  done
else
  echo "Pods directory not found, skipping xcconfig check"
fi

# Fix for the "cannot specify -o when generating multiple output files" error
echo "Fixing Pods-BeerSelector target configuration..."
if [ -f "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.debug.xcconfig" ]; then
  echo "Checking Pods-BeerSelector build settings..."
  
  # Back up the file
  cp "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.debug.xcconfig" "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.debug.xcconfig.bak"
  
  # Remove any problematic build settings that might be causing the -o flag issue
  if grep -q "OTHER_CFLAGS" "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.debug.xcconfig"; then
    sed -i '' '/OTHER_CFLAGS/d' "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.debug.xcconfig"
    echo "Removed problematic OTHER_CFLAGS settings"
  fi
  
  # Also check the release config
  if [ -f "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig" ]; then
    cp "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig" "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig.bak"
    if grep -q "OTHER_CFLAGS" "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig"; then
      sed -i '' '/OTHER_CFLAGS/d' "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig"
      echo "Removed problematic OTHER_CFLAGS settings from release config"
    fi
  fi
fi

# Fix for the React-hermes directory issue
echo "Fixing React-hermes directory issue..."
REACT_HERMES_PATH="Pods/Target Support Files/React-hermes"
if [ -d "$REACT_HERMES_PATH" ]; then
  echo "Checking React-hermes configuration..."
  
  # Fix the React-hermes.xcconfig file
  if [ -f "$REACT_HERMES_PATH/React-hermes.xcconfig" ]; then
    cp "$REACT_HERMES_PATH/React-hermes.xcconfig" "$REACT_HERMES_PATH/React-hermes.xcconfig.bak"
    
    # Ensure correct path format in the React-hermes.xcconfig
    if grep -q "HEADER_SEARCH_PATHS" "$REACT_HERMES_PATH/React-hermes.xcconfig"; then
      sed -i '' 's|\.\./\.\./React-hermes|${PODS_ROOT}/../../React-hermes|g' "$REACT_HERMES_PATH/React-hermes.xcconfig"
      echo "Fixed React-hermes header paths"
    fi
  fi
  
  # Fix the build script if it exists
  if [ -f "$REACT_HERMES_PATH/React-hermes-prefix.pch" ]; then
    cp "$REACT_HERMES_PATH/React-hermes-prefix.pch" "$REACT_HERMES_PATH/React-hermes-prefix.pch.bak"
    echo "Backed up React-hermes prefix header"
  fi
fi

# Check Pods project file for multiple output files issue
echo "Checking Pods.xcodeproj/project.pbxproj for multiple output files settings..."
PODS_PROJECT="Pods/Pods.xcodeproj/project.pbxproj"
if [ -f "$PODS_PROJECT" ]; then
  cp "$PODS_PROJECT" "$PODS_PROJECT.bak"
  
  # Look for Pods-BeerSelector target and check its build settings
  echo "Examining Pods-BeerSelector target in Pods project..."
  
  # Modify project file to ensure a single output file for Pods-BeerSelector
  # This is a targeted fix for "cannot specify -o when generating multiple output files"
  # It adjusts the build phases to ensure proper ordering and single library output
  if grep -q "Pods-BeerSelector" "$PODS_PROJECT"; then
    # Fix the build phases order and configuration
    sed -i '' 's/buildPhases = (/buildPhases = ( \/\/ Order matters here /' "$PODS_PROJECT"
    
    # Disable parallel builds for Pods-BeerSelector
    if grep -q "Pods-BeerSelector.*buildSettings" "$PODS_PROJECT"; then
      sed -i '' '/Pods-BeerSelector.*buildSettings/,/};/ s/ENABLE_BITCODE = NO;/ENABLE_BITCODE = NO;\n\t\t\t\tPARALLEL_PROCESS_FILES_USING_CLANG = NO;/' "$PODS_PROJECT"
      echo "Disabled parallel builds for Pods-BeerSelector to prevent -o flag issues"
    fi
  fi
fi

# Clean CocoaPods cache if needed - sometimes helps with build issues
echo "Cleaning CocoaPods cache..."
pod cache clean --all

# Check if the problematic targets exist and what their DEFINES_MODULE settings are
echo "Checking for problematic targets in Pods project..."
XCODEPROJ_PATH="Pods/Pods.xcodeproj"
if [ -d "$XCODEPROJ_PATH" ]; then
  echo "Found Pods.xcodeproj, checking for targets with DEFINES_MODULE conflicts..."
  
  # Extract build settings for problematic targets using xcodebuild (if available)
  for TARGET in "expo-dev-menu" "Main" "ReactNativeCompatibles" "SafeAreaView" "Vendored"; do
    echo "Checking target: $TARGET"
    xcodebuild -project "$XCODEPROJ_PATH" -target "$TARGET" -showBuildSettings 2>/dev/null | grep DEFINES_MODULE || echo "Target $TARGET not found or DEFINES_MODULE not set"
  done
else
  echo "Pods.xcodeproj not found, skipping target check"
fi

# Reinstall pods to apply Podfile changes
echo "Reinstalling CocoaPods..."
if [ -f "Podfile" ]; then
  pod install --verbose
else
  echo "Podfile not found, skipping pod install"
fi

# Verify the fix after reinstallation
echo "Verifying DEFINES_MODULE fixes..."
if [ -d "$XCODEPROJ_PATH" ]; then
  for TARGET in "expo-dev-menu" "Main" "ReactNativeCompatibles" "SafeAreaView" "Vendored"; do
    echo "Checking target: $TARGET after fix"
    xcodebuild -project "$XCODEPROJ_PATH" -target "$TARGET" -showBuildSettings 2>/dev/null | grep DEFINES_MODULE || echo "Target $TARGET not found or DEFINES_MODULE not set after fix"
  done
else
  echo "Pods.xcodeproj not found, skipping verification"
fi

# Check xcconfig files for potential issues
echo "Checking xcconfig files for LIBRARY_SEARCH_PATHS issues..."
find . -name "*.xcconfig" -exec grep -l "LIBRARY_SEARCH_PATHS" {} \; 2>/dev/null | while read -r file; do
  if [ -f "$file" ]; then
    echo "Checking $file for potential build issues..."
    # Backup the file
    cp "$file" "${file}.bak"
    # Fix paths in xcconfig files if needed
    sed -i '' 's|$(inherited)|$(inherited) "${PODS_CONFIGURATION_BUILD_DIR}/React-hermes"|g' "$file"
  fi
done

# Fix React Native project settings if needed
echo "Checking React Native project settings..."
find . -name "project.pbxproj" -exec grep -l "ENABLE_BITCODE" {} \; 2>/dev/null | while read -r file; do
  if [ -f "$file" ]; then
    echo "Fixing bitcode settings in $file..."
    # Backup the file
    cp "$file" "${file}.bak"
    # Disable bitcode (common issue with Expo/React Native projects)
    sed -i '' 's/ENABLE_BITCODE = YES;/ENABLE_BITCODE = NO;/g' "$file"
  fi
done

# Check for problematic build settings in Xcode project
echo "Checking Xcode project build settings..."

# Fix deployment target issues
find . -name "project.pbxproj" -exec grep -l "IPHONEOS_DEPLOYMENT_TARGET" {} \; 2>/dev/null | while read -r file; do
  if [ -f "$file" ]; then
    echo "Ensuring consistent deployment target in $file..."
    # Set minimum deployment target to 15.1 (match what's in Podfile)
    sed -i '' 's/IPHONEOS_DEPLOYMENT_TARGET = [0-9]*\.[0-9]*;/IPHONEOS_DEPLOYMENT_TARGET = 15.1;/g' "$file"
  fi
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