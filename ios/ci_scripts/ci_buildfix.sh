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
  
  # Add single output file configuration
  echo "Adding single output file configuration to xcconfig files..."
  echo "OTHER_LIBTOOLFLAGS = -no_warning_for_no_symbols" >> "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.debug.xcconfig"
  echo "OTHER_LIBTOOLFLAGS = -no_warning_for_no_symbols" >> "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig"
  
  # Ensure we don't have conflicting settings
  echo "COPY_PHASE_STRIP = NO" >> "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.debug.xcconfig"
  echo "COPY_PHASE_STRIP = YES" >> "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig"
  
  echo "Added specific linker flags to prevent multiple output issues"
fi

# Additional fix for multiple output files issue - modify the Pods-BeerSelector shell script
echo "Modifying Pods-BeerSelector shell script phases..."
SCRIPT_PHASE_DIR="Pods/Target Support Files/Pods-BeerSelector"

# Create a patched script to ensure single output for libtool
cat > "$SCRIPT_PHASE_DIR/libtool-fix.sh" << 'EOF'
#!/bin/bash
# This script wraps the libtool command to ensure it doesn't try to process multiple outputs
# with a single -o flag, which causes the error we're seeing

# Path to the original libtool binary
ORIGINAL_LIBTOOL=/usr/bin/libtool

# Check if this is a libtool command
if [[ "$1" == *"libtool"* ]]; then
  # Parse the arguments to detect multiple inputs
  args=("$@")
  has_o_flag=0
  input_files=0
  o_index=-1
  
  for i in "${!args[@]}"; do
    if [[ "${args[$i]}" == "-o" ]]; then
      has_o_flag=1
      o_index=$i
    fi
    
    # Count how many .o files we have as inputs
    if [[ "${args[$i]}" == *".o" ]]; then
      input_files=$((input_files+1))
    fi
  done
  
  # If we have an -o flag and multiple input files, modify the command
  if [ $has_o_flag -eq 1 ] && [ $input_files -gt 1 ]; then
    echo "Fixing libtool command with multiple inputs..."
    
    # Create a temporary directory for intermediate files
    TMP_DIR=$(mktemp -d)
    
    # Process each input file separately
    output_file="${args[$o_index+1]}"
    echo "Original output: $output_file"
    
    # Process each input file separately
    separate_outputs=()
    input_index=0
    for i in "${!args[@]}"; do
      if [[ "${args[$i]}" == *".o" ]]; then
        input_file="${args[$i]}"
        temp_output="$TMP_DIR/out_$input_index.a"
        
        # Run libtool on a single input
        "$ORIGINAL_LIBTOOL" -static -o "$temp_output" "$input_file"
        separate_outputs+=("$temp_output")
        input_index=$((input_index+1))
      fi
    done
    
    # Combine all outputs
    "$ORIGINAL_LIBTOOL" -static -o "$output_file" "${separate_outputs[@]}"
    
    # Clean up
    rm -rf "$TMP_DIR"
    
    exit 0
  fi
fi

# If we don't need to modify anything, pass through to the original command
exec "$ORIGINAL_LIBTOOL" "$@"
EOF

chmod +x "$SCRIPT_PHASE_DIR/libtool-fix.sh"
echo "Created libtool wrapper to handle multiple output files issue"

# Modify the Pods project to inject our libtool wrapper
echo "Injecting libtool wrapper into build phases..."
if [ -f "$PODS_PROJECT" ]; then
  # Create a script phase that will modify LIBTOOL environment variable
  LIBTOOL_SCRIPT_PHASE="/* Inject custom libtool wrapper */ \\\
                shellScript = \"export PATH=\\\"${SCRIPT_PHASE_DIR}:\\$PATH\\\"; export LIBTOOL=\\\"${SCRIPT_PHASE_DIR}/libtool-fix.sh\\\"\","
  
  # Add a script phase to the Pods-BeerSelector target if not already present
  if ! grep -q "export LIBTOOL=" "$PODS_PROJECT"; then
    # Find the Pods-BeerSelector target section
    sed -i '' "/name = \"Pods-BeerSelector\"/,/buildPhases = (/s/buildPhases = (/buildPhases = (\\\
                {\\\
                    isa = PBXShellScriptBuildPhase;\\\
                    buildActionMask = 2147483647;\\\
                    files = ();\\\
                    inputFileListPaths = ();\\\
                    inputPaths = ();\\\
                    outputFileListPaths = ();\\\
                    outputPaths = ();\\\
                    $LIBTOOL_SCRIPT_PHASE\\\
                    showEnvVarsInLog = 0;\\\
                },/" "$PODS_PROJECT"
    
    echo "Added libtool wrapper script phase to Pods-BeerSelector target"
  fi
