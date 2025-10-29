#!/usr/bin/env bash

##########################################################################
#                                                                        #
#   ██████╗ ███████╗ █████╗ ██████╗     ████████╗██╗  ██╗██╗███████╗██╗  #
#   ██╔══██╗██╔════╝██╔══██╗██╔══██╗    ╚══██╔══╝██║  ██║██║██╔════╝██║  #
#   ██████╔╝█████╗  ███████║██║  ██║       ██║   ███████║██║███████╗██║  #
#   ██╔══██╗██╔══╝  ██╔══██║██║  ██║       ██║   ██╔══██║██║╚════██║╚═╝  #
#   ██║  ██║███████╗██║  ██║██████╔╝       ██║   ██║  ██║██║███████║██╗  #
#   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝        ╚═╝   ╚═╝  ╚═╝╚═╝╚══════╝╚═╝  #
#                                                                        #
##########################################################################
#
#  PREREQUISITES REQUIRED:
#  ━━━━━━━━━━━━━━━━━━━━━━
#   ✓ Node.js >= 18.0.0
#   ✓ npm (comes with Node.js)
#   ✓ Visual Studio Code
#   ✓ Internet connection for CLI dependencies
#
#  IMPORTANT:
#  ━━━━━━━━━━
#   • Extension installs COMPLETELY OFFLINE
#   • CLI installation REQUIRES INTERNET for npm dependencies
#
#  📖 See README.txt for full installation guide
#
################################################################################
#
# install-vscb-offline.sh - Install vsc-bridge from offline bundle
#
# Usage:
#   bash install-vscb-offline.sh                 # Install both CLI and extension
#   bash install-vscb-offline.sh --install-cli   # Install CLI only
#   bash install-vscb-offline.sh --install-vsix  # Install extension only
#
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Component selection flags (T001b)
INSTALL_CLI=true
INSTALL_VSIX=true

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --install-cli)
            INSTALL_CLI=true
            INSTALL_VSIX=false
            shift
            ;;
        --install-vsix)
            INSTALL_CLI=false
            INSTALL_VSIX=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --install-cli    Install CLI only"
            echo "  --install-vsix   Install VS Code extension only"
            echo "  --help           Show this help message"
            echo ""
            echo "Default: Install both CLI and extension"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Run '$0 --help' for usage information"
            exit 1
            ;;
    esac
done

