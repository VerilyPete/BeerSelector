#!/bin/bash

# Script to patch DebugStringConvertible.cpp to conditionally include char_traits<unsigned char> definition

# Find the DebugStringConvertible.cpp file in the Pods directory
DEBUG_STRING_FILE=$(find "$(pwd)/Pods" -name "DebugStringConvertible.cpp" -type f)

if [ -z "$DEBUG_STRING_FILE" ]; then
  echo "Error: DebugStringConvertible.cpp not found."
  exit 1
fi

echo "Found DebugStringConvertible.cpp at: $DEBUG_STRING_FILE"

# Create a backup
cp "$DEBUG_STRING_FILE" "${DEBUG_STRING_FILE}.bak"

# Apply the patch
sed -i '' 's/namespace std {/\/\/ char_traits<unsigned char> is now defined in the prefix header\n#ifndef _RCT_FOLLY_PREFIX_PCH\nnamespace std {/g' "$DEBUG_STRING_FILE"
sed -i '' 's/} \/\/ namespace std/}\n#endif \/\/ _RCT_FOLLY_PREFIX_PCH\n\/\/ namespace std/g' "$DEBUG_STRING_FILE"

echo "Patch applied to DebugStringConvertible.cpp"

# Check if the patch was applied correctly
grep -A3 "_RCT_FOLLY_PREFIX_PCH" "$DEBUG_STRING_FILE" || echo "Warning: Patch may not have been applied correctly."

exit 0 