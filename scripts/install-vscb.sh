#!/bin/bash
#
# install-vscb.sh - Install vscb CLI globally on the host machine
#
# IMPORTANT: This script does NOT build the CLI. You must build first:
#   - Option A: Build in dev container (recommended)
#   - Option B: Build locally with: just build && just package-extension
#
# This script:
# 1. Validates prerequisites (Node.js, npm)
# 2. Verifies CLI and extension are already built
# 3. Installs CLI globally via npm link
# 4. Verifies installation
# 5. Configures PATH if needed
#
# Usage:
#   bash scripts/install-vscb.sh
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
    WRENCH="🔧"
else
    # Fallback for systems without emoji support
    CHECK="[OK]"
    CROSS="[FAIL]"
    WARN="[WARN]"
    INFO="[INFO]"
    ROCKET=">>>"
    WRENCH=">>>"
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
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

print_header "${ROCKET} vscb CLI Installation"

echo "Project root: $PROJECT_ROOT"
echo ""

# ==========================================
# STEP 1: Check Prerequisites
# ==========================================
print_info "Step 1: Checking prerequisites..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
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

# Check npm
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed"
    echo ""
    echo "npm should be installed with Node.js"
    echo "Please reinstall Node.js from: https://nodejs.org/"
    exit 1
fi

NPM_VERSION=$(npm --version)
print_success "npm $NPM_VERSION"

# Check git (optional but recommended)
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version | awk '{print $3}')
    print_success "git $GIT_VERSION"
else
    print_warning "git not found (optional)"
fi

echo ""

# ==========================================
# STEP 2: Validate Project Structure
# ==========================================
print_info "Step 2: Validating project structure..."
echo ""

cd "$PROJECT_ROOT"

if [ ! -f "package.json" ]; then
    print_error "package.json not found in $PROJECT_ROOT"
    echo ""
    echo "This script must be run from the vsc-bridge project root."
    exit 1
fi

if [ ! -f "package.json" ]; then
    print_error "package.json not found in project root"
    echo ""
    echo "Expected: $PROJECT_ROOT/package.json"
    exit 1
fi

# Verify this is the vsc-bridge project
if ! grep -q '"name": "vsc-bridge"' package.json; then
    print_error "Not in vsc-bridge project root (package.json has wrong name)"
    exit 1
fi

print_success "Project structure validated"
echo ""

# ==========================================
# STEP 3: Verify Build Artifacts
# ==========================================
print_info "Step 3: Verifying build artifacts..."
echo ""

# Check CLI build
if [ ! -f "dist/index.js" ]; then
    print_error "CLI not built: dist/index.js not found"
    echo ""
    echo "You must build the project first. Choose one option:"
    echo ""
    echo "Option A (Recommended): Build in dev container"
    echo "  1. Open project in VS Code"
    echo "  2. Reopen in dev container when prompted"
    echo "  3. Wait for automatic build via post-install.sh"
    echo ""
    echo "Option B: Build locally (requires Node.js >=18, just/npm)"
    echo "  npm install"
    echo "  just build && just package-extension"
    echo "  # Or: npm run build && cd packages/extension && npx @vscode/vsce package"
    echo ""
    exit 1
fi

if [ ! -f "dist/manifest.json" ]; then
    print_error "CLI build incomplete: dist/manifest.json not found"
    echo ""
    echo "The CLI build appears incomplete. Please rebuild:"
    echo "  just build  # or: npm run build:cli"
    exit 1
fi

MANIFEST_SIZE=$(du -h "dist/manifest.json" | cut -f1)
print_success "CLI built: dist/ ($MANIFEST_SIZE manifest)"

# Check extension VSIX
VSIX_FILE=$(find "$PROJECT_ROOT/packages/extension/" -maxdepth 1 -name "*.vsix" 2>/dev/null | head -1)
if [ -z "$VSIX_FILE" ]; then
    print_warning "Extension VSIX not found (optional for CLI-only usage)"
    echo "  To create it: just package-extension"
    echo "  Or: cd packages/extension && npx @vscode/vsce package"
else
    VSIX_NAME=$(basename "$VSIX_FILE")
    VSIX_SIZE=$(du -h "$VSIX_FILE" | cut -f1)
    print_success "Extension packaged: $VSIX_NAME ($VSIX_SIZE)"
