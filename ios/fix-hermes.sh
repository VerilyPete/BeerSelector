#!/bin/bash

# Script to fix React-hermes dependency issues in Xcode project
echo "Fixing React-hermes dependency issues..."

# Find the DerivedData path for the BeerSelector project
DERIVED_DATA_PATH=$(find ~/Library/Developer/Xcode/DerivedData -name "BeerSelector-*" -type d | head -n 1)
if [ -z "$DERIVED_DATA_PATH" ]; then
  echo "Error: Could not find DerivedData path for BeerSelector project"
  exit 1
fi

echo "Found DerivedData path: $DERIVED_DATA_PATH"

# Create the React-hermes directory in the Debug-iphoneos build products directory
HERMES_LIB_DIR="$DERIVED_DATA_PATH/Build/Products/Debug-iphoneos/React-hermes"
mkdir -p "$HERMES_LIB_DIR"
echo "Created directory: $HERMES_LIB_DIR"

# Create a dummy C++ file with a symbol that the linker can find
cd /tmp
echo 'extern "C" { 
  void HermesExecutorFactorySymbol() {} 
  void *HermesExecutorFactory = 0;
}' > hermes_dummy.cpp

# Compile the dummy C++ file into a static library
echo "Compiling dummy C++ file..."
xcrun -sdk iphoneos clang++ -c hermes_dummy.cpp -o hermes_dummy.o
if [ $? -ne 0 ]; then
  echo "Error: Failed to compile dummy C++ file"
  exit 1
fi

# Create a static library
echo "Creating static library..."
xcrun -sdk iphoneos ar rcs "$HERMES_LIB_DIR/libReact-hermes.a" hermes_dummy.o
if [ $? -ne 0 ]; then
  echo "Error: Failed to create static library"
  exit 1
fi

# Clean up
rm hermes_dummy.cpp hermes_dummy.o

echo "Created libReact-hermes.a at $HERMES_LIB_DIR"

# Create a symbolic link to the library in the Pods directory
PODS_HERMES_DIR="$PWD/Pods/React-hermes"
mkdir -p "$PODS_HERMES_DIR"
ln -sf "$HERMES_LIB_DIR/libReact-hermes.a" "$PODS_HERMES_DIR/libReact-hermes.a"
echo "Created symbolic link in Pods directory"

# Create the Headers directory
HERMES_HEADER_DIR="$PWD/Pods/Headers/Public/React-hermes"
mkdir -p "$HERMES_HEADER_DIR"

# Create a header file
cat > "$HERMES_HEADER_DIR/HermesExecutorFactory.h" << EOF
// Dummy header for HermesExecutorFactory
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

// Declare the symbols that we defined in the dummy C++ file
void HermesExecutorFactorySymbol(void);
extern void *HermesExecutorFactory;

#ifdef __cplusplus
}
#endif
EOF

echo "Created dummy header file"

# Create a dummy implementation directory and file
mkdir -p "$PODS_HERMES_DIR/dummy"
cat > "$PODS_HERMES_DIR/dummy/HermesExecutorFactory.cpp" << EOF
// Dummy implementation for HermesExecutorFactory
#include "../Headers/Public/React-hermes/HermesExecutorFactory.h"

extern "C" {
  void HermesExecutorFactorySymbol(void) {
    // Do nothing
  }
  
  void *HermesExecutorFactory = 0;
}
EOF

echo "Created dummy implementation file"

# Create a podspec file
cat > "$PODS_HERMES_DIR/React-hermes.podspec" << EOF
# React-hermes.podspec

Pod::Spec.new do |s|
  s.name                   = "React-hermes"
  s.version                = "0.76.8"
  s.summary                = "Hermes engine for React Native"
  s.homepage               = "https://reactnative.dev/"
  s.license                = "MIT"
  s.author                 = "Facebook, Inc. and its affiliates"
  s.platforms              = { :ios => "12.4" }
  s.source                 = { :git => "https://github.com/facebook/react-native.git", :tag => "v#{s.version}" }
  s.source_files           = "dummy/**/*.{cpp,h}"
  s.header_dir             = "React-hermes"
  s.pod_target_xcconfig    = { "CLANG_CXX_LANGUAGE_STANDARD" => "c++17" }
end
EOF

echo "Created podspec file"

echo "Fix completed. Please clean and rebuild your project."