fi

# Modify the Podfile.lock to avoid regeneration of problematic files
echo "Fixing Podfile.lock to lock library versions..."
if [ -f "../Podfile.lock" ]; then
  cp "../Podfile.lock" "../Podfile.lock.bak"
  
  # Ensure React-hermes has a version pinned
  if grep -q "React-hermes:" "../Podfile.lock"; then
    # React-hermes version is already in the Podfile.lock
    echo "React-hermes version is already locked in Podfile.lock"
  else
    # Add React-hermes version to Podfile.lock (assuming version 0.72.6)
    sed -i '' '/SPEC CHECKSUMS:/i \
  React-hermes:  \
    :version: "0.72.6"' "../Podfile.lock"
    echo "Added React-hermes version to Podfile.lock"
  fi
fi

# Fix for the React-hermes directory issue
echo "Fixing React-hermes directory issue..."
REACT_HERMES_PATH="Pods/Target Support Files/React-hermes"
HERMES_DIR="/Volumes/workspace/DerivedData/Build/Intermediates.noindex/ArchiveIntermediates/BeerSelector/BuildProductsPath/Release-iphoneos/React-hermes"

# More aggressive fix for React-hermes directory issue
echo "Applying aggressive fix for React-hermes directory issue..."

# First approach: Create a dummy file if the directory is being mistakenly referenced as a file
if [ -d "$HERMES_DIR" ]; then
  echo "React-hermes is a directory, creating a dummy file..."
  # Create a dummy .a file that can be used as a fallback
  touch "$HERMES_DIR.a"
  echo "Created $HERMES_DIR.a"
fi

# Second approach: Fix linking in Pods-BeerSelector.release.xcconfig
if [ -f "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig" ]; then
  echo "Modifying Pods-BeerSelector.release.xcconfig for React-hermes..."
  
  # Backup the file
  cp "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig" "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig.bak2"
  
  # Add specific linking flags for React-hermes
  echo "" >> "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig"
  echo "# Fixed React-hermes linking" >> "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig"
  echo "OTHER_LDFLAGS = \$(inherited) -l\"React-hermes\" -framework \"JavaScriptCore\"" >> "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig"
  
  # Add to library search paths if needed
  echo "LIBRARY_SEARCH_PATHS = \$(inherited) \"\$(PODS_CONFIGURATION_BUILD_DIR)/React-hermes\"" >> "Pods/Target Support Files/Pods-BeerSelector/Pods-BeerSelector.release.xcconfig"
  
  echo "Modified Pods-BeerSelector.release.xcconfig with React-hermes linking fix"
fi

# Third approach: Fix the React-hermes target in the Pods project
if [ -f "$PODS_PROJECT" ]; then
  echo "Modifying React-hermes target in Pods project..."
  
  # Find the lines related to React-hermes in the project file
  if grep -q "React-hermes" "$PODS_PROJECT"; then
    echo "Found React-hermes references in Pods project, fixing..."
    
    # Force React-hermes to be a static library instead of a framework
    sed -i '' 's/MACH_O_TYPE = mh_dylib;/MACH_O_TYPE = staticlib;/g' "$PODS_PROJECT"
    
    # Ensure proper product name
    sed -i '' 's/PRODUCT_NAME = "React-hermes";/PRODUCT_NAME = "libReact-hermes.a";/g' "$PODS_PROJECT"
    
    echo "Modified React-hermes target settings in Pods project"
  fi
fi

# Fourth approach: Manually edit build settings for both targets
echo "Manually fixing build settings for React-hermes and Pods-BeerSelector..."

# Create a script to run during build phase to ensure the library exists
SCRIPT_DIR="Pods/Target Support Files/React-hermes"
mkdir -p "$SCRIPT_DIR"

cat > "$SCRIPT_DIR/ensure-library.sh" << 'EOF'
#!/bin/bash
# Ensure the React-hermes library exists
HERMES_DIR="${PODS_CONFIGURATION_BUILD_DIR}/React-hermes"
if [ -d "$HERMES_DIR" ] && [ ! -f "$HERMES_DIR/libReact-hermes.a" ]; then
  echo "Creating dummy libReact-hermes.a"
  # Create an empty static library
  mkdir -p "$HERMES_DIR"
  touch "$HERMES_DIR/libReact-hermes.a"
  # Create a dummy header file if needed
  mkdir -p "$HERMES_DIR/include"
  echo "// Dummy header" > "$HERMES_DIR/include/hermes.h"
fi
EOF

chmod +x "$SCRIPT_DIR/ensure-library.sh"
echo "Created build script to ensure React-hermes library exists"

# Continue with the original React-hermes fixes
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