fi

echo ""

# ==========================================
# STEP 4: Install Globally
# ==========================================
print_info "Step 4: Installing vscb globally..."
echo ""

# Check if already linked
echo "Checking npm prefix..."
NPM_PREFIX=$(npm config get prefix)
echo "npm prefix: $NPM_PREFIX"

echo "Checking if already linked..."
if [ -L "$NPM_PREFIX/lib/node_modules/@vsc-bridge/cli" ] || [ -d "$NPM_PREFIX/lib/node_modules/@vsc-bridge/cli" ]; then
    print_warning "vscb is already linked globally (reinstalling...)"
    cd "$NPM_PREFIX/lib/node_modules/@vsc-bridge"
    npm unlink -g cli 2>/dev/null || true
    cd "$PROJECT_ROOT"
fi

# Run npm link from project root (CLI is now at root level after Phase 2)
echo "Running npm link for vsc-bridge CLI..."
npm link

print_success "vscb installed globally"
echo ""

# ==========================================
# STEP 5: Verify Installation
# ==========================================
print_info "Step 5: Verifying installation..."
echo ""

# Check if vscb is in PATH
if ! command -v vscb &> /dev/null; then
    print_error "vscb command not found in PATH"
    echo ""
    echo "npm link completed, but vscb is not in your PATH."
    echo ""

    # Detect npm global bin directory
    NPM_BIN=$(npm bin -g 2>/dev/null || npm config get prefix)/bin
    echo "npm global bin directory: $NPM_BIN"
    echo ""
    echo "To fix this, add the following to your shell profile:"
    echo ""

    # Detect shell and provide appropriate instructions
    if [ -n "$ZSH_VERSION" ]; then
        echo "  echo 'export PATH=\"$NPM_BIN:\$PATH\"' >> ~/.zshrc"
        echo "  source ~/.zshrc"
    elif [ -n "$BASH_VERSION" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo "  echo 'export PATH=\"$NPM_BIN:\$PATH\"' >> ~/.bash_profile"
            echo "  source ~/.bash_profile"
        else
            echo "  echo 'export PATH=\"$NPM_BIN:\$PATH\"' >> ~/.bashrc"
            echo "  source ~/.bashrc"
        fi
    else
        echo "  export PATH=\"$NPM_BIN:\$PATH\""
    fi
    echo ""
    exit 1
fi

VSCB_PATH=$(which vscb)
print_success "vscb found at: $VSCB_PATH"

# Check version
if ! VSCB_VERSION=$(vscb --version 2>&1); then
    print_error "vscb --version failed"
    echo ""
    echo "Output: $VSCB_VERSION"
    exit 1
fi

print_success "vscb version: $(echo "$VSCB_VERSION" | head -1)"

# Check commands available
if vscb --help &> /dev/null; then
    print_success "vscb commands available"
else
    print_warning "vscb --help failed (may be ok)"
fi

echo ""

# ==========================================
# SUCCESS!
# ==========================================
print_header "${CHECK} Installation Complete!"

echo -e "${GREEN}vscb CLI is now installed and ready to use!${NC}"
echo ""
echo "Installation Details:"
echo "  Command:  vscb"
echo "  Location: $VSCB_PATH"
echo "  Version:  $(echo "$VSCB_VERSION" | head -1)"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "${WRENCH} Next Steps:"
echo ""
echo "1. Start VS Code with your project open"
echo "   (The Extension Host must be running for vscb to work)"
echo ""
echo "2. Install the VS Code extension:"
echo "   - Open Command Palette (Cmd/Ctrl+Shift+P)"
echo "   - Select 'Extensions: Install from VSIX'"
echo "   - Choose: $PROJECT_ROOT/packages/extension/*.vsix"
echo ""
echo "3. Verify vscb can connect:"
echo "   vscb status"
echo ""
echo "4. List available scripts:"
echo "   vscb script list"
echo ""
echo "5. (Optional) Configure auth token:"
echo "   vscb config set authToken <your-token>"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Documentation:"
echo "  CLI Usage:     $PROJECT_ROOT/README-cli.md"
echo "  Project Docs:  $PROJECT_ROOT/README.md"
echo ""
echo "For help, run:   vscb --help"
echo ""
