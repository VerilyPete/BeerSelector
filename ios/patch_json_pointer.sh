#!/bin/bash

# Script to patch json_pointer.cpp to conditionally include char_traits<unsigned char> definition

# Find the json_pointer.cpp file in the Pods directory
JSON_POINTER_FILE=$(find "$(pwd)/Pods" -name "json_pointer.cpp" -type f)

if [ -z "$JSON_POINTER_FILE" ]; then
  echo "Error: json_pointer.cpp not found."
  exit 1
fi

echo "Found json_pointer.cpp at: $JSON_POINTER_FILE"

# Create a backup
cp "$JSON_POINTER_FILE" "${JSON_POINTER_FILE}.bak"

# Apply the patch
sed -i '' 's/namespace std {/\/\/ char_traits<unsigned char> is now defined in the prefix header\n#ifndef _RCT_FOLLY_PREFIX_PCH\nnamespace std {/g' "$JSON_POINTER_FILE"
sed -i '' 's/} \/\/ namespace std/}\n#endif \/\/ _RCT_FOLLY_PREFIX_PCH\n\/\/ namespace std/g' "$JSON_POINTER_FILE"

echo "Patch applied to json_pointer.cpp"

# Check if the patch was applied correctly
grep -A3 "_RCT_FOLLY_PREFIX_PCH" "$JSON_POINTER_FILE" || echo "Warning: Patch may not have been applied correctly."

exit 0 