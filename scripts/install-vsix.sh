#!/usr/bin/env bash
set -euo pipefail

# install-vsix.sh - Download and install latest vsc-bridge VSIX from GitHub Releases
# Usage: ./scripts/install-vsix.sh [version]
#   - No args: Install latest release
#   - With version: Install specific version (e.g., v1.0.0 or v1.0.0-test.1)

REPO="AI-Substrate/vsc-bridge"
VERSION="${1:-}"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "🔍 vsc-bridge VSIX Installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check prerequisites
if ! command -v code &> /dev/null; then
    echo "❌ Error: VS Code 'code' command not found in PATH"
    echo ""
    echo "Please install VS Code and ensure 'code' is in your PATH:"
    echo "  - macOS: Open VS Code → Cmd+Shift+P → 'Shell Command: Install code command in PATH'"
    echo "  - Linux: Usually installed with VS Code package"
    echo "  - Windows: Use install-vsix.ps1 instead"
    exit 1
fi

if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI (gh) not found in PATH"
    echo ""
    echo "Please install GitHub CLI:"
    echo "  - macOS: brew install gh"
    echo "  - Linux: https://github.com/cli/cli/blob/trunk/docs/install_linux.md"
    echo "  - Windows: Use install-vsix.ps1 instead"
    exit 1
fi

# Determine version to install
if [ -z "$VERSION" ]; then
    echo "📦 Fetching latest release..."
    VERSION=$(gh release list --repo "$REPO" --limit 1 --json tagName --jq '.[0].tagName')
    if [ -z "$VERSION" ]; then
        echo "❌ Error: Could not determine latest release"
        exit 1
    fi
    echo "✓ Latest release: $VERSION"
else
    # Add 'v' prefix if not present
    if [[ ! "$VERSION" =~ ^v ]]; then
        VERSION="v$VERSION"
    fi
    echo "📦 Using specified version: $VERSION"
fi

# Download VSIX
echo ""
echo "⬇️  Downloading VSIX from GitHub Release..."
VSIX_PATTERN="vsc-bridge-*.vsix"
gh release download "$VERSION" --repo "$REPO" --pattern "$VSIX_PATTERN" --dir "$TEMP_DIR"

VSIX_FILE=$(find "$TEMP_DIR" -name "vsc-bridge-*.vsix" -type f | head -n 1)
if [ ! -f "$VSIX_FILE" ]; then
    echo "❌ Error: VSIX file not found in release $VERSION"
    echo "   Expected pattern: $VSIX_PATTERN"
    exit 1
fi

VSIX_SIZE=$(du -h "$VSIX_FILE" | cut -f1)
echo "✓ Downloaded: $(basename "$VSIX_FILE") ($VSIX_SIZE)"

# Check if extension is already installed
EXTENSION_ID="ai-substrate.vsc-bridge"
INSTALLED_VERSION=$(code --list-extensions --show-versions | grep "^$EXTENSION_ID@" | cut -d@ -f2 || echo "")

if [ -n "$INSTALLED_VERSION" ]; then
    echo ""
    echo "ℹ️  Currently installed: $EXTENSION_ID@$INSTALLED_VERSION"
    echo "   Will be replaced with version: ${VERSION#v}"
fi

# Install VSIX
echo ""
echo "📥 Installing extension in VS Code..."
if code --install-extension "$VSIX_FILE" 2>&1 | tee "$TEMP_DIR/install.log"; then
    echo ""
    echo "✅ Installation complete!"
    echo ""
    echo "Extension: vsc-bridge"
    echo "Version: ${VERSION#v}"
    echo "ID: $EXTENSION_ID"
    echo ""
    echo "🔄 Reload VS Code windows for changes to take effect"
else
    echo ""
    echo "❌ Installation failed!"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check VS Code is not running (close all windows)"
    echo "  2. Verify you have write permissions to VS Code extensions folder"
    echo "  3. Try installing manually:"
    echo "     code --install-extension $VSIX_FILE"
    exit 1
fi

# Optional: List extension details
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Extension details:"
code --list-extensions --show-versions | grep "^$EXTENSION_ID@" || echo "⚠️  Extension not found in list (may require VS Code restart)"
