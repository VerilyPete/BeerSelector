#!/bin/sh
# Test workflows need a resource file, not production service credentials.
set -eu
native_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
config="$native_dir/Resources/ServiceConfiguration.plist"
if [ ! -f "$config" ]; then
    /usr/bin/plutil -create xml1 "$config"
fi
