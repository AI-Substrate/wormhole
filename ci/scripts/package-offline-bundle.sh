#!/usr/bin/env bash
#
# package-offline-bundle.sh - Create offline installation bundle
#
# This script creates a .zip archive containing:
#   - VS Code extension (.vsix)
#   - CLI npm package (.tgz)
#   - Installation scripts (Bash + PowerShell)
#   - README.txt with version substitution
#
# Prerequisites:
#   - VSIX must already be built (artifacts/vsc-bridge-*.vsix)
#   - Build system compiled (dist/ directory exists)
#
# Usage:
#   bash ci/scripts/package-offline-bundle.sh
#

set -euo pipefail

echo "Creating offline installation bundle..."

# Determine version based on environment (CI vs local)
if [[ -n "${CI:-}" ]]; then
    # CI build: use package.json version
    VERSION=$(node -p "require('./package.json').version")
    EXT_VERSION=$(node -p "require('./packages/extension/package.json').version")

    # Validate versions match
    if [ "$VERSION" != "$EXT_VERSION" ]; then
        echo "❌ ERROR: Version mismatch (root: $VERSION, extension: $EXT_VERSION)"
        exit 1
    fi
    echo "CI build detected, using version: $VERSION"
else
    # Local build: detect version from existing VSIX (already built by package-extension dependency)
    VSIX_PATTERN="artifacts/vsc-bridge-0.0.1-*.vsix"
    VSIX_FILES=($VSIX_PATTERN)
    if [ -f "${VSIX_FILES[0]}" ]; then
        # Extract version from VSIX filename
        VSIX_NAME=$(basename "${VSIX_FILES[0]}")
        VERSION="${VSIX_NAME#vsc-bridge-}"
        VERSION="${VERSION%.vsix}"
        echo "Local build detected, using version from VSIX: $VERSION"
    else
        echo "❌ ERROR: No VSIX found matching pattern: $VSIX_PATTERN"
        exit 1
    fi

    # Clean up old local builds
    echo "Cleaning up old local builds..."
    rm -f artifacts/vsc-bridge-offline-0.0.1-*.zip
fi

# Create temp directory for bundling
TEMP_DIR=$(mktemp -d)
echo "Created temp directory: $TEMP_DIR"

# Verify and copy VSIX
VSIX_FILE="artifacts/vsc-bridge-${VERSION}.vsix"
if [ ! -f "$VSIX_FILE" ]; then
    echo "❌ ERROR: VSIX not found: $VSIX_FILE"
    exit 1
fi
cp "$VSIX_FILE" "$TEMP_DIR/"
echo "✅ Copied VSIX: $VSIX_FILE"

# Create npm tarball
echo "Creating npm tarball..."
npm pack --pack-destination "$TEMP_DIR/"
# npm pack uses actual package.json version, find the created tarball
TARBALL_FILE=$(ls "$TEMP_DIR"/vsc-bridge-*.tgz | head -1)
echo "✅ Created tarball: $TARBALL_FILE"

# Verify tarball contains dist/ directory
echo "Verifying tarball contents..."
TEMP_VERIFY=$(mktemp -d)
tar -xzf "$TARBALL_FILE" -C "$TEMP_VERIFY"
if [ ! -f "$TEMP_VERIFY/package/dist/index.js" ]; then
    echo "❌ ERROR: Tarball missing dist/index.js (check .gitignore vs package.json files)"
    rm -rf "$TEMP_VERIFY"
    exit 1
fi
rm -rf "$TEMP_VERIFY"
echo "✅ Tarball contents validated (dist/index.js present)"

# Copy installation scripts
echo "Copying installation scripts..."
cp scripts/offline-bundle/install-vscb-offline.sh "$TEMP_DIR/"
chmod +x "$TEMP_DIR/install-vscb-offline.sh"
cp scripts/offline-bundle/install-vscb-offline.ps1 "$TEMP_DIR/"
echo "✅ Copied installation scripts (Bash + PowerShell)"

# Copy and process README.txt with version substitution (T3.8)
echo "Copying README.txt with version substitution..."
cp OFFLINE_README.txt "$TEMP_DIR/README.txt"

# Replace {{VERSION}} with actual version using sed
# Different sed syntax for macOS vs Linux
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS requires -i '' for in-place editing
    sed -i '' "s/{{VERSION}}/$VERSION/g" "$TEMP_DIR/README.txt"
else
    # Linux sed syntax
    sed -i "s/{{VERSION}}/$VERSION/g" "$TEMP_DIR/README.txt"
fi
echo "✅ Copied README.txt (version: $VERSION)"

# Create .zip archive (contains 5 files: VSIX, tarball, 2 scripts, README.txt)
echo "Creating .zip archive..."
cd "$TEMP_DIR"
zip -q -r "$OLDPWD/artifacts/vsc-bridge-offline-${VERSION}.zip" .
cd "$OLDPWD"

# Cleanup temp directory
if [ -f "artifacts/vsc-bridge-offline-${VERSION}.zip" ]; then
    rm -rf "$TEMP_DIR"
else
    echo "⚠️  Temp dir preserved for debugging: $TEMP_DIR"
    exit 1
fi

# Success message
FINAL_SIZE=$(du -h "artifacts/vsc-bridge-offline-${VERSION}.zip" | cut -f1)
echo "✅ Offline bundle created: artifacts/vsc-bridge-offline-${VERSION}.zip ($FINAL_SIZE)"
