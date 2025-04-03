#!/bin/bash

# Script to patch all source files in the React-jsinspector module to prevent char_traits<unsigned char> redefinition issues

echo "Starting React-jsinspector patching process..."

# Find all cpp files in the React-jsinspector module
JSINSPECTOR_DIR="../node_modules/react-native/ReactCommon/jsinspector-modern"
PATCHED_PREFIX='#include <string>
#ifndef _REACT_JSINSPECTOR_PREFIX_PCH
namespace std {
  template <>
  struct char_traits<unsigned char> {
    using char_type = unsigned char;
    using int_type = int;
    using off_type = streamoff;
    using pos_type = streampos;
    using state_type = mbstate_t;
    
    // Basic operations
    static void assign(char_type& c1, const char_type& c2) noexcept { c1 = c2; }
    static bool eq(char_type c1, char_type c2) noexcept { return c1 == c2; }
    static bool lt(char_type c1, char_type c2) noexcept { return c1 < c2; }
    
    // Comparison
    static int compare(const char_type* s1, const char_type* s2, size_t n) {
      for (size_t i = 0; i < n; ++i) {
        if (lt(s1[i], s2[i])) return -1;
        if (lt(s2[i], s1[i])) return 1;
      }
      return 0;
    }
    
    // Length
    static size_t length(const char_type* s) {
      size_t len = 0;
      while (!eq(s[len], char_type(0))) ++len;
      return len;
    }
    
    // Find
    static const char_type* find(const char_type* s, size_t n, const char_type& a) {
      for (size_t i = 0; i < n; ++i) if (eq(s[i], a)) return s + i;
      return nullptr;
    }
    
    // Memory
    static char_type* move(char_type* s1, const char_type* s2, size_t n) {
      if (n == 0) return s1;
      return static_cast<char_type*>(memmove(s1, s2, n));
    }
    
    static char_type* copy(char_type* s1, const char_type* s2, size_t n) {
      if (n == 0) return s1;
      return static_cast<char_type*>(memcpy(s1, s2, n));
    }
    
    static char_type* assign(char_type* s, size_t n, char_type a) {
      for (size_t i = 0; i < n; ++i) s[i] = a;
      return s;
    }
    
    // Eof
    static int_type not_eof(int_type c) noexcept {
      return eq_int_type(c, eof()) ? ~eof() : c;
    }
    
    static char_type to_char_type(int_type c) noexcept {
      return static_cast<char_type>(c);
    }
    
    static int_type to_int_type(char_type c) noexcept {
      return static_cast<int_type>(c);
    }
    
    static bool eq_int_type(int_type c1, int_type c2) noexcept {
      return c1 == c2;
    }
    
    static int_type eof() noexcept {
      return static_cast<int_type>(-1);
    }
  };
}
#endif // _REACT_JSINSPECTOR_PREFIX_PCH'

# Function to patch a file
patch_file() {
  local file="$1"
  local backup="${file}.bak"
  
  if [ ! -f "$file" ]; then
    echo "File not found: $file"
    return 1
  fi
  
  echo "Processing file: $file"
  
  # Check if already patched
  if grep -q "_REACT_JSINSPECTOR_PREFIX_PCH" "$file"; then
    echo "File is already patched. Skipping."
    return 0
  fi
  
  # Create a backup
  cp "$file" "$backup" 2>/dev/null || echo "Warning: Could not create backup of $(basename "$file") (permission denied)"
  
  # Extract the first line (usually license header)
  FIRST_LINE=$(head -n 1 "$file")
  REMAINING=$(tail -n +2 "$file")
  
  # Prepend our fix after the first line
  echo "$FIRST_LINE" > "$file"
  echo "$PATCHED_PREFIX" >> "$file"
  echo "$REMAINING" >> "$file"
  
  # Check if patch was applied
  if grep -q "_REACT_JSINSPECTOR_PREFIX_PCH" "$file"; then
    echo "Patch applied to $(basename "$file")"
    return 0
  else
    echo "Warning: Could not patch $(basename "$file")"
    return 1
  fi
}

# Specifically patch RuntimeTargetDebuggerSessionObserver.cpp
RUNTIME_OBSERVER_FILE="$JSINSPECTOR_DIR/RuntimeTargetDebuggerSessionObserver.cpp"
if [ -f "$RUNTIME_OBSERVER_FILE" ]; then
  echo "Found RuntimeTargetDebuggerSessionObserver.cpp at: $RUNTIME_OBSERVER_FILE"
  patch_file "$RUNTIME_OBSERVER_FILE"
else
  echo "RuntimeTargetDebuggerSessionObserver.cpp not found. Skipping."
fi

# Find and patch all other CPP files in the jsinspector-modern directory
JSINSPECTOR_CPP_FILES=$(find "$JSINSPECTOR_DIR" -name "*.cpp" -type f | grep -v "RuntimeTargetDebuggerSessionObserver.cpp")
for file in $JSINSPECTOR_CPP_FILES; do
  patch_file "$file"
done

echo "React-jsinspector patching process complete."
exit 0 