#!/bin/bash

# Script to patch all files that define char_traits<unsigned char> to prevent redefinition errors

echo "Starting char_traits<unsigned char> patching process..."

# Patch RCT-Folly/json_pointer.cpp
JSON_POINTER_FILE=$(find "$(pwd)/Pods" -name "json_pointer.cpp" -type f)
if [ -n "$JSON_POINTER_FILE" ]; then
  echo "Found json_pointer.cpp at: $JSON_POINTER_FILE"
  
  # Check if already patched
  if grep -q "_RCT_FOLLY_PREFIX_PCH" "$JSON_POINTER_FILE"; then
    echo "json_pointer.cpp is already patched. Skipping."
  else
    # Create a backup
    cp "$JSON_POINTER_FILE" "${JSON_POINTER_FILE}.bak" 2>/dev/null || echo "Warning: Could not create backup of json_pointer.cpp (permission denied)"
    
    # Apply the patch
    # First check if the file already has namespace std declaration
    if grep -q "namespace std {" "$JSON_POINTER_FILE"; then
      # First insert defines exactly once at the top of the file
      sed -i '' '1s/^/\/\/ char_traits<unsigned char> is now defined in the prefix header\n#ifndef _RCT_FOLLY_PREFIX_PCH\n/' "$JSON_POINTER_FILE"
      
      # Then find the first occurrence of namespace std and wrap it
      sed -i '' '/namespace std {/,/} \/\/ namespace std/ {
        /namespace std {/i\
        // namespace std begins
        /} \/\/ namespace std/a\
        #endif // _RCT_FOLLY_PREFIX_PCH\
        // namespace std ends
      }' "$JSON_POINTER_FILE"
    else
      echo "Warning: Could not find 'namespace std {' in json_pointer.cpp"
    fi
    
    # Check if patch was applied
    if grep -q "_RCT_FOLLY_PREFIX_PCH" "$JSON_POINTER_FILE"; then
      echo "Patch applied to json_pointer.cpp"
    else
      echo "Warning: Could not patch json_pointer.cpp"
    fi
  fi
else
  echo "json_pointer.cpp not found. Skipping."
fi

# Function to patch a file
patch_file() {
  local file="$1"
  local backup="${file}.bak"
  local prefix_define="$2"
  
  if [ ! -f "$file" ]; then
    echo "File not found: $file"
    return 1
  fi
  
  echo "Processing file: $file"
  
  # Check if already patched
  if grep -q "$prefix_define" "$file"; then
    echo "File is already patched. Skipping."
    return 0
  fi
  
  # Create a backup
  cp "$file" "$backup" 2>/dev/null || echo "Warning: Could not create backup of $(basename "$file") (permission denied)"
  
  # Apply the patch - improved approach to avoid duplicate patches
  
  # First check if the file already has namespace std declaration
  if grep -q "namespace std {" "$file"; then
    # First insert defines exactly once at the top of the file
    sed -i '' "1s/^/\/\/ char_traits<unsigned char> is now defined in the prefix header\n#ifndef $prefix_define\n/" "$file"
    
    # Then find the first occurrence of namespace std and wrap it
    sed -i '' "/namespace std {/,/} \/\/ namespace std/ {
      /namespace std {/i\\
      // namespace std begins
      /} \/\/ namespace std/a\\
      #endif \/\/ $prefix_define\\
      // namespace std ends
    }" "$file"
  else
    echo "Warning: Could not find 'namespace std {' in $(basename "$file")"
    return 1
  fi
  
  # Check if patch was applied
  if grep -q "$prefix_define" "$file"; then
    echo "Patch applied to $(basename "$file")"
    return 0
  else
    echo "Warning: Could not patch $(basename "$file")"
    return 1
  fi
}

# Find and patch DebugStringConvertible.cpp in node_modules
DEBUG_STRING_FILE=$(cd .. && find "$(pwd)/node_modules" -name "DebugStringConvertible.cpp" -type f)
if [ -n "$DEBUG_STRING_FILE" ]; then
  echo "Found DebugStringConvertible.cpp at: $DEBUG_STRING_FILE"
  patch_file "$DEBUG_STRING_FILE" "_REACT_RENDERERDEBUG_PREFIX_PCH"
else
  echo "DebugStringConvertible.cpp not found in node_modules. Skipping."
fi

# Find and patch all files in React-jsinspector module
echo "Searching for React-jsinspector files with char_traits<unsigned char> definitions..."
JSINSPECTOR_FILES=$(find "$(pwd)/Pods/React-jsinspector" -type f -name "*.cpp" -o -name "*.h" | xargs grep -l "char_traits<unsigned char>" 2>/dev/null || true)
for file in $JSINSPECTOR_FILES; do
  patch_file "$file" "_REACT_JSINSPECTOR_PREFIX_PCH"
done

# Find and patch all other files with char_traits<unsigned char> definition in Pods directory
echo "Searching for other files defining char_traits<unsigned char>..."
CHAR_TRAITS_FILES=$(find "$(pwd)/Pods" -type f -name "*.cpp" -o -name "*.h" | xargs grep -l "char_traits<unsigned char>" 2>/dev/null || true)

for file in $CHAR_TRAITS_FILES; do
  # Skip already processed files
  if [[ "$file" != "$JSON_POINTER_FILE" && ! "$file" =~ "React-jsinspector" ]]; then
    patch_file "$file" "_RCT_FOLLY_PREFIX_PCH"
  fi
done

# Also check for RuntimeTargetDebuggerSessionObserver.cpp in node_modules
RUNTIME_OBSERVER_FILE=$(cd .. && find "$(pwd)/node_modules" -name "RuntimeTargetDebuggerSessionObserver.cpp" -type f)
if [ -n "$RUNTIME_OBSERVER_FILE" ]; then
  echo "Found RuntimeTargetDebuggerSessionObserver.cpp at: $RUNTIME_OBSERVER_FILE"
  patch_file "$RUNTIME_OBSERVER_FILE" "_REACT_JSINSPECTOR_PREFIX_PCH"
else
  echo "RuntimeTargetDebuggerSessionObserver.cpp not found in node_modules. Skipping."
fi

echo "Patching process complete."
exit 0 