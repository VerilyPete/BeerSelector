#!/bin/bash

# Script to fix the unterminated conditional directive in json_pointer.cpp

echo "Fixing unterminated conditional directive in json_pointer.cpp..."

JSON_POINTER_FILE=$(find "$(pwd)/Pods" -name "json_pointer.cpp" -type f)
if [ -n "$JSON_POINTER_FILE" ]; then
  echo "Found json_pointer.cpp at: $JSON_POINTER_FILE"
  
  # Create a backup
  cp "$JSON_POINTER_FILE" "${JSON_POINTER_FILE}.fix.bak" 2>/dev/null || echo "Warning: Could not create backup of json_pointer.cpp (permission denied)"
  
  # Use sed to fix the file - replace multiple occurrences of the conditional directive with a single one
  sed -i '' '1,/^#ifndef _RCT_FOLLY_PREFIX_PCH$/!{/^#ifndef _RCT_FOLLY_PREFIX_PCH$/d;}' "$JSON_POINTER_FILE"
  sed -i '' '1,/^\/\/ char_traits<unsigned char> is now defined in the prefix header$/!{/^\/\/ char_traits<unsigned char> is now defined in the prefix header$/d;}' "$JSON_POINTER_FILE"
  
  echo "Fixed json_pointer.cpp"
else
  echo "json_pointer.cpp not found. Skipping."
fi

echo "Fix complete."
exit 0 