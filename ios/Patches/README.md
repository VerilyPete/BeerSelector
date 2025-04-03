# iOS 18 SDK & Xcode 16 Compatibility Patches

This directory contains patches for compatibility with iOS 18 SDK and Xcode 16. The main issues addressed are:

1. `char_traits<unsigned char>` redefinition
2. `string_view` compatibility problems

## Files Modified

### 1. Prefix Headers
- `ios/RCT-Folly-prefix.pch`: Custom implementation of `char_traits<unsigned char>` for RCT-Folly
- `ios/React-rendererdebug-prefix.pch`: Custom implementation of `char_traits<unsigned char>` for React-rendererdebug

### 2. Patching Scripts
- `ios/patch_char_traits.sh`: Unified script to patch all files with `char_traits<unsigned char>` definitions
- `ios/find_char_traits_defs.sh`: Utility script to find problematic files with `char_traits<unsigned char>` definitions

### 3. Source Files Patched
- `ios/Pods/RCT-Folly/folly/json_pointer.cpp`: Patched to conditionally include `char_traits<unsigned char>` definition
- `node_modules/react-native/ReactCommon/react/renderer/debug/DebugStringConvertible.cpp`: Patched to conditionally include `char_traits<unsigned char>` definition
- `ios/Pods/RCT-Folly/folly/String.cpp`: Patched to conditionally include `char_traits<unsigned char>` definition
- `ios/Pods/RCT-Folly/folly/detail/SplitStringSimd.cpp`: Patched to conditionally include `char_traits<unsigned char>` definition
- `ios/Pods/RCT-Folly/folly/Unicode.cpp`: Patched to conditionally include `char_traits<unsigned char>` definition

### 4. Documentation
- `ios/Patches/json_pointer_patch.h`: Documentation of the patch applied to `json_pointer.cpp`
- `ios/Patches/debug_string_convertible_patch.h`: Documentation of the patch applied to `DebugStringConvertible.cpp`

### 5. Podfile Modifications
- Added prefix header application to the RCT-Folly and React-rendererdebug targets
- Added preprocessor definitions to disable string_view and enable c++17 compatibility features
- Added execution of the unified patch script during post_install phase

## Common Errors Fixed

1. `implicit instantiation of undefined template 'std::char_traits<unsigned char>'` in string_view
2. `redefinition of 'char_traits<unsigned char>'` in multiple files:
   - json_pointer.cpp
   - DebugStringConvertible.cpp
   - String.cpp
   - SplitStringSimd.cpp
   - Unicode.cpp

## How to Apply Patches

These patches are automatically applied during `pod install`. If you need to apply them manually:

1. Run the unified patch script: 
   ```
   cd ios && ./patch_char_traits.sh
   ```
2. Make sure the prefix headers are correctly set for the targets in the Xcode project

## Troubleshooting

If you still encounter issues:

1. Delete the Pods directory: `rm -rf ios/Pods`
2. Clear CocoaPods cache: `pod cache clean --all`
3. Reinstall pods: `cd ios && pod install`
4. Run the utility script to find problematic files: `cd ios && ./find_char_traits_defs.sh` 