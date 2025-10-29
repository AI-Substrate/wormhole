#!/bin/bash
set -e

# Start SSH service first (critical for remote access)
echo "🔐 Starting SSH service..."
sudo service ssh start && echo "✅ SSH service started" || echo "⚠️  SSH service failed to start"
echo ""

# Ensure we're in the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Helper: Find VS Code CLI (works in dev containers)
find_vscode_cli() {
    # Find VS Code Server CLI in dev container - only look here
    if [ -d "/vscode/vscode-server" ]; then
        local cli_path
        cli_path=$(find /vscode/vscode-server -path "*/bin/remote-cli/code" 2>/dev/null | head -1)
        if [ -n "$cli_path" ]; then
            echo "$cli_path"
            return 0
        fi
    fi
    
    return 1
}

echo "🚀 Running post-install script..."
echo "   Working directory: $PROJECT_ROOT"
echo ""

# ==========================================
# PHASE 1: Environment Setup
# ==========================================
echo "📋 Phase 1: Environment Setup"
echo "─────────────────────────────────────"

# Fix Claude directory permissions (only if mounted - for claude-mode devcontainer)
# Note: Only change the parent directory, not recursively, to avoid touching host-mounted subdirs
if [ -d "/home/node/.claude" ]; then
    echo "  Fixing Claude directory permissions..."
    sudo chown node:node /home/node/.claude 2>/dev/null || true
    mkdir -p /home/node/.claude/debug
    echo "  ✅ Claude directory permissions fixed"
fi

# Configure npm to use user-local global directory (fixes permission issues)
echo "  Configuring npm global directory..."
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global

# Add npm global bin to PATH if not already there
if ! grep -q "npm-global/bin" ~/.zshrc; then
    echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
fi
export PATH=~/.npm-global/bin:$PATH

echo "✅ Environment setup complete"
echo ""

# ==========================================
# PHASE 2: Dependencies Installation
# ==========================================
echo "📋 Phase 2: Dependencies Installation"
echo "─────────────────────────────────────"

# Install global npm packages
echo "  Installing global npm packages..."
npm install -g @anthropic-ai/claude-code @openai/codex

# Install npm dependencies
echo "  Installing npm dependencies..."
npm install

# Install Python testing dependencies (pytest, debugpy) for Extension Host
if [ -f "requirements.txt" ]; then
    echo "  Installing Python testing dependencies (pytest, debugpy)..."
    pip install -r requirements.txt
    echo "  ✅ Python testing dependencies installed"
else
    echo "  ⚠️  requirements.txt not found, skipping Python dependencies"
fi

# Install Dart testing dependencies (package:test) for Extension Host
if command -v dart >/dev/null 2>&1; then
    echo "  Installing Dart testing dependencies (package:test)..."
    DART_PROJECTS_FOUND=0

    # Find all Dart projects in test directories
    while IFS= read -r pubspec_file; do
        if [ -f "$pubspec_file" ]; then
            DART_PROJECT_DIR=$(dirname "$pubspec_file")
            echo "    Running dart pub get in $DART_PROJECT_DIR..."
            (cd "$DART_PROJECT_DIR" && dart pub get --no-precompile) || echo "    ⚠️  Failed to run pub get in $DART_PROJECT_DIR"
            DART_PROJECTS_FOUND=$((DART_PROJECTS_FOUND + 1))
        fi
    done < <(find "$PROJECT_ROOT/test" -name "pubspec.yaml" -type f 2>/dev/null)

    if [ $DART_PROJECTS_FOUND -gt 0 ]; then
        echo "  ✅ Dart testing dependencies installed for $DART_PROJECTS_FOUND project(s)"
    else
        echo "  ⚠️  No Dart projects found in test directory"
    fi
else
    echo "  ⚠️  Dart SDK not found, skipping Dart dependencies"
fi

