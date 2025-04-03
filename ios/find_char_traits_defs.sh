#!/bin/bash

# Utility script to find files containing char_traits<unsigned char> definitions
# This can help identify other files that might need patching

echo "Searching for char_traits<unsigned char> definitions in Pods directory..."
find "$(pwd)/Pods" -type f -name "*.cpp" -o -name "*.h" | xargs grep -l "char_traits<unsigned char>" 2>/dev/null || true

echo "Searching for string_view issues in Pods directory..."
find "$(pwd)/Pods" -type f -name "*.cpp" -o -name "*.h" | xargs grep -l "string_view" 2>/dev/null || true

exit 0 