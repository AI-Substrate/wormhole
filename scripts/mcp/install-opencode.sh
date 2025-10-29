#!/bin/bash
#
# install-opencode.sh - Configure vsc-bridge MCP server for OpenCode
#
# This script:
# 1. Detects OpenCode config location (~/.config/opencode/opencode.json)
# 2. Checks if vsc-bridge MCP server is already configured
# 3. Adds vsc-bridge MCP server configuration if not present
# 4. Validates configuration
#
# Usage:
#   bash scripts/mcp/install-opencode.sh
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

print_header "${ROCKET} OpenCode MCP Server Configuration"

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

# Check if jq is available (optional)
if command -v jq &> /dev/null; then
    print_success "jq available for JSON manipulation"
    HAS_JQ=true
else
    print_warning "jq not found (will use basic JSON manipulation)"
    HAS_JQ=false
fi

echo ""

# ==========================================
# STEP 2: Detect OpenCode Config
# ==========================================
print_info "Step 2: Detecting OpenCode configuration..."
echo ""

# Determine config directory based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    CONFIG_DIR="$HOME/.config/opencode"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    # Windows (Git Bash/WSL)
    CONFIG_DIR="$HOME/.config/opencode"
else
    print_warning "Unknown OS type: $OSTYPE (defaulting to ~/.config/opencode)"
    CONFIG_DIR="$HOME/.config/opencode"
fi

CONFIG_FILE="$CONFIG_DIR/opencode.json"

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
    if grep -q '"vsc-bridge"' "$CONFIG_FILE"; then
        MCP_CONFIGURED=true
        print_success "vsc-bridge MCP server already configured"
        echo ""
        echo "Current configuration:"
        if [ "$HAS_JQ" = true ]; then
            jq '.mcp."vsc-bridge"' "$CONFIG_FILE"
        else
            grep -A 6 '"vsc-bridge"' "$CONFIG_FILE" || echo "(Could not extract config)"
        fi
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

# Create the MCP server configuration
MCP_CONFIG=$(cat <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "mcp": {
    "vsc-bridge": {
      "type": "local",
      "enabled": true,
      "command": ["vscb", "mcp", "--workspace", "$WORKSPACE_PATH"],
      "environment": {}
    }
  }
}
EOF
)

if [ "$CONFIG_EXISTS" = true ]; then
    # Merge with existing config
    print_info "Merging with existing configuration..."
    
    if [ "$HAS_JQ" = true ]; then
        # Use jq for proper JSON merging
        TEMP_FILE=$(mktemp)
        jq --arg workspace "$WORKSPACE_PATH" \
           '.mcp."vsc-bridge" = {
              "type": "local",
              "enabled": true,
              "command": ["vscb", "mcp", "--workspace", $workspace],
              "environment": {}
            }' "$CONFIG_FILE" > "$TEMP_FILE"
        mv "$TEMP_FILE" "$CONFIG_FILE"
    else
        # Basic merge: backup existing, add vsc-bridge section
        cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
        print_info "Backup created: $CONFIG_FILE.backup"
        
        # Check if "mcp" key exists
        if grep -q '"mcp"' "$CONFIG_FILE"; then
            # Add vsc-bridge to existing mcp section
            # This is a simplified approach - manual edit recommended if complex
            print_warning "Manual merge required (no jq available)"
            echo ""
            echo "Please manually add the following to your config:"
            echo ""
            echo '    "vsc-bridge": {'
            echo '      "type": "local",'
            echo '      "enabled": true,'
            echo "      \"command\": [\"vscb\", \"mcp\", \"--workspace\", \"$WORKSPACE_PATH\"],"
            echo '      "environment": {}'
            echo '    }'
            echo ""
            echo "Config file: $CONFIG_FILE"
            exit 1
        else
            # Create new mcp section
            # Remove closing brace, add mcp section, close
            sed -i.bak '$ d' "$CONFIG_FILE"
            cat >> "$CONFIG_FILE" <<EOF
  "mcp": {
    "vsc-bridge": {
      "type": "local",
      "enabled": true,
      "command": ["vscb", "mcp", "--workspace", "$WORKSPACE_PATH"],
      "environment": {}
    }
  }
}
EOF
        fi
    fi
else
    # Create new config file
    echo "$MCP_CONFIG" > "$CONFIG_FILE"
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

# Check JSON syntax
if [ "$HAS_JQ" = true ]; then
    if jq empty "$CONFIG_FILE" 2>/dev/null; then
        print_success "JSON syntax valid"
    else
        print_error "Invalid JSON syntax"
        echo ""
        echo "Please check: $CONFIG_FILE"
        exit 1
    fi
else
    print_warning "Cannot validate JSON (jq not available)"
fi

# Verify vsc-bridge section exists
if grep -q '"vsc-bridge"' "$CONFIG_FILE"; then
    print_success "vsc-bridge MCP server configured"
else
    print_error "vsc-bridge section not found in config"
    exit 1
fi

echo ""

# ==========================================
# SUCCESS!
# ==========================================
print_header "${CHECK} Configuration Complete!"

echo -e "${GREEN}vsc-bridge MCP server is now configured for OpenCode!${NC}"
echo ""
echo "Configuration:"
echo "  File: $CONFIG_FILE"
echo "  Workspace: $WORKSPACE_PATH"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "${INFO} Next Steps:"
echo ""
echo "1. Restart OpenCode (if currently running)"
echo ""
echo "2. Verify OpenCode can see vsc-bridge tools:"
echo "   - The tools should appear with 'vsc-bridge_' prefix"
echo "   - Example: vsc-bridge_breakpoint_set, vsc-bridge_debug_status"
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
