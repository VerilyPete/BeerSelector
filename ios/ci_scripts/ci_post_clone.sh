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
if [ -n "${CI_WORKSPACE}" ]; then
  cd "${CI_WORKSPACE}"
else
  # If running outside CI, navigate relative to script location
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # If we're in ios/ci_scripts, go up two levels to reach the project root
  cd "$SCRIPT_DIR/../.."
fi
PROJECT_ROOT="$(pwd)"
echo "Project root directory: $PROJECT_ROOT"

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

# Setup CocoaPods - First ensure we can find the iOS directory
if [ -d "ios" ]; then
  echo "Installing CocoaPods dependencies..."
  cd ios
  
  # Fix Podfile DEFINES_MODULE issue before pod install
  if [ -f "Podfile" ]; then
    echo "Patching Podfile to fix DEFINES_MODULE conflicts..."
    # Make a backup of the original Podfile
    cp Podfile Podfile.bak
    
    # Rather than using sed with complex quoting, create a new fix file and apply it
    # Check if post_install hook already exists
    if grep -q "post_install do |installer|" Podfile; then
      echo "Existing post_install hook found, appending fix..."
      # Create a temporary file with our fix
      cat > podfile_defines_module_fix.rb << 'EOF'
# Fix DEFINES_MODULE conflicts
# Set DEFINES_MODULE to YES for all targets that might conflict
if ["expo-dev-menu", "Main", "ReactNativeCompatibles", "SafeAreaView", "Vendored"].include?(target.name)
  target.build_configurations.each do |config|
    config.build_settings["DEFINES_MODULE"] = "YES"
  end
end
EOF
      # Find the line after the first occurrence of installer.pods_project.targets.each
      LINE_NUM=$(grep -n "installer\.pods_project\.targets\.each do |target|" Podfile | head -1 | cut -d: -f1)
      if [ -n "$LINE_NUM" ]; then
        LINE_NUM=$((LINE_NUM + 1))
        # Insert our fix after that line
        sed -i '' "${LINE_NUM}r podfile_defines_module_fix.rb" Podfile
        rm podfile_defines_module_fix.rb
      else
        echo "Could not find target iteration in post_install hook, creating new hook instead"
        # Extract existing post_install hook
        sed -n '/post_install do |installer|/,/end/p' Podfile > existing_post_install.rb
        # Remove the existing post_install hook from Podfile
        sed -i '' '/post_install do |installer|/,/end/d' Podfile
        # Create a new post_install hook with our fix
        cat > new_post_install.rb << 'EOF'

post_install do |installer|
  installer.pods_project.targets.each do |target|
    # Fix DEFINES_MODULE conflicts
    # Set DEFINES_MODULE to YES for all targets that might conflict
    if ["expo-dev-menu", "Main", "ReactNativeCompatibles", "SafeAreaView", "Vendored"].include?(target.name)
      target.build_configurations.each do |config|
        config.build_settings["DEFINES_MODULE"] = "YES"
      end
    end
EOF
        # Append content from existing hook (minus the first and last line)
        sed '1d;$d' existing_post_install.rb >> new_post_install.rb
        # Add final end
        echo "  end" >> new_post_install.rb
        echo "end" >> new_post_install.rb
        # Append to Podfile
        cat new_post_install.rb >> Podfile
        # Clean up
        rm existing_post_install.rb new_post_install.rb
      fi
    else
      echo "No post_install hook found, creating new one..."
      # Add entire post_install hook if it doesn't exist
      cat >> Podfile << 'EOF'

post_install do |installer|
  installer.pods_project.targets.each do |target|
    # Fix DEFINES_MODULE conflicts
    # Set DEFINES_MODULE to YES for all targets that might conflict
    if ["expo-dev-menu", "Main", "ReactNativeCompatibles", "SafeAreaView", "Vendored"].include?(target.name)
      target.build_configurations.each do |config|
        config.build_settings["DEFINES_MODULE"] = "YES"
      end
    end
  end
end
EOF
    fi
  fi
  
  # Run pod install with patched Podfile
  pod install
else
  echo "ERROR: iOS directory not found in $PROJECT_ROOT"
  echo "Directory contents:"
  ls -la
  exit 1
fi

# Create a marker file to indicate post-clone has completed - using absolute path
mkdir -p "$PROJECT_ROOT/ios/ci_scripts"
MARKER_FILE="$PROJECT_ROOT/ios/ci_scripts/.post_clone_completed"
echo "$(date)" > "$MARKER_FILE"
echo "Created marker file: $MARKER_FILE"

echo "Post-clone setup completed successfully!"
echo "====================== END OF POST-CLONE SCRIPT ======================" 