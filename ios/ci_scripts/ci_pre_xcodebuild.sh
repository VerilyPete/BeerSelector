#!/bin/bash
cd "$(dirname "$0")/../"
echo "Installing CocoaPods..."
pod install --repo-update
