#!/bin/bash
set -e

echo "====================== CI DIAGNOSTICS SCRIPT ======================"
echo "Running diagnostics at $(date)"

# Navigate to the iOS directory
cd "$(dirname "$0")/.."
echo "Current directory: $(pwd)"

# Check for code signing issues
echo "Checking code signing settings..."
find . -name "project.pbxproj" -exec grep -l "DEVELOPMENT_TEAM" {} \; | while read -r file; do
  echo "Development team settings in $file:"
  grep "DEVELOPMENT_TEAM" "$file" | head -5
done

echo "Checking provisioning profile settings..."
find . -name "project.pbxproj" -exec grep -l "PROVISIONING_PROFILE" {} \; | while read -r file; do
  echo "Provisioning profile settings in $file:"
  grep "PROVISIONING_PROFILE" "$file" | head -5
done

# Check for architecture issues
echo "Checking architecture settings..."
find . -name "project.pbxproj" -exec grep -l "ARCHS" {} \; | while read -r file; do
  echo "Architecture settings in $file:"
  grep "ARCHS" "$file" | head -5
done

# Check for iOS deployment target mismatches
echo "Checking iOS deployment targets..."
find . -name "*.pbxproj" -o -name "*.xcconfig" -exec grep -l "IPHONEOS_DEPLOYMENT_TARGET" {} \; | while read -r file; do
  echo "Deployment target in $file:"
  grep "IPHONEOS_DEPLOYMENT_TARGET" "$file" | head -5
done

# Fix common Xcode Cloud issues
echo "Applying common fixes for Xcode Cloud builds..."

# 1. Ensure code signing style is set to automatic
find . -name "project.pbxproj" -exec sed -i '' 's/CODE_SIGN_STYLE = Manual;/CODE_SIGN_STYLE = Automatic;/g' {} \;

# 2. Set ONLY_ACTIVE_ARCH to NO for Release builds
find . -name "project.pbxproj" -exec sed -i '' 's/ONLY_ACTIVE_ARCH = YES;/ONLY_ACTIVE_ARCH = NO;/g' {} \;

# 3. Make sure ENABLE_BITCODE is consistently set
find . -name "project.pbxproj" -exec sed -i '' 's/ENABLE_BITCODE = YES;/ENABLE_BITCODE = NO;/g' {} \;

# 4. Check for and fix framework search paths
echo "Checking framework search paths..."
find . -name "*.xcconfig" -exec grep -l "FRAMEWORK_SEARCH_PATHS" {} \; | while read -r file; do
  echo "Framework search paths in $file:"
  grep "FRAMEWORK_SEARCH_PATHS" "$file" | head -5
  # Make backup
  cp "$file" "${file}.bak"
  # Ensure pods directory is in search paths
  sed -i '' 's|$(inherited)|$(inherited) "$(PODS_ROOT)/../../node_modules/react-native/ReactCommon" "$(PODS_ROOT)/../../node_modules/expo/ios""|g' "$file"
done

# Verify Expo and React Native paths
cd ..
echo "Verifying Expo and React Native paths from project root:"
echo "Expo path: $(find . -name "expo" -type d | head -1)"
echo "React Native path: $(find . -name "react-native" -type d | head -1)"

# Final fix: create a special ARCHIVE build configuration
cd ios
echo "Making special adjustments for archive builds..."

# Check if we need Podfile modifications
if grep -q "post_install do |installer|" Podfile; then
  echo "Podfile already has post_install hook, skipping modification"
else
  echo "Adding post_install hook to Podfile to fix common archive issues..."
  # Backup Podfile
  cp Podfile Podfile.bak
  # Add post_install hook to fix archive issues
  cat <<EOT >> Podfile

# Add post_install hook to fix archive issues
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
      config.build_settings['ENABLE_BITCODE'] = 'NO'
      
      # For Xcode Cloud CI/CD builds
      if config.name == 'Release'
        config.build_settings['ONLY_ACTIVE_ARCH'] = 'NO'
      end
    end
  end
end
EOT
  # Reinstall pods with new configuration
  echo "Reinstalling pods with updated configuration..."
  pod install
fi

echo "Diagnostics completed at $(date)"
echo "====================== END OF DIAGNOSTICS SCRIPT ======================" 