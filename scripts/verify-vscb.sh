#!/bin/bash
#
# verify-vscb.sh - Verify vscb CLI installation
#
# This script checks that vscb is properly installed and functional.
# Can be run standalone or called by install-vscb.sh
#
# Usage:
#   bash scripts/verify-vscb.sh
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Emoji support detection
if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CHECK="✅"
    CROSS="❌"
    WARN="⚠️"
    INFO="ℹ️"
else
    CHECK="[OK]"
    CROSS="[FAIL]"
    WARN="[WARN]"
    INFO="[INFO]"
fi

# Track failures
FAILURES=0

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}${CHECK} $1${NC}"
}

print_error() {
    echo -e "${RED}${CROSS} $1${NC}"
    ((FAILURES++))
}

print_warning() {
    echo -e "${YELLOW}${WARN} $1${NC}"
}

print_info() {
    echo -e "${BLUE}${INFO} $1${NC}"
}

print_header "🔍 Verifying vscb Installation"

# ==========================================
# CHECK 1: Command Availability
# ==========================================
print_info "Check 1: Command availability..."

if command -v vscb &> /dev/null; then
    VSCB_PATH=$(which vscb)
    print_success "vscb command found: $VSCB_PATH"
else
    print_error "vscb command not found in PATH"
    echo ""
    echo "  The vscb command is not available. Please run:"
    echo "    bash scripts/install-vscb.sh"
    echo ""
    exit 1
fi

echo ""

# ==========================================
# CHECK 2: Version Information
# ==========================================
print_info "Check 2: Version information..."

if VSCB_VERSION=$(vscb --version 2>&1); then
    VERSION_LINE=$(echo "$VSCB_VERSION" | head -1)
    print_success "Version: $VERSION_LINE"

    # Extract and display details
    if echo "$VERSION_LINE" | grep -q "@vsc-bridge/cli"; then
        print_success "Package name correct: @vsc-bridge/cli"
    else
        print_warning "Unexpected package name format"
    fi
else
    print_error "vscb --version failed"
    echo ""
    echo "  Output: $VSCB_VERSION"
fi

echo ""

# ==========================================
# CHECK 3: Help Command
# ==========================================
print_info "Check 3: Help command..."

if vscb --help &> /dev/null; then
    print_success "vscb --help works"
else
    print_error "vscb --help failed"
fi

echo ""

# ==========================================
# CHECK 4: Commands Available
# ==========================================
print_info "Check 4: Available commands..."

EXPECTED_COMMANDS=("config" "exec" "mcp" "script" "status")
HELP_OUTPUT=$(vscb --help 2>&1)

for cmd in "${EXPECTED_COMMANDS[@]}"; do
    if echo "$HELP_OUTPUT" | grep -q "^  $cmd "; then
        print_success "Command available: $cmd"
    else
        print_error "Command missing: $cmd"
    fi
done

echo ""

# ==========================================
# CHECK 5: Installation Type
# ==========================================
print_info "Check 5: Installation type..."

if [ -L "$VSCB_PATH" ]; then
    LINK_TARGET=$(readlink "$VSCB_PATH" 2>/dev/null || echo "unknown")
    print_success "Installed via symlink (npm link)"
    echo "  Link target: $LINK_TARGET"
elif [ -f "$VSCB_PATH" ]; then
    print_success "Installed as regular file"
else
    print_warning "Installation type unclear"
fi

echo ""

# ==========================================
# CHECK 6: Manifest File
# ==========================================
print_info "Check 6: Script manifest..."

# Try to detect the installation directory
NPM_PREFIX=$(npm config get prefix 2>/dev/null || echo "")
if [ -n "$NPM_PREFIX" ]; then
    MANIFEST_PATH="$NPM_PREFIX/lib/node_modules/@vsc-bridge/cli/dist/manifest.json"

    if [ -f "$MANIFEST_PATH" ]; then
        MANIFEST_SIZE=$(du -h "$MANIFEST_PATH" | cut -f1)

        # Count scripts in manifest
        if command -v jq &> /dev/null; then
            SCRIPT_COUNT=$(jq '[.scripts[]] | length' "$MANIFEST_PATH" 2>/dev/null || echo "unknown")
            print_success "manifest.json found ($MANIFEST_SIZE, $SCRIPT_COUNT scripts)"
        else
            print_success "manifest.json found ($MANIFEST_SIZE)"
        fi
    else
        print_warning "manifest.json not found at expected location"
        echo "  Expected: $MANIFEST_PATH"
    fi
else
    print_warning "Could not determine npm prefix"
fi

echo ""

# ==========================================
# CHECK 7: Connection Status (Optional)
# ==========================================
print_info "Check 7: Extension Host connection..."

if VSCB_STATUS=$(vscb status 2>&1); then
    if echo "$VSCB_STATUS" | grep -iq "connected\|success"; then
        print_success "Extension Host is running and connected"
    else
        print_warning "Extension Host connection unclear"
        echo "  Status output: $VSCB_STATUS"
    fi
else
    print_warning "Extension Host not running (this is normal if VS Code is not open)"
    echo "  To start the Extension Host, open VS Code with the project"
fi

echo ""

# ==========================================
# SUMMARY
# ==========================================
print_header "📊 Verification Summary"

if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}${CHECK} All checks passed! vscb is installed correctly.${NC}"
    echo ""
    echo "Next steps:"
    echo "  - Start VS Code with your project open"
    echo "  - Install the VS Code extension (if not already done)"
    echo "  - Run: vscb status"
    echo "  - Run: vscb script list"
    echo ""
    exit 0
else
    echo -e "${RED}${CROSS} $FAILURES check(s) failed${NC}"
    echo ""
    echo "Please review the errors above and:"
    echo "  - Reinstall vscb: bash scripts/install-vscb.sh"
    echo "  - Check your PATH configuration"
    echo "  - Ensure build completed successfully"
    echo ""
    exit 1
fi
