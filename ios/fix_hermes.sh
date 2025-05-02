#!/bin/bash

# Define paths
BUILD_DIR="$HOME/Library/Developer/Xcode/DerivedData"
FINDER_DIR=$(find "$BUILD_DIR" -name "BeerSelector-*" -type d -depth 1 | head -n 1)

if [ -z "$FINDER_DIR" ]; then
  echo "Could not find BeerSelector build directory"
  exit 1
fi

PRODUCTS_DIR="$FINDER_DIR/Build/Products"
DEBUG_DIR="$PRODUCTS_DIR/Debug-iphoneos"

if [ ! -d "$DEBUG_DIR" ]; then
  echo "Debug directory not found, creating it"
  mkdir -p "$DEBUG_DIR/React-hermes"
fi

HERMES_LIB="$DEBUG_DIR/React-hermes/libReact-hermes.a"

# Create a proper empty archive file
echo "Creating a properly formatted empty archive"
# First make sure the file doesn't exist
rm -f "$HERMES_LIB"

# Create a proper dummy C file
TEMP_DIR=$(mktemp -d)
DUMMY_SRC="$TEMP_DIR/dummy.c"
DUMMY_OBJ="$TEMP_DIR/dummy.o"

echo "void dummy_function() {}" > "$DUMMY_SRC"
xcrun clang -c "$DUMMY_SRC" -o "$DUMMY_OBJ"

# Create archive with the dummy object
xcrun ar rcs "$HERMES_LIB" "$DUMMY_OBJ"

# Clean up temp files
rm -rf "$TEMP_DIR"

echo "Created proper empty libReact-hermes.a at: $HERMES_LIB"
echo "Now try building your project again"