# Install C# testing dependencies (xUnit) for Extension Host
if command -v dotnet >/dev/null 2>&1; then
    echo "  Installing C# testing dependencies (xUnit)..."
    CSHARP_PROJECTS_FOUND=0

    # Find all C# projects in test directories
    while IFS= read -r csproj_file; do
        if [ -f "$csproj_file" ]; then
            CSHARP_PROJECT_DIR=$(dirname "$csproj_file")
            echo "    Running dotnet build in $CSHARP_PROJECT_DIR..."
            (cd "$CSHARP_PROJECT_DIR" && dotnet build) || echo "    ⚠️  Failed to build project in $CSHARP_PROJECT_DIR"
            CSHARP_PROJECTS_FOUND=$((CSHARP_PROJECTS_FOUND + 1))
        fi
    done < <(find "$PROJECT_ROOT/test" -name "*.csproj" -type f 2>/dev/null)

    if [ $CSHARP_PROJECTS_FOUND -gt 0 ]; then
        echo "  ✅ C# testing dependencies installed for $CSHARP_PROJECTS_FOUND project(s)"
    else
        echo "  ⚠️  No C# projects found in test directory"
    fi
else
    echo "  ⚠️  .NET SDK not found, skipping C# dependencies"
fi

# Set up git hooks if using husky
if [ -d ".husky" ]; then
    echo "  Setting up git hooks..."
    npm run prepare 2>/dev/null || echo "  No prepare script found, skipping..."
fi

# Install jk-tools
echo "  Installing jk-tools..."
uvx --from git+https://github.com/jakkaj/tools jk-tools-setup

# Install VS Code test dependencies (GUI libraries for Electron)
echo "  Installing VS Code test dependencies..."
bash "$PROJECT_ROOT/.devcontainer/install-vscode-test-deps.sh"

echo "✅ Dependencies installed"
echo ""

# ==========================================
# PHASE 3: Build Project
# ==========================================
echo "📋 Phase 3: Building Project"
echo "─────────────────────────────────────"

# Build everything
echo "  Building extension, CLI, and MCP server..."
just build

echo "✅ Build complete"
echo ""

# ==========================================
# PHASE 4: Package and Install Extension
# ==========================================
echo "📋 Phase 4: Packaging and Installing Extension"
echo "─────────────────────────────────────"

# Package extension
echo "  Creating VSIX package..."
just package-extension

# Install CLI globally (makes 'vscb' command available)
echo "  Installing vscb CLI globally..."
npm link

# Install extension in VS Code (works in dev container)
echo "  Installing extension in VS Code..."
CODE_CLI=$(find_vscode_cli)
if [ -n "$CODE_CLI" ]; then
    echo "  Found VS Code CLI: $CODE_CLI"
    
    # Uninstall old version first
    "$CODE_CLI" --uninstall-extension mcaps-microsoft.vsc-bridge-extension 2>/dev/null || true

    # Install new version
    VSIX_FILE=$(find "$PROJECT_ROOT/packages/extension/" -maxdepth 1 -name "*.vsix" | head -1)
    if [ -n "$VSIX_FILE" ]; then
        "$CODE_CLI" --install-extension "$VSIX_FILE"
        echo "  ✅ Extension installed successfully!"
        echo "  ⚠️  You may need to reload VS Code window to activate the extension."
        echo "     Run: Developer: Reload Window (Cmd+Shift+P / Ctrl+Shift+P)"
    else
        echo "  ❌ VSIX file not found at packages/extension/*.vsix"
    fi
else
    echo "  ⚠️  VS Code CLI not found, skipping automatic installation"
fi

echo "✅ Packaging and installation complete"
echo ""

# ==========================================
# PHASE 5: Configure Claude MCP Server
# ==========================================
echo "📋 Phase 5: Configure Claude MCP Server"
echo "─────────────────────────────────────"

# Check if claude CLI is available
if command -v claude >/dev/null 2>&1; then
    echo "  Found claude CLI, registering MCP server..."

    # Add vsc-bridge MCP server with user scope (works in dev container)
    # Use absolute path to project root so it works regardless of current directory
    claude mcp add --scope project --transport stdio vsc-bridge -- vscb mcp --workspace "$PROJECT_ROOT" 2>/dev/null || {
        echo "  ℹ️  MCP server may already be registered"
    }

    # Verify registration
    if claude mcp list 2>/dev/null | grep -q "vsc-bridge"; then
        echo "  ✅ MCP server registered and connected"
        echo "     Workspace: $PROJECT_ROOT"
    else
        echo "  ⚠️  MCP server registered but connection status unknown"
    fi
