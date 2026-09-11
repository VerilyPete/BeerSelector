#!/bin/sh
set -eu
: "${BEERSELECTOR_TEST_DESTINATION:?Set an isolated simulator destination, e.g. platform=iOS Simulator,name=iPhone 17 Pro}"
case "$BEERSELECTOR_TEST_DESTINATION" in
    'platform=iOS Simulator,'*) ;;
    *) echo 'Use an isolated simulator for automated tests.' >&2; exit 2 ;;
esac
native_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec xcodebuild -project "$native_dir/BeerSelectorNative.xcodeproj" \
    -scheme "${BEERSELECTOR_TEST_SCHEME:-BeerSelectorNative}" -testPlan "${BEERSELECTOR_TEST_PLAN:-All}" \
    -destination "$BEERSELECTOR_TEST_DESTINATION" \
    -parallel-testing-enabled "${BEERSELECTOR_TEST_PARALLEL:-YES}" \
    -maximum-parallel-testing-workers 2 \
    -derivedDataPath "${BEERSELECTOR_TEST_BUILD_DIR:-${TMPDIR:-/tmp}/BeerSelectorNative-tests}" \
    CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES SWIFT_TREAT_WARNINGS_AS_ERRORS=NO \
    test "$@"
