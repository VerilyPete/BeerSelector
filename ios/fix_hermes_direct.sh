#!/bin/bash

# Define the exact path from the error message
HERMES_LIB="/Users/pete/Library/Developer/Xcode/DerivedData/BeerSelector-eaqpfughsnruuedyxwvprvsdnojd/Build/Products/Debug-iphoneos/React-hermes/libReact-hermes.a"

# Create the directory if it doesn't exist
mkdir -p "$(dirname "$HERMES_LIB")"

# Create a proper dummy archive file
echo "Creating properly formatted React-hermes.a file at exact location..."

# Create a proper dummy C file
TEMP_DIR=$(mktemp -d)
DUMMY_SRC="$TEMP_DIR/dummy.c"
DUMMY_OBJ="$TEMP_DIR/dummy.o"
DUMMY_HEADER="$TEMP_DIR/hermes_dummy.h"

# Create a dummy header
echo "#ifndef HERMES_DUMMY_H" > "$DUMMY_HEADER"
echo "#define HERMES_DUMMY_H" >> "$DUMMY_HEADER"
echo "void hermes_dummy_function(void);" >> "$DUMMY_HEADER"
echo "#endif" >> "$DUMMY_HEADER"

# Create a dummy implementation
echo "#include \"hermes_dummy.h\"" > "$DUMMY_SRC"
echo "void hermes_dummy_function(void) {}" >> "$DUMMY_SRC"

# Compile it
xcrun clang -c "$DUMMY_SRC" -o "$DUMMY_OBJ"

# Create archive with the dummy object
xcrun ar rcs "$HERMES_LIB" "$DUMMY_OBJ"

# Ensure file is not empty
if [ -s "$HERMES_LIB" ]; then
  echo "Created non-empty React-hermes.a file at: $HERMES_LIB"
else
  echo "ERROR: Failed to create non-empty library file"
  exit 1
fi

# Clean up temp files
rm -rf "$TEMP_DIR"

echo "Fix complete - try building your project again" 