# Function: validate_node (T002)
# Check Node.js version >=18
validate_node() {
    if ! command -v node &>/dev/null; then
        print_error "Node.js is not installed"
        echo ""
        echo "Please install Node.js (>=18.0.0) from:"
        echo "  https://nodejs.org/"
        exit 1
    fi

    NODE_VERSION=$(node --version | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

    if [ "$NODE_MAJOR" -lt 18 ]; then
        print_error "Node.js version $NODE_VERSION is too old"
        echo ""
        echo "Required: Node.js >=18.0.0"
        echo "Current:  Node.js $NODE_VERSION"
        echo ""
        echo "Please upgrade Node.js from: https://nodejs.org/"
        exit 1
    fi

    print_success "Node.js $NODE_VERSION"
}

validate_npm() {
    # T003 - Check npm exists
    if ! command -v npm &>/dev/null; then
        print_error "npm is not installed"
        echo ""
        echo "npm should be installed with Node.js"
        echo "Please reinstall Node.js from: https://nodejs.org/"
        exit 1
    fi

    NPM_VERSION=$(npm --version)
    print_success "npm $NPM_VERSION"
}

validate_vscode_cli() {
    # T003 - Check VS Code CLI (uses detect_vscode_cli function)
    detect_vscode_cli
    if [ -n "$CODE_CMD" ]; then
        print_success "VS Code CLI: $CODE_CMD"
    fi
}

detect_vscode_cli() {
    # T008 - Detect VS Code CLI with fallback chain
    CODE_CMD=""

    if command -v code &>/dev/null; then
        CODE_CMD="code"
    elif command -v code-insiders &>/dev/null; then
        CODE_CMD="code-insiders"
    elif [ -f "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]; then
        CODE_CMD="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
    else
        print_error "VS Code CLI not found"
        echo ""
        echo "Please set up the VS Code CLI:"
        echo ""
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo "macOS:"
            echo "  1. Open VS Code"
            echo "  2. Press Cmd+Shift+P"
            echo "  3. Type 'shell command'"
            echo "  4. Select 'Install code command in PATH'"
        else
            echo "Linux:"
            echo "  VS Code CLI should be in PATH after installation"
            echo "  Try: sudo ln -s /usr/share/code/bin/code /usr/local/bin/code"
        fi
        exit 1
    fi
}

detect_current_version() {
    # T004 - Detect installed version with fallback chain
    # Try npm list first (most reliable)
    if version=$(npm list -g vsc-bridge --depth=0 2>/dev/null | grep vsc-bridge | sed 's/.*@//' | awk '{print $1}'); then
        if [ -n "$version" ]; then
            echo "$version"
            return 0
        fi
    fi

    # Fallback to vscb --version
    if command -v vscb &>/dev/null; then
        # Parse "vsc-bridge/1.2.0 darwin-arm64 node-v24.9.0" format
        # Extract just the version number after the slash
        if version=$(vscb --version 2>/dev/null | head -1 | sed 's|.*/||' | awk '{print $1}'); then
            if [ -n "$version" ]; then
                echo "$version"
                return 0
            fi
        fi
    fi

    echo "not-installed"
    return 1
}

show_version_message() {
    # T005 - Display upgrade vs fresh install message
    # Extract versions from bundle filenames
    VSIX_FILE=$(ls vsc-bridge-*.vsix 2>/dev/null | head -1)
    if [ -z "$VSIX_FILE" ]; then
        print_error "VSIX file not found in current directory"
        echo "Expected: vsc-bridge-*.vsix"
        exit 1
    fi
    VSIX_VERSION="${VSIX_FILE#vsc-bridge-}"
    VSIX_VERSION="${VSIX_VERSION%.vsix}"

    TARBALL_FILE=$(ls vsc-bridge-*.tgz 2>/dev/null | head -1)
    if [ -z "$TARBALL_FILE" ]; then
        print_error "CLI tarball not found in current directory"
        echo "Expected: vsc-bridge-*.tgz"
        exit 1
    fi
    CLI_VERSION="${TARBALL_FILE#vsc-bridge-}"
    CLI_VERSION="${CLI_VERSION%.tgz}"

    # Detect current installation
    CURRENT_VERSION=$(detect_current_version)

    echo ""
    # Display appropriate message based on build type and current state
    if [ "$CURRENT_VERSION" = "not-installed" ]; then
        # Fresh install
        if [[ "$VSIX_VERSION" =~ ^0\.0\.1-[a-f0-9]{8}$ ]]; then
            print_info "Fresh installation from LOCAL DEV BUILD"
            print_info "  Extension: v$VSIX_VERSION"
            print_info "  CLI: v$CLI_VERSION"
        else
            print_info "Fresh installation of vsc-bridge v$CLI_VERSION"
        fi
    else
        # Upgrade
        if [[ "$VSIX_VERSION" =~ ^0\.0\.1-[a-f0-9]{8}$ ]]; then
            print_info "Installing LOCAL DEV BUILD from bundle..."
            print_info "  Current: v$CURRENT_VERSION"
            print_info "  Extension: v$VSIX_VERSION"
            print_info "  CLI: v$CLI_VERSION"
        else
            print_info "Found vsc-bridge v$CURRENT_VERSION, upgrading to v$CLI_VERSION..."
        fi
    fi
    echo ""
}

cleanup_npm_link() {
    # T006 - Detect and remove npm link symlinks and existing installations
    npm_prefix=$(npm config get prefix)
    if [ -L "$npm_prefix/lib/node_modules/vsc-bridge" ]; then
        print_warning "Found npm link symlink (development installation)"
        print_info "Removing symlink to install from bundle..."
        npm unlink -g vsc-bridge 2>/dev/null || true
    fi

    # Check if vsc-bridge is globally installed
    if npm list -g vsc-bridge >/dev/null 2>&1; then
        print_info "Removing existing global installation..."
        npm uninstall -g vsc-bridge 2>/dev/null || true
    fi

    # Remove existing binary if it still exists (npm sometimes leaves it)
    if command -v vscb >/dev/null 2>&1; then
        vscb_path=$(command -v vscb)
        if [ -f "$vscb_path" ]; then
            print_info "Removing existing vscb binary at: $vscb_path"
            rm -f "$vscb_path" 2>/dev/null || true
        fi
    fi
}

install_cli() {
    # T007 - Install npm tarball with retry logic
    if [ "$INSTALL_CLI" != true ]; then
        return 0
    fi

    print_info "Installing CLI from tarball..."
    print_warning "Note: This requires internet access to download npm dependencies"
    echo ""

    TARBALL_FILE=$(ls vsc-bridge-*.tgz 2>/dev/null | head -1)
    RETRIES=3
    ATTEMPT=1

    while [ $ATTEMPT -le $RETRIES ]; do
        if [ $ATTEMPT -gt 1 ]; then
            echo "Retry attempt $ATTEMPT of $RETRIES..."
        fi

        echo ""
        print_info "Running: npm install -g $TARBALL_FILE"
        echo ""

        # Run npm install without timeout (not available on macOS)
        # Show all output in real-time
        if npm install -g "$TARBALL_FILE"; then
            echo ""
            print_success "CLI installed successfully"
            return 0
        fi

        # Capture exit code
        NPM_EXIT_CODE=$?
        echo ""
        print_error "npm install exited with code $NPM_EXIT_CODE"

        if [ $ATTEMPT -eq $RETRIES ]; then
            echo ""
            print_error "CLI installation failed after $RETRIES attempts"
            echo ""
            echo "=========================================="
            echo "MANUAL INSTALLATION INSTRUCTIONS"
            echo "=========================================="
            echo ""
            echo "Install CLI manually:"
            echo "  cd $(pwd)"
            echo "  npm install -g $TARBALL_FILE"
            echo ""
            echo "Common Issues:"
            echo "  - Internet connectivity -> npm needs internet to download dependencies"
            echo "  - Proxy settings -> Check with: npm config get proxy"
            echo "  - Registry access -> Test with: npm ping"
            echo "  - Permissions -> Try with sudo (not recommended): sudo npm install -g $TARBALL_FILE"
            echo ""
            echo "To retry with this script:"
            echo "  bash $0 --install-cli"
            echo ""
            exit 1
        fi

        ATTEMPT=$((ATTEMPT + 1))
        sleep 2
    done
}

install_vsix() {
    # T009 - Install VSIX with VS Code CLI
    if [ "$INSTALL_VSIX" != true ]; then
        return 0
    fi

    print_info "Installing VS Code extension..."
    detect_vscode_cli

    VSIX_FILE=$(ls vsc-bridge-*.vsix 2>/dev/null | head -1)

    if "$CODE_CMD" --install-extension "$VSIX_FILE" 2>&1; then
        print_success "Extension installed (using $CODE_CMD)"

        # Verify installation
        if "$CODE_CMD" --list-extensions 2>/dev/null | grep -q "vsc-bridge"; then
            print_success "Extension verified in VS Code"
        fi
        return 0
    else
        print_error "VSIX installation failed"
        echo ""
        echo "=========================================="
        echo "MANUAL INSTALLATION INSTRUCTIONS"
        echo "=========================================="
        echo ""
        echo "Option 1 - Install Extension using VS Code GUI:"
        echo "  1. Open Visual Studio Code"
        echo "  2. Press Cmd+Shift+X (or Ctrl+Shift+X on Linux)"
        echo "  3. Click the '...' menu -> Install from VSIX..."
        echo "  4. Navigate to: $(pwd)"
        echo "  5. Select: $VSIX_FILE"
        echo ""
        echo "Option 2 - Install Extension using Command Line:"
        echo "  cd $(pwd)"
        echo "  code --install-extension $VSIX_FILE"
        echo ""
        echo "Common Issues:"
        echo "  - 'code' command not found -> Use VS Code GUI (Option 1)"
        echo "  - On macOS: Open VS Code -> Cmd+Shift+P -> 'Shell Command: Install code command in PATH'"
        echo ""
        if [ "$INSTALL_CLI" = true ]; then
            echo "Note: CLI was already installed successfully"
            echo ""
        fi
        echo "To retry with this script:"
        echo "  bash $0 --install-vsix"
        echo ""
        exit 1
    fi
}

verify_path() {
    # T010 - Verify PATH configuration
    if [ "$INSTALL_CLI" != true ]; then
        return 0
    fi

    NPM_BIN=$(npm bin -g)
    if echo "$PATH" | grep -q "$NPM_BIN"; then
        print_success "npm bin directory is in PATH"
        return 0
    fi

    print_warning "npm bin directory not in PATH: $NPM_BIN"
    echo ""
    echo "To use the vscb command, add the npm bin directory to your PATH:"
    echo ""

    # Detect shell and provide appropriate instructions
    case "$SHELL" in
        */zsh)
            echo "Add this line to ~/.zshrc:"
            echo "  export PATH=\"$NPM_BIN:\$PATH\""
            echo ""
            echo "Then run: source ~/.zshrc"
            ;;
        */bash)
            echo "Add this line to ~/.bashrc or ~/.bash_profile:"
            echo "  export PATH=\"$NPM_BIN:\$PATH\""
            echo ""
            echo "Then run: source ~/.bashrc"
            ;;
        *)
            echo "Add $NPM_BIN to your PATH"
            ;;
    esac
    echo ""
}