else
    echo "  ⚠️  Claude CLI not found, skipping MCP server registration"
    echo "     Install with: npm install -g @anthropic-ai/claude-code"
fi

echo "✅ MCP configuration complete"
echo ""

# ==========================================
# PHASE 6: Configure Claude Code Permissions
# ==========================================
echo "📋 Phase 6: Configure Claude Code Permissions"
echo "─────────────────────────────────────"

# Update Claude Code settings to auto-allow VSC-Bridge MCP tools
if [ -f "$PROJECT_ROOT/scripts/update-claude-mcp-permissions.py" ]; then
    echo "  Updating Claude Code permissions for VSC-Bridge MCP tools..."
    python3 "$PROJECT_ROOT/scripts/update-claude-mcp-permissions.py" 2>/dev/null && {
        echo "  ✅ Claude Code permissions updated"
        echo "     All VSC-Bridge MCP tools are now auto-allowed"
    } || {
        echo "  ⚠️  Failed to update permissions (this is optional)"
    }
else
    echo "  ⚠️  Permission update script not found, skipping"
fi

echo "✅ Permission configuration complete"
echo ""

# ==========================================
# FINAL: Summary
# ==========================================
echo "════════════════════════════════════════════════════════════════"
echo "🎉 POST-INSTALL COMPLETE!"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Find the VSIX file (use absolute path)
VSIX_FILE=$(find "$PROJECT_ROOT/packages/extension/" -maxdepth 1 -name "*.vsix" | head -1)
if [ -n "$VSIX_FILE" ]; then
    VSIX_SIZE=$(du -h "$VSIX_FILE" | cut -f1)
    VSIX_NAME=$(basename "$VSIX_FILE")

    echo "📦 VS Code Extension:"
    echo "   File: $VSIX_NAME"
    echo "   Size: $VSIX_SIZE"
    echo "   Status: ✅ Installed in VS Code"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. Reload VS Code window to activate the extension:"
    echo "      - Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux)"
    echo "      - Type: Developer: Reload Window"
    echo ""
    echo "   2. Verify the extension is active:"
    echo "      - Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux)"
    echo "      - Type: Extensions: Show Installed Extensions"
    echo "      - Look for 'VSC-Bridge'"
    echo ""
else
    echo "⚠️  Warning: VSIX file not found!"
    echo "   Expected location: $PROJECT_ROOT/packages/extension/*.vsix"
    echo "   Current directory: $(pwd)"
    echo "   Contents of packages/extension/:"
    find "$PROJECT_ROOT/packages/extension/" -maxdepth 1 -type f -ls 2>/dev/null | head -10 || echo "   Directory not found!"
    echo ""
    echo "   Run 'just package-extension' to create it."
    echo ""
fi

echo "🔗 CLI Tools Available:"
echo "   vscb - VS Code Bridge CLI (run 'vscb --help' for usage)"
echo ""
echo "🤖 MCP Server:"
if command -v claude >/dev/null 2>&1 && claude mcp list 2>/dev/null | grep -q "vsc-bridge"; then
    echo "   Status: ✅ Configured and connected"
    echo "   Command: vscb mcp --workspace $PROJECT_ROOT"
    echo "   Verify: claude mcp list"
else
    echo "   Status: ⚠️  Not configured (Claude CLI not available)"
    echo "   Manual setup: just claude-add-mcp"
fi
echo ""
echo "📚 Installation Scripts Available:"
echo ""
echo "   For installing vscb on your host machine (outside the dev container):"
echo ""
echo "   Linux / macOS / WSL:"
echo "   ────────────────────"
echo "   bash scripts/install-vscb.sh"
echo "   # Or: just install-vscb"
echo ""
echo "   Windows (PowerShell):"
echo "   ─────────────────────"
echo "   .\scripts\install-vscb.ps1"
echo "   # Or: just install-vscb-windows"
echo ""
echo "   Verification:"
echo "   ─────────────"
echo "   bash scripts/verify-vscb.sh"
echo "   # Or: just verify-vscb"
echo ""
echo "   See README.md for detailed installation and usage instructions."
echo ""
echo "════════════════════════════════════════════════════════════════"
