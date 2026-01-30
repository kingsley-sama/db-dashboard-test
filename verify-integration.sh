#!/bin/bash

# My-App Integration Verification Script
# Run this to verify the integration is working correctly

echo "🔍 Verifying my-app integration..."
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
PASSED=0
FAILED=0

# Function to check file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} Found: $1"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} Missing: $1"
        ((FAILED++))
        return 1
    fi
}

# Function to check directory exists
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} Found: $1"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} Missing: $1"
        ((FAILED++))
        return 1
    fi
}

# Function to check file does not exist
check_removed() {
    if [ ! -e "$1" ]; then
        echo -e "${GREEN}✓${NC} Removed: $1"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} Still exists: $1"
        ((FAILED++))
        return 1
    fi
}

# Function to check file contains string
check_contains() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $1 contains: $2"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $1 missing: $2"
        ((FAILED++))
        return 1
    fi
}

echo "📂 Checking new files..."
check_file "lib/config.ts"
check_file "my-app/lib/auth.ts"
check_file "MY_APP_INTEGRATION.md"
check_file "MY_APP_QUICKSTART.md"
check_file "INTEGRATION_SUMMARY.md"

echo ""
echo "📝 Checking modified files..."
check_file "middleware.ts"
check_file "my-app/app/layout.tsx"
check_file "my-app/components/sidebar.tsx"
check_file "my-app/app/actions/projects.ts"
check_file "my-app/app/actions/threads.ts"

echo ""
echo "🗑️  Checking removed files..."
check_removed "my-app/app/login"
check_removed "my-app/app/login/page.tsx"

echo ""
echo "📋 Checking backed up files..."
check_file "my-app/app/globals.css.backup"

echo ""
echo "🔐 Checking authentication integration..."
check_contains "middleware.ts" "/my-app"
check_contains "middleware.ts" "protectedRoutes"
check_contains "my-app/lib/auth.ts" "requireAuth"
check_contains "my-app/lib/auth.ts" "getCurrentUser"
check_contains "my-app/app/actions/projects.ts" "requireAuth"

echo ""
echo "🎨 Checking theme integration..."
check_contains "my-app/app/layout.tsx" "../../../app/globals.css"
check_contains "my-app/app/layout.tsx" "Manrope"
check_contains "my-app/components/sidebar.tsx" "appConfig"

echo ""
echo "📊 Results:"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
else
    echo -e "${GREEN}Failed: $FAILED${NC}"
fi

echo ""
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Integration looks good.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start dev server: npm run dev"
    echo "2. Visit: http://localhost:3000/my-app"
    echo "3. You should be redirected to login"
    echo "4. Log in and verify access to my-app"
    exit 0
else
    echo -e "${RED}⚠️  Some checks failed. Please review the output above.${NC}"
    exit 1
fi