post_install_verify() {
    # T011 - Run 5-point verification checklist
    echo ""
    print_info "Running post-install verification..."
    echo ""

    CHECKS_PASSED=0
    CHECKS_TOTAL=0

    # Check 1: vscb --version (if CLI installed)
    if [ "$INSTALL_CLI" = true ]; then
        CHECKS_TOTAL=$((CHECKS_TOTAL + 3))
        if command -v vscb &>/dev/null && vscb --version &>/dev/null; then
            print_success "vscb --version works"
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
        else
            print_error "vscb --version failed"
        fi

        # Check 4: which vscb
        if command -v vscb &>/dev/null; then
            VSCB_PATH=$(which vscb)
            print_success "vscb found at: $VSCB_PATH"
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
        else
            print_error "vscb not found in PATH"
        fi

        # Check 5: npm list -g vsc-bridge
        if npm list -g vsc-bridge --depth=0 2>/dev/null | grep -q "vsc-bridge"; then
            print_success "npm global installation verified"
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
        else
            print_error "npm global installation check failed"
        fi
    fi

    # Check 2: code --list-extensions (if VSIX installed)
    if [ "$INSTALL_VSIX" = true ]; then
        CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
        if "$CODE_CMD" --list-extensions 2>/dev/null | grep -q "vsc-bridge"; then
            print_success "Extension found in VS Code"
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
        else
            print_error "Extension not found in VS Code"
        fi
    fi

    # Check 3: vscb script list (only if both installed)
    if [ "$INSTALL_CLI" = true ] && [ "$INSTALL_VSIX" = true ]; then
        CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
        if command -v vscb &>/dev/null; then
            print_info "Note: 'vscb script list' requires Extension Host to be running"
            print_info "      Start VS Code to test full integration"
        fi
    fi

    echo ""
    echo "Verification: $CHECKS_PASSED/$CHECKS_TOTAL checks passed"
    echo ""

    if [ $CHECKS_PASSED -eq $CHECKS_TOTAL ]; then
        print_success "All verification checks passed!"
        return 0
    else
        print_warning "Some verification checks failed"
        echo "Review the output above for details"
        return 1
    fi
}

