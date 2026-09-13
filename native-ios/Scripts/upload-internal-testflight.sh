#!/bin/sh
set -eu
# Keep Xcode packaging on Apple's matched rsync/toolchain binaries.
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH
: "${1:?Usage: upload-internal-testflight.sh path/to/BeerSelectorNative.xcarchive}"
native_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
options="$native_dir/Distribution/InternalTestFlight.plist"
python3 - "$options" "$1" <<'PY'
import pathlib, plistlib, sys
options = plistlib.loads(pathlib.Path(sys.argv[1]).read_bytes())
assert options.get('testFlightInternalTestingOnly') is True, 'Refusing upload: internal-only protection is required'
assert options.get('manageAppVersionAndBuildNumber') is False, 'Refusing upload-time build renumbering'
assert options.get('uploadSymbols') is True, 'Refusing upload without crash symbols'
assert options.get('method') == 'app-store-connect' and options.get('destination') == 'upload'
archive = pathlib.Path(sys.argv[2])
info = plistlib.loads((archive / 'Info.plist').read_bytes())
assert info['ApplicationProperties']['CFBundleIdentifier'] == 'org.verily.FSbeerselector', 'Wrong app archive'
build = str(info['ApplicationProperties']['CFBundleVersion'])
assert build.isdecimal() and int(build) >= 60, 'Build must be at least 60: previous 1.1.0 release was 59'
assert list((archive / 'dSYMs').glob('BeerSelectorNative.app.dSYM')), 'Missing app dSYM'
PY
exec xcodebuild -exportArchive -archivePath "$1" -exportOptionsPlist "$options" \
    -exportPath "${BEERSELECTOR_INTERNAL_EXPORT_DIR:-${TMPDIR:-/tmp}/BeerSelectorNative-internal-export}" \
    -allowProvisioningUpdates
