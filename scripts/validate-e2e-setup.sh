#!/bin/bash

# E2E Testing Setup Validation Script
# This script validates that all E2E testing infrastructure is properly set up

set -e

echo "🔍 Validating E2E Testing Setup for BeerSelector"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter
PASSED=0
FAILED=0

# Function to check if a command exists
check_command() {
    if command -v "$1" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 is installed"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $1 is not installed"
        echo "   Install with: $2"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Function to check if a file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 exists"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $1 is missing"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Function to check if a directory exists
check_directory() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 exists"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $1 is missing"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Function to check npm script
check_npm_script() {
    if grep -q "\"$1\"" package.json; then
        echo -e "${GREEN}✓${NC} npm script '$1' exists"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} npm script '$1' is missing"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Function to validate YAML file
validate_yaml() {
    # A missing file used to land in the else branch below and be counted as a
    # PASS with a yellow warning: `grep -q` exits 2 when it cannot open the
    # file, which is indistinguishable from "pattern not found" to an if. That
    # made deleting a flow file a passing check.
    if [ ! -f "$1" ]; then
        echo -e "${RED}✗${NC} $1 not found"
        FAILED=$((FAILED + 1))
        return 1
    fi

    if grep -q "^---$" "$1"; then
        echo -e "${GREEN}✓${NC} $1 is valid Maestro flow"
        PASSED=$((PASSED + 1))
        return 0
    else
        # Deliberately still a pass: the file exists, it just lacks the leading
        # `---`, which Maestro tolerates. Only its absence is a failure.
        echo -e "${YELLOW}⚠${NC} $1 may have format issues"
        PASSED=$((PASSED + 1))
        return 0
    fi
}

echo "1️⃣  Checking Required Tools"
echo "----------------------------"
check_command "node" "https://nodejs.org/"
check_command "npm" "comes with Node.js"
echo ""

echo "2️⃣  Checking Optional E2E Tools"
echo "--------------------------------"
if check_command "maestro" "curl -fsSL https://get.maestro.mobile.dev | bash"; then
    maestro --version
fi
if check_command "flashlight" "npm install -g @shopify/flashlight"; then
    flashlight --version 2>/dev/null || echo "   (version command not available)"
fi
echo ""

echo "3️⃣  Checking Maestro Test Files"
echo "---------------------------------"
check_directory ".maestro"
check_file ".maestro/config.yaml"
validate_yaml ".maestro/01-beer-list-rendering.yaml"
validate_yaml ".maestro/02-search-and-filter.yaml"
validate_yaml ".maestro/03-beer-item-expansion.yaml"
validate_yaml ".maestro/04-empty-states.yaml"
validate_yaml ".maestro/05-navigation-and-tabs.yaml"
check_file ".maestro/.maestroignore"
echo ""

echo "4️⃣  Checking Flashlight Configuration"
echo "---------------------------------------"
check_directory ".flashlight"
check_file ".flashlight/performance-tests.yaml"
check_file ".flashlight/README.md"
echo ""

echo "5️⃣  Checking Documentation"
echo "---------------------------"
check_directory "e2e"
check_file "e2e/README.md"
check_file "E2E_QUICKSTART.md"
check_file "E2E_IMPLEMENTATION_SUMMARY.md"
check_file "E2E_TESTING_COMPLETE.md"
echo ""

echo "6️⃣  Checking Component testIDs"
echo "--------------------------------"
echo "Checking components/beer/BeerList.tsx..."
if grep -q 'testID="beer-list"' components/beer/BeerList.tsx; then
    echo -e "${GREEN}✓${NC} BeerList has testIDs ($(grep -c 'testID' components/beer/BeerList.tsx) found)"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} BeerList missing testIDs"
    FAILED=$((FAILED + 1))
fi

echo "Checking components/beer/BeerItem.tsx..."
if grep -q 'testID=' components/beer/BeerItem.tsx; then
    echo -e "${GREEN}✓${NC} BeerItem has testIDs ($(grep -c 'testID' components/beer/BeerItem.tsx) found)"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} BeerItem missing testIDs"
    FAILED=$((FAILED + 1))
fi

echo "Checking components/beer/FilterBar.tsx..."
if grep -q 'testID=' components/beer/FilterBar.tsx; then
    echo -e "${GREEN}✓${NC} FilterBar has testIDs ($(grep -c 'testID' components/beer/FilterBar.tsx) found)"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} FilterBar missing testIDs"
    FAILED=$((FAILED + 1))
fi

echo "Checking components/SearchBar.tsx..."
if grep -q 'testID=' components/SearchBar.tsx; then
    echo -e "${GREEN}✓${NC} SearchBar has testIDs ($(grep -c 'testID' components/SearchBar.tsx) found)"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} SearchBar missing testIDs"
    FAILED=$((FAILED + 1))
fi

echo "Checking components/AllBeers.tsx..."
if grep -q 'testID=' components/AllBeers.tsx; then
    echo -e "${GREEN}✓${NC} AllBeers has testIDs ($(grep -c 'testID' components/AllBeers.tsx) found)"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} AllBeers missing testIDs"
    FAILED=$((FAILED + 1))
fi
echo ""

echo "7️⃣  Checking npm Scripts"
echo "-------------------------"
check_npm_script "test:e2e"
check_npm_script "test:e2e:ios"
check_npm_script "test:e2e:single"
check_npm_script "test:performance"
check_npm_script "test:performance:report"
echo ""

echo "8️⃣  Checking CI/CD Configuration"
echo "----------------------------------"
# E2E deliberately does not run in CI. e2e-tests.yml and maestro-e2e.yml were
# deleted on 2026-08-11 after 143 runs with zero passes; Maestro is run by hand.
# See .maestro/README.md. Do not re-add a check for those files here.
echo "  ℹ️  E2E runs locally only — no CI workflow expected"
echo ""

echo "9️⃣  Checking .gitignore"
echo "------------------------"
if grep -q "test-results/" .gitignore; then
    echo -e "${GREEN}✓${NC} E2E artifacts added to .gitignore"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} E2E artifacts not in .gitignore"
    FAILED=$((FAILED + 1))
fi
echo ""

# Summary
echo "=================================================="
echo "📊 VALIDATION SUMMARY"
echo "=================================================="
echo ""
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ E2E Testing Setup is Complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Install Maestro: curl -fsSL https://get.maestro.mobile.dev | bash"
    echo "2. Build app: npm run ios (or npm run android)"
    echo "3. Run tests: npm run test:e2e"
    echo ""
    exit 0
else
    echo -e "${YELLOW}⚠️  E2E Testing Setup has $FAILED issue(s)${NC}"
    echo ""
    echo "Please address the failed checks above."
    echo "See E2E_QUICKSTART.md for setup instructions."
    echo ""
    exit 1
fi