# Main installation flow
echo ""
echo "vsc-bridge Offline Installation"
echo "================================"
echo ""

# Step 1: Validate prerequisites
print_info "Step 1: Checking prerequisites..."
echo ""
validate_node
validate_npm
if [ "$INSTALL_VSIX" = true ]; then
    validate_vscode_cli
fi
echo ""

# Step 2: Show version/upgrade message
print_info "Step 2: Detecting installation status..."
show_version_message

# Step 3: Cleanup conflicts
print_info "Step 3: Checking for conflicts..."
cleanup_npm_link
echo ""

# Step 4: Install CLI first (fail-fast on risky operation)
if [ "$INSTALL_CLI" = true ]; then
    print_info "Step 4: Installing CLI..."
    install_cli
    echo ""
fi

# Step 5: Install VSIX second (after CLI succeeds)
if [ "$INSTALL_VSIX" = true ]; then
    if [ "$INSTALL_CLI" = true ]; then
        print_info "Step 5: Installing VS Code extension..."
    else
        print_info "Step 4: Installing VS Code extension..."
    fi
    install_vsix
    echo ""
fi

# Step 6: Verify PATH configuration
if [ "$INSTALL_CLI" = true ]; then
    if [ "$INSTALL_VSIX" = true ]; then
        print_info "Step 6: Verifying PATH configuration..."
    else
        print_info "Step 5: Verifying PATH configuration..."
    fi
    verify_path
fi

# Step 7: Post-install verification
print_info "Final Step: Post-install verification..."
post_install_verify

echo ""
print_success "Installation complete!"
echo ""
echo "Next steps:"
if [ "$INSTALL_CLI" = true ] && [ "$INSTALL_VSIX" = true ]; then
    echo "  1. Start VS Code"
    echo "  2. Test the vscb command:"
    echo "     vscb status"
    echo "     vscb script list"
elif [ "$INSTALL_CLI" = true ]; then
    echo "  1. Install the VS Code extension:"
    echo "     Run: $0 --install-vsix"
    echo "  2. Test the vscb command:"
    echo "     vscb status"
elif [ "$INSTALL_VSIX" = true ]; then
    echo "  1. Install the CLI:"
    echo "     Run: $0 --install-cli"
    echo "  2. Start VS Code to use the extension"
fi
echo ""
