#!/bin/bash
set -e

echo "====================== CI PRE-BUILD SCRIPT ======================"
echo "Starting pre-build process at $(date)"

# Set CI environment variable to indicate we're running in a CI environment
export CI="true"
export RUNNING_IN_CI="true"
echo "Set CI environment variables: CI=true, RUNNING_IN_CI=true"

# Function to handle errors
handle_error() {
  echo "ERROR: An error occurred on line $1"
  exit 1
}

# Set up error handling
trap 'handle_error $LINENO' ERR

# First determine our location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Script directory: $SCRIPT_DIR"

# Find project root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
echo "Project root: $PROJECT_ROOT"

# Check if post-clone script has already run - use the well-known location
POST_CLONE_MARKER="$PROJECT_ROOT/ios/ci_scripts/.post_clone_completed"

POST_CLONE_COMPLETED=false
if [ -f "$POST_CLONE_MARKER" ]; then
  echo "Detected that post-clone script has already run at: $(cat "$POST_CLONE_MARKER")"
  POST_CLONE_COMPLETED=true
else
  echo "No post-clone marker file found at $POST_CLONE_MARKER"
  # Try alternate locations as fallback
  ALTERNATE_MARKER="$SCRIPT_DIR/.post_clone_completed"
  if [ -f "$ALTERNATE_MARKER" ]; then
    echo "Found marker file at alternate location: $ALTERNATE_MARKER"
    POST_CLONE_COMPLETED=true
  fi
fi

# Only set up Node.js environment if post-clone hasn't done it
if [ "$POST_CLONE_COMPLETED" = false ]; then
  echo "Setting up Node.js environment..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install 18
  nvm use 18
else
  echo "Skipping Node.js setup as it was done in post-clone script"
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm use 18
fi

echo "Current directory: $(pwd)"
cd "$SCRIPT_DIR/.."
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

# Only install npm dependencies if post-clone hasn't done it
if [ "$POST_CLONE_COMPLETED" = false ]; then
  echo "Installing npm dependencies..."
  npm install --verbose
else
  echo "Skipping npm install as it was done in post-clone script"
fi

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

# Only install CocoaPods if post-clone hasn't done it
if [ "$POST_CLONE_COMPLETED" = false ]; then
  echo "Installing CocoaPods..."
  pod install --verbose
else
  echo "Skipping pod install as it was done in post-clone script"
fi

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

# Fix for React-hermes directory issue
HERMES_DIR="${DERIVED_DATA_PATH}/Build/Intermediates.noindex/ArchiveIntermediates/BeerSelector/BuildProductsPath/Release-iphoneos/React-hermes"
if [ -d "$HERMES_DIR" ]; then
  echo "Found React-hermes directory, creating dummy .a file..."
  mkdir -p "$HERMES_DIR"
  touch "$HERMES_DIR/libReact-hermes.a"
  echo "Created $HERMES_DIR/libReact-hermes.a"
fi

# For Xcode Cloud, also try this path pattern
WORKSPACE_HERMES_DIR="/Volumes/workspace/DerivedData/Build/Intermediates.noindex/ArchiveIntermediates/BeerSelector/BuildProductsPath/Release-iphoneos/React-hermes"
if [ -d "$WORKSPACE_HERMES_DIR" ]; then
  echo "Found Xcode Cloud React-hermes directory, creating dummy .a file..."
  mkdir -p "$WORKSPACE_HERMES_DIR"
  touch "$WORKSPACE_HERMES_DIR/libReact-hermes.a"
  echo "Created $WORKSPACE_HERMES_DIR/libReact-hermes.a"
fi

# Fix for multiple output files issue in Pods-BeerSelector
# Create a wrapper for libtool
LIBTOOL_WRAPPER="/tmp/libtool-wrapper.sh"
cat > "$LIBTOOL_WRAPPER" << 'EOF'
#!/bin/bash
# Wrapper for libtool to handle multiple output files

ORIGINAL_LIBTOOL=/usr/bin/libtool
ARGS=("$@")

# Check if this is the problematic case (-o flag with multiple .o files)
HAS_O_FLAG=0
O_INDEX=-1
INPUT_FILES=0

for i in "${!ARGS[@]}"; do
  if [[ "${ARGS[$i]}" == "-o" ]]; then
    HAS_O_FLAG=1
    O_INDEX=$i
  fi
  
  if [[ "${ARGS[$i]}" == *".o" ]]; then
    INPUT_FILES=$((INPUT_FILES+1))
  fi
done

# If problematic case detected, handle it specially
if [ $HAS_O_FLAG -eq 1 ] && [ $INPUT_FILES -gt 1 ]; then
  echo "Fixing libtool call with multiple inputs..."
  
  # Get output file
  OUTPUT_FILE="${ARGS[$O_INDEX+1]}"
  
  # Create temp dir
  TMP_DIR=$(mktemp -d)
  
  # Process each input separately
  SEPARATE_OUTPUTS=()
  INPUT_INDEX=0
  
  for i in "${!ARGS[@]}"; do
    if [[ "${ARGS[$i]}" == *".o" ]]; then
      INPUT_FILE="${ARGS[$i]}"
      TEMP_OUTPUT="$TMP_DIR/out_$INPUT_INDEX.a"
      
      # Create separate library
      "$ORIGINAL_LIBTOOL" -static -o "$TEMP_OUTPUT" "$INPUT_FILE"
      SEPARATE_OUTPUTS+=("$TEMP_OUTPUT")
      INPUT_INDEX=$((INPUT_INDEX+1))
    fi
  done
  
  # Combine all outputs
  "$ORIGINAL_LIBTOOL" -static -o "$OUTPUT_FILE" "${SEPARATE_OUTPUTS[@]}"
  
  # Clean up
  rm -rf "$TMP_DIR"
  exit 0
fi

# Otherwise, pass through to original libtool
exec "$ORIGINAL_LIBTOOL" "$@"
EOF

chmod +x "$LIBTOOL_WRAPPER"
echo "Created libtool wrapper at $LIBTOOL_WRAPPER"

# Export the wrapper to be used during build
export LIBTOOL="$LIBTOOL_WRAPPER"
echo "LIBTOOL environment variable set to $LIBTOOL_WRAPPER"

echo "Setup completed successfully at $(date)"
echo "====================== END OF PRE-BUILD SCRIPT ======================"
