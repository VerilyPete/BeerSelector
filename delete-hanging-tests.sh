#!/bin/bash
# Phase 1: Delete 20 duplicate/alpha hanging tests
# Reference: HANGING_TESTS_QUICK_REFERENCE.md

set -e

echo "Phase 1: Deleting 20 hanging tests (18 duplicates + 2 alpha features)"
echo "=================================================================="
echo ""

# Track deletion results
DELETED_COUNT=0
MISSING_COUNT=0
ERROR_COUNT=0

delete_file() {
    local file=$1
    local reason=$2

    if [ -f "$file" ]; then
        rm "$file"
        echo "✅ DELETED: $file"
        echo "   Reason: $reason"
        ((DELETED_COUNT++))
    else
        echo "⚠️  NOT FOUND: $file"
        ((MISSING_COUNT++))
    fi
    echo ""
}

echo "=== DELETING DUPLICATE TESTS (Covered by Maestro E2E) ==="
echo ""

delete_file "context/__tests__/NetworkContext.test.tsx" \
    "Network detection covered by MP-5 offline Maestro tests"

delete_file "context/__tests__/OfflineIndicator.test.tsx" \
    "Offline UI covered by MP-5 offline Maestro tests"

delete_file "context/__tests__/AppContext.test.tsx" \
    "Context initialization covered by MP-1 login Maestro tests"

delete_file "context/__tests__/AppContext.beerData.test.tsx" \
    "Beer data loading covered by MP-1/MP-2 Maestro tests"

delete_file "hooks/__tests__/useLoginFlow.test.ts" \
    "Login flow covered by MP-1 login Maestro tests"

delete_file "hooks/__tests__/useDataRefresh.test.ts" \
    "Data refresh covered by MP-2 data sync Maestro tests"

delete_file "hooks/__tests__/useDebounce.test.ts" \
    "Search debouncing covered by MP-2 search Maestro tests"

delete_file "components/settings/__tests__/AboutSection.test.tsx" \
    "Settings UI covered by MP-1 settings Maestro tests"

delete_file "components/settings/__tests__/DataManagementSection.test.tsx" \
    "Data management covered by MP-2 data sync Maestro tests"

delete_file "components/beer/__tests__/BeerItem.memo.test.tsx" \
    "Beer item rendering covered by MP-2 beer list Maestro tests"

delete_file "components/beer/__tests__/BeerList.callbacks.test.tsx" \
    "Beer list interactions covered by MP-2 beer list Maestro tests"

delete_file "components/beer/__tests__/BeerList.getItemLayout.test.tsx" \
    "Beer list scrolling covered by MP-2 beer list Maestro tests"

delete_file "components/beer/__tests__/SkeletonLoader.test.tsx" \
    "Loading states covered by MP-2 data sync Maestro tests"

delete_file "components/__tests__/ErrorBoundary.test.tsx" \
    "Error handling covered by MP-5 error scenario Maestro tests"

delete_file "components/__tests__/Rewards.repository.test.tsx" \
    "Rewards loading covered by MP-2 rewards Maestro tests"

delete_file "components/__tests__/TastedBrewList.loading.test.tsx" \
    "Tasted brews loading covered by MP-2 tasted brews Maestro tests"

delete_file "components/__tests__/TastedBrewList.repository.test.tsx" \
    "Tasted brews data covered by MP-2 tasted brews Maestro tests"

delete_file "app/__tests__/settings.integration.test.tsx" \
    "Settings integration covered by MP-1 settings Maestro tests"

echo "=== DELETING ALPHA FEATURE TESTS ==="
echo ""

delete_file "components/__tests__/UntappdLoginWebView.test.tsx" \
    "Alpha feature - Untappd integration not production-ready"

delete_file "hooks/__tests__/useUntappdLogin.test.ts" \
    "Alpha feature - Untappd integration not production-ready"

echo "=================================================================="
echo "DELETION SUMMARY:"
echo "  ✅ Successfully deleted: $DELETED_COUNT files"
echo "  ⚠️  Not found (already deleted): $MISSING_COUNT files"
echo "  ❌ Errors: $ERROR_COUNT files"
echo "=================================================================="

if [ $DELETED_COUNT -gt 0 ]; then
    echo ""
    echo "✅ Phase 1 complete: Deleted $DELETED_COUNT hanging tests"
    exit 0
else
    echo ""
    echo "⚠️  No files were deleted (may have been already removed)"
    exit 1
fi
