#!/bin/bash
#
# install-codex.sh - Configure vsc-bridge MCP server for Codex CLI
#
# This script:
# 1. Detects Codex config location (~/.codex/config.toml)
# 2. Checks if vsc-bridge MCP server is already configured
# 3. Adds vsc-bridge MCP server configuration if not present
# 4. Validates configuration
#
# Usage:
#   bash scripts/mcp/install-codex.sh
#
# Supports: Linux, macOS, Windows (Git Bash/WSL)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Emoji for different platforms
if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CHECK="✅"
    CROSS="❌"
    WARN="⚠️"
    INFO="ℹ️"
    ROCKET="🚀"
else
    CHECK="[OK]"
    CROSS="[FAIL]"
    WARN="[WARN]"
    INFO="[INFO]"
    ROCKET=">>>"
fi

# Helper functions
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
}

print_warning() {
    echo -e "${YELLOW}${WARN} $1${NC}"
}

print_info() {
    echo -e "${BLUE}${INFO} $1${NC}"
}

# Detect project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

print_header "${ROCKET} Codex CLI MCP Server Configuration"

echo "Project root: $PROJECT_ROOT"
echo ""

# ==========================================
# STEP 1: Check Prerequisites
# ==========================================
print_info "Step 1: Checking prerequisites..."
echo ""

# Check if vscb is installed
if ! command -v vscb &> /dev/null; then
    print_error "vscb command not found"
    echo ""
    echo "Please install vscb CLI first:"
    echo "  bash scripts/install-vscb.sh"
    exit 1
fi

VSCB_VERSION=$(vscb --version 2>&1 | head -1)
print_success "vscb installed: $VSCB_VERSION"

echo ""

# ==========================================
# STEP 2: Detect Codex Config
# ==========================================
print_info "Step 2: Detecting Codex configuration..."
echo ""

# Codex config location (standard across platforms)
CONFIG_DIR="$HOME/.codex"
CONFIG_FILE="$CONFIG_DIR/config.toml"

echo "Config directory: $CONFIG_DIR"
echo "Config file: $CONFIG_FILE"
echo ""

# Create config directory if it doesn't exist
if [ ! -d "$CONFIG_DIR" ]; then
    print_info "Creating config directory: $CONFIG_DIR"
    mkdir -p "$CONFIG_DIR"
fi

# ==========================================
# STEP 3: Check Existing Configuration
# ==========================================
print_info "Step 3: Checking existing configuration..."
echo ""

CONFIG_EXISTS=false
MCP_CONFIGURED=false

if [ -f "$CONFIG_FILE" ]; then
    CONFIG_EXISTS=true
    print_success "Config file exists: $CONFIG_FILE"
    
    # Check if vsc-bridge is already configured
    if grep -q '\[mcp_servers\.vsc-bridge\]' "$CONFIG_FILE" || grep -q '\[mcp_servers\."vsc-bridge"\]' "$CONFIG_FILE"; then
        MCP_CONFIGURED=true
        print_success "vsc-bridge MCP server already configured"
        echo ""
        echo "Current configuration:"
        # Extract vsc-bridge section
        awk '/\[mcp_servers\.vsc-bridge\]|\[mcp_servers\."vsc-bridge"\]/,/^\[/ {print}' "$CONFIG_FILE" | grep -v '^$' | head -n -1 || \
        awk '/\[mcp_servers\.vsc-bridge\]|\[mcp_servers\."vsc-bridge"\]/,EOF {print}' "$CONFIG_FILE"
        echo ""
        echo "═══════════════════════════════════════════════════════════"
        echo ""
        echo -e "${GREEN}No changes needed - vsc-bridge is already configured!${NC}"
        echo ""
        echo "To verify configuration:"
        echo "  cat $CONFIG_FILE"
        echo ""
        exit 0
    else
        print_info "vsc-bridge not found in existing config"
    fi
else
    print_info "Config file does not exist (will create)"
fi

echo ""

# ==========================================
# STEP 4: Add MCP Server Configuration
# ==========================================
print_info "Step 4: Adding vsc-bridge MCP server..."
echo ""

# Determine workspace path (use current directory or PROJECT_ROOT)
WORKSPACE_PATH="$PROJECT_ROOT"
echo "Workspace path: $WORKSPACE_PATH"

# Create backup if config exists
if [ "$CONFIG_EXISTS" = true ]; then
    BACKUP_FILE="$CONFIG_FILE.backup-$(date +%Y-%m-%d_%H-%M-%S)"
    cp "$CONFIG_FILE" "$BACKUP_FILE"
    print_info "Backup created: $BACKUP_FILE"
fi

# Add vsc-bridge MCP server configuration to TOML
if [ "$CONFIG_EXISTS" = true ]; then
    # Append to existing file
    echo "" >> "$CONFIG_FILE"
    echo "[mcp_servers.vsc-bridge]" >> "$CONFIG_FILE"
    echo "command = \"vscb\"" >> "$CONFIG_FILE"
    echo "args = [\"mcp\", \"--workspace\", \"$WORKSPACE_PATH\"]" >> "$CONFIG_FILE"
    echo "" >> "$CONFIG_FILE"
    echo "[mcp_servers.vsc-bridge.env]" >> "$CONFIG_FILE"
else
    # Create new file with vsc-bridge configuration
    cat > "$CONFIG_FILE" <<EOF
[mcp_servers.vsc-bridge]
command = "vscb"
args = ["mcp", "--workspace", "$WORKSPACE_PATH"]

[mcp_servers.vsc-bridge.env]
EOF
fi

print_success "Configuration written to: $CONFIG_FILE"
echo ""

# ==========================================
# STEP 5: Validate Configuration
# ==========================================
print_info "Step 5: Validating configuration..."
echo ""

if [ ! -f "$CONFIG_FILE" ]; then
    print_error "Config file was not created"
    exit 1
fi

# Verify vsc-bridge section exists
if grep -q '\[mcp_servers\.vsc-bridge\]' "$CONFIG_FILE" || grep -q '\[mcp_servers\."vsc-bridge"\]' "$CONFIG_FILE"; then
    print_success "vsc-bridge MCP server configured"
else
    print_error "vsc-bridge section not found in config"
    exit 1
fi

# Check TOML syntax if toml command is available
if command -v toml &> /dev/null; then
    if toml validate "$CONFIG_FILE" 2>/dev/null; then
        print_success "TOML syntax valid"
    else
        print_warning "TOML validation failed (config may still work)"
    fi
else
    print_warning "Cannot validate TOML syntax (toml command not available)"
fi

echo ""

# ==========================================
# SUCCESS!
# ==========================================
print_header "${CHECK} Configuration Complete!"

echo -e "${GREEN}vsc-bridge MCP server is now configured for Codex CLI!${NC}"
echo ""
echo "Configuration:"
echo "  File: $CONFIG_FILE"
echo "  Workspace: $WORKSPACE_PATH"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "${INFO} Next Steps:"
echo ""
echo "1. Restart Codex CLI (if currently running)"
echo ""
echo "2. Verify Codex can see vsc-bridge tools:"
echo "   - The tools should be available through the MCP server"
echo ""
echo "3. Ensure VS Code extension is running:"
echo "   vscb status"
echo ""
echo "4. Test the MCP server directly:"
echo "   vscb mcp --workspace $WORKSPACE_PATH"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "To view configuration:"
echo "  cat $CONFIG_FILE"
echo ""
echo "To update workspace path, edit the config file or re-run this script."
echo ""
