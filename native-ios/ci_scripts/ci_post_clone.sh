#!/bin/sh
# Test workflows use an empty resource; distribution requires explicit configuration.
set -eu
native_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
config="$native_dir/Resources/ServiceConfiguration.plist"
if [ "${BEERSELECTOR_DISTRIBUTION:-}" = "external" ]; then
    python3 "$native_dir/ci_scripts/write-distribution-config.py" "$config"
    exit 0
fi
if [ ! -f "$config" ]; then
    /usr/bin/plutil -create xml1 "$config"
fi
