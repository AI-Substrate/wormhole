# VSC-Bridge Build Commands
# Complete build system with CLI and breakpoint management

# Default recipe - show available commands
default:
    @just --list

# Install all dependencies
install:
    @echo "Installing workspace dependencies from root..."
    npm install
    @echo "✅ All dependencies installed via workspace"

# Build everything properly
build: validate-paths build-manifest build-base-classes build-extension build-cli build-docs
    @echo "✅ Full build complete!"
    @echo "Run 'just install-global' to make vscb available globally"

# Validate webpack and TypeScript paths are synchronized
validate-paths:
    @echo "Validating webpack and TypeScript paths..."
    @node scripts/validate-paths.cjs

# Build script manifest (required for script loading)
build-manifest:
    @echo "Building script manifest..."
    npx tsx scripts/build-manifest.cts
    @echo "Manifest v2 generated with full metadata"

# Generate Zod schemas from manifest
build-schemas: build-manifest
    @echo "Generating Zod schemas..."
    cd packages/extension && npx tsx scripts/generate-zod-schemas.ts
    @echo "Zod schemas generated to packages/extension/src/vsc-scripts/generated/"

# Compile base classes (required for scripts to load)
build-base-classes: build-schemas
    @echo "Compiling base classes for script loading..."
    cd packages/extension && npx tsc
    @echo "Base classes compiled to packages/extension/out/core/scripts/"

# Build extension with webpack
build-extension: build-manifest build-base-classes
    @echo "Building extension..."
    cd packages/extension && npm run compile

# Build CLI
build-cli:
    @echo "Building CLI..."
    npm run build:cli

# Build documentation (copy docs to dist)
build-docs:
    @echo "Copying MCP documentation..."
    @mkdir -p src/lib/mcp/docs
    @cp docs/mcp-prompts/*.md src/lib/mcp/docs/ 2>/dev/null || true
    @mkdir -p dist/lib/mcp/docs
    @cp src/lib/mcp/docs/*.md dist/lib/mcp/docs/ 2>/dev/null || true
    @echo "✅ MCP docs copied to dist/"

# Compile extension (webpack)
compile-extension:
    @echo "Compiling extension..."
    cd packages/extension && npm run compile

# Compile tests
compile-tests:
    @echo "Compiling tests..."
    cd packages/extension && npm run compile-tests

# Run all tests (EventWriter unit tests + integration tests)
test: test-extension test-integration

# Run cross-language integration tests
# Tests debugging workflows for Python, JavaScript, C#, and Java
# Requires: Extension built, test workspace configured
# Duration: ~50 seconds (Python ~3.5s, JS ~5s, C# ~20s, Java ~3s)
test-integration: build
    @echo "Running cross-language integration tests..."
    npm run test:integration

# Run extension tests
test-extension:
    @echo "Running extension tests..."
    cd packages/extension && npm test

# Run CLI tests
test-cli:
    @echo "Running CLI tests..."
    npx vitest run test-cli/

# Run MCP integration tests via stdio transport
# Tests MCP server communication with Extension Host
# Requires: CLI built (builds automatically), Extension Host (launches automatically)
# Duration: ~20-30 seconds (Extension Host startup + MCP server tests)
test-integration-mcp: build-cli
    @echo "Running MCP integration tests (stdio E2E)..."
    npx vitest run test-cli/integration-mcp/stdio-e2e.test.ts

# Test manifest generation
test-manifest:
    @echo "Testing manifest generation..."
    node scripts/build-manifest.test.js

# Run extension tests with coverage
test-coverage:
    @echo "Running tests with coverage..."
    cd packages/extension && npm run test:coverage

# Lint all code
lint: lint-extension

# Lint extension only
lint-extension:
    @echo "Linting extension..."
    cd packages/extension && npm run lint

# Lint and fix extension
lint-fix-extension:
    @echo "Linting and fixing extension..."
    cd packages/extension && npm run lint -- --fix

# Watch mode for extension development
watch-extension:
    @echo "Starting extension watch mode..."
    cd packages/extension && npm run watch

# Clean build artifacts
clean:
    @echo "Cleaning build artifacts..."
    cd packages/extension && npm run clean

# Package extension for distribution
package-extension: build
    #!/usr/bin/env bash
    set -euo pipefail

    # Validate activation events configuration (architectural requirement)
    # vsc-bridge provides infrastructure (HTTP/MCP servers) that external CLI tools depend on
    # The extension MUST use "*" activation to ensure servers are available immediately
    ACTIVATION=$(node -p "JSON.stringify(require('./packages/extension/package.json').activationEvents || [])")
    if [[ "$ACTIVATION" != '["*"]' ]]; then
        echo "❌ ERROR: Extension must use \"activationEvents\": [\"*\"] for immediate activation"
        echo ""
        echo "   vsc-bridge provides infrastructure (HTTP server on port 3001, MCP server) that"
        echo "   external CLI tools (vscb) depend on. The extension must activate immediately when"
        echo "   VS Code starts to ensure these servers are listening before any external commands."
        echo ""
        echo "   Current activationEvents: $ACTIVATION"
        echo "   Expected: [\"*\"]"
        echo ""
        echo "   Location: packages/extension/package.json (activationEvents field)"
        echo "   See: docs/plans/17-automated-vsix-releases/tasks/phase-2/tasks.md (didyouknow insight #2)"
        exit 1
    fi

    # Determine version based on environment
    if [[ -n "${CI:-}" ]]; then
        # CI build: use package.json version for semantic-release
        VERSION=$(node -p "require('./package.json').version")
        UPDATE_VERSION=false
    else
        # Local build: generate random hash for unique identification
        RANDOM_HASH=$(openssl rand -hex 4)
        VERSION="0.0.1-${RANDOM_HASH}"
        UPDATE_VERSION=true
    fi

    echo "Packaging extension version ${VERSION}..."

    # Ensure artifacts directory exists
    mkdir -p artifacts

    # Clean up old local builds to prevent accumulation
    if [[ -z "${CI:-}" ]]; then
        echo "Cleaning up old local builds..."
        rm -f artifacts/vsc-bridge-0.0.1-*.vsix
    fi

    # For local builds, temporarily update package.json files with the random version
    if [[ "$UPDATE_VERSION" == "true" ]]; then
        echo "Temporarily updating package.json files with version ${VERSION}..."
        # Update root package.json
        node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); pkg.version='${VERSION}'; fs.writeFileSync('package.json', JSON.stringify(pkg,null,2)+'\n');"
        # Update extension package.json
        node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('packages/extension/package.json','utf8')); pkg.version='${VERSION}'; fs.writeFileSync('packages/extension/package.json', JSON.stringify(pkg,null,2)+'\n');"
    fi

    # Package with vsce
    # --no-dependencies: Dependencies bundled via webpack (vscode:prepublish)
    # --allow-star-activation: Acknowledges "*" activation (suppresses vsce warning)
    cd packages/extension && npx @vscode/vsce package \
        --no-dependencies \
        --allow-star-activation \
        --out "../../artifacts/vsc-bridge-${VERSION}.vsix"
    cd ../..

    # Restore original package.json files for local builds
    if [[ "$UPDATE_VERSION" == "true" ]]; then
        echo "Restoring original package.json files..."
        git checkout package.json packages/extension/package.json 2>/dev/null || true
    fi

    echo "✅ VSIX created: artifacts/vsc-bridge-${VERSION}.vsix"

# Install extension in local VS Code
install-extension: package-extension
    #!/bin/bash
    echo "Installing extension in VS Code..."
    if command -v code >/dev/null 2>&1; then
        echo "Found VS Code CLI, installing extension..."
        code --uninstall-extension AI-Substrate.wormhole 2>/dev/null || true
        code --install-extension artifacts/vsc-bridge-*.vsix
        echo "✅ Extension installed! Restart VS Code to use the updated version."
    elif command -v code-insiders >/dev/null 2>&1; then
        echo "Found VS Code Insiders CLI, installing extension..."
        code-insiders --uninstall-extension AI-Substrate.wormhole 2>/dev/null || true
        code-insiders --install-extension artifacts/vsc-bridge-*.vsix
        echo "✅ Extension installed! Restart VS Code Insiders to use the updated version."
    else
        echo "⚠️  VS Code CLI not found (running in dev container or VS Code not in PATH)"
        echo ""
        echo "📦 VSIX package built successfully:"
        VSIX_PATH=$(ls -1 artifacts/vsc-bridge-*.vsix 2>/dev/null | head -1)
        if [ -n "$VSIX_PATH" ]; then
            echo "   $VSIX_PATH"
            echo "   Size: $(du -h "$VSIX_PATH" | cut -f1)"
        else
            echo "   ERROR: VSIX file not found in artifacts/"
            exit 1
        fi
        echo ""
        echo "📋 Manual installation instructions:"
        echo "   1. Open VS Code on your host machine"
        echo "   2. Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux)"
        echo "   3. Type 'Extensions: Install from VSIX'"
        echo "   4. Navigate to and select: $VSIX_PATH"
        echo "   5. Restart VS Code"
        echo ""
        echo "   OR use the command line from your host:"
        echo "   code --install-extension $VSIX_PATH"
        echo ""
        echo "✅ Build complete - ready for manual installation"
    fi

# Publish extension
publish-extension:
    @echo "Publishing extension..."
    cd packages/extension && npm run publish

# Run security audit
audit:
    @echo "Running security audit..."
    cd packages/extension && npm audit

# Fix security issues
audit-fix:
    @echo "Fixing security issues..."
    cd packages/extension && npm audit fix

# Full build pipeline (install, lint, build, test)
ci: install lint build test
    @echo "CI pipeline complete!"

# Development setup (install and build)
setup: install build
    @echo "Development setup complete!"

# Quick rebuild (compile without full webpack)
quick-build:
    @echo "Quick compile..."
    cd packages/extension && npm run compile

# Run the extension in VS Code (requires VS Code)
run-extension:
    @echo "Opening VS Code with extension..."
    code --extensionDevelopmentPath=./packages/extension

# Test a specific security endpoint
test-healthz:
    @echo "Testing /healthz endpoint..."
    curl -s http://127.0.0.1:3001/healthz | jq '.'

# Test auth rejection (should return 401)
test-auth-reject:
    @echo "Testing auth rejection..."
    curl -s -X POST http://127.0.0.1:3001/breakpoint \
        -H "Content-Type: application/json" \
        -d '{}' | jq '.'

# Show VS Code extension logs
show-logs:
    @echo "Showing extension output channel..."
    code --command "workbench.action.output.toggleOutput"

# Generate conventional commit
commit:
    @echo "Creating conventional commit..."
    npm run commit

# Verify commit message format
verify-commit:
    @echo "Verifying last commit message..."
    npm run commit-lint

# Phase 0 specific: Compile and test security fixes
phase0-test: compile-extension compile-tests
    @echo "Running Phase 0 security tests..."
    cd packages/extension && npm test -- --grep "Security"

# Phase 0 specific: Verify security implementation
phase0-verify:
    @echo "Verifying Phase 0 security implementation..."
    @echo "✓ Checking localhost binding..."
    @grep -q "127.0.0.1" packages/extension/src/extension.ts && echo "  Found localhost binding"
    @echo "✓ Checking auth module..."
    @test -f packages/extension/src/security/auth.ts && echo "  Auth module exists"
    @echo "✓ Checking host guard..."
    @test -f packages/extension/src/security/host.ts && echo "  Host guard exists"
    @echo "✓ Checking /healthz endpoint..."
    @grep -q "/healthz" packages/extension/src/extension.ts && echo "  Health endpoint exists"
    @echo "✓ Checking danger mode gate..."
    @grep -q "dangerMode" packages/extension/src/extension.ts && echo "  Danger mode gate exists"
    @echo "Phase 0 verification complete!"

# Update all dependencies to latest
update-deps:
    @echo "Updating dependencies..."
    cd packages/extension && npm update

# Check for outdated dependencies
check-outdated:
    @echo "Checking for outdated dependencies..."
    cd packages/extension && npm outdated
    npm outdated

# ==========================================
# CLI & DEBUGGING COMMANDS
# ==========================================

# Install vscb CLI globally (recommended for host machines)
install-vscb:
    @echo "Installing vscb CLI globally..."
    @bash scripts/install-vscb.sh

# Install vscb on Windows (PowerShell)
install-vscb-windows:
    @echo "Installing vscb CLI globally (Windows)..."
    @powershell -ExecutionPolicy Bypass -File scripts/install-vscb.ps1

# Verify vscb installation
verify-vscb:
    @echo "Verifying vscb installation..."
    @bash scripts/verify-vscb.sh

# Configure CLI with debug token (for development)
cli-setup:
    @echo "Configuring CLI with debug token..."
    node dist/index.js config set authToken debug-token-12345
    @echo "✅ CLI configured for development"

# ==========================================
# GLOBAL INSTALLATION & AI TOOLS INTEGRATION
# ==========================================
# Note: MCP server is integrated into vscb CLI (not a separate binary)
# The legacy mcp-server/ directory is obsolete and not used

# Build and install MCP server globally (run 'just claude-add-mcp' next to register)
mcp-install: build install-global
    @echo ""
    @echo "✅ VSC-Bridge MCP server built and installed globally!"
    @echo ""
    @echo "⚠️  Next step: Register with Claude Code (project scope)"
    @echo "    Run: just claude-add-mcp"
    @echo ""
    @echo "Available for AI tools:"
    @echo "  - Claude Desktop: just claude-add-mcp ✅"
    @echo "  - GitHub Copilot: just copilot-setup (waiting for MCP support)"
    @echo "  - Cursor IDE: just cursor-setup (waiting for MCP support)"
    @echo "  - Codex AI: just codex-setup (waiting for MCP support)"
    @echo "  - OpenCode: just opencode-setup (waiting for MCP support)"
    @echo ""
    @echo "Check status: just mcp-status"
    @echo "Validate installation: just mcp-validate"

# Link CLI globally to enable 'vscb' command
cli-link:
    @echo "Linking CLI globally..."
    npm link
    @echo "✅ CLI linked - 'vscb' command is now available globally"
    @echo ""
    @echo "MCP server is integrated into vscb. Use: vscb mcp --workspace /path/to/project"

# Install vscb globally (alias for cli-link)
install-global: cli-link
    @echo ""
    @echo "Next steps:"
    @echo "  1. Start VS Code with your project open (Extension Host must be running)"
    @echo "  2. Add to Claude Desktop: just claude-add-mcp"
    @echo "  3. Validate MCP server: just mcp-validate"

# ==========================================
# AI TOOL SPECIFIC CONFIGURATIONS
# ==========================================

# --- Claude Desktop ---
# Add vsc-bridge MCP server to Claude Desktop (actually runs the command)
claude-add-mcp:
    @echo "Adding vsc-bridge MCP server to Claude Desktop (global user config)..."
    @echo "This will use dynamic workspace detection (current directory at runtime)"
    @echo ""
    claude mcp add --transport stdio vsc-bridge -s project -- vscb mcp --workspace $(pwd)
    @echo ""
    @echo "✅ Added to project scope! MCP server will use this project directory:"
    @echo "   $(pwd)"
    @echo ""
    @echo "Note: Each project needs VS Code running with .vsc-bridge/ directory"
    @echo "Test with: claude mcp list"

# Show Claude Desktop configuration JSON
claude-config:
    @echo "Manual configuration for Claude Desktop ~/.claude.json:"
    @echo ""
    @echo '{'
    @echo '  "mcpServers": {'
    @echo '    "vsc-bridge": {'
    @echo '      "command": "vscb",'
    @echo '      "args": ["mcp", "--workspace", "."]'
    @echo '    }'
    @echo '  }'
    @echo '}'
    @echo ""
    @echo "Note: Using '.' makes it work with the current directory dynamically"

# --- GitHub Copilot Integration (Coming Soon) ---
copilot-setup:
    @echo "GitHub Copilot integration coming soon..."
    @echo "VSC-Bridge MCP server will be available for GitHub Copilot"
    @echo "Waiting for MCP support in Copilot Chat"

# --- Cursor IDE Integration (Coming Soon) ---
cursor-setup:
    @echo "Cursor IDE integration coming soon..."
    @echo "VSC-Bridge MCP server will be available for Cursor"
    @echo "Waiting for MCP support in Cursor Composer"

# --- Codex Integration (Coming Soon) ---
codex-setup:
    @echo "Codex integration coming soon..."
    @echo "VSC-Bridge MCP server will be available for Codex AI"
    @echo "Waiting for MCP protocol support"

# --- OpenCode Integration (Coming Soon) ---
opencode-setup:
    @echo "OpenCode integration coming soon..."
    @echo "VSC-Bridge MCP server will be available for OpenCode"
    @echo "Waiting for MCP protocol support"

# List all available AI tool integrations
ai-tools:
    @echo "🤖 VSC-Bridge AI Tool Integrations:"
    @echo ""
    @echo "Ready Now:"
    @echo "  ✅ Claude Desktop - just claude-add-mcp"
    @echo ""
    @echo "Coming Soon (awaiting MCP support):"
    @echo "  ⏳ GitHub Copilot - just copilot-setup"
    @echo "  ⏳ Cursor IDE - just cursor-setup"
    @echo "  ⏳ Codex AI - just codex-setup"
    @echo "  ⏳ OpenCode - just opencode-setup"
    @echo ""
    @echo "Install MCP server: just mcp-install"
    @echo "Check status: just mcp-status"

# Check MCP installation status
mcp-status:
    @echo "VSC-Bridge MCP Status:"
    @echo ""
    @printf "vscb installed: "
    @which vscb > /dev/null 2>&1 && echo "✅ $(which vscb)" || echo "❌ Not found (run: just mcp-install)"
    @printf "vscb version: "
    @vscb --version 2>/dev/null || echo "N/A"
    @printf "Extension Host: "
    @test -d .vsc-bridge && echo "✅ Running (.vsc-bridge/ exists)" || echo "❌ Not running (start VS Code)"
    @printf "Manifest built: "
    @test -f dist/manifest.json && echo "✅ Yes ($(ls -lh dist/manifest.json | awk '{print $5}'))" || echo "❌ No (run: just build)"
    @echo ""
    @echo "Quick test: just mcp-validate"

# Validate MCP server is working correctly
mcp-validate:
    @echo "Testing MCP server (requires Extension Host running)..."
    @echo ""
    @echo "Checking MCP tools availability..."
    @(printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"1.0.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}\n'; \
      sleep 0.2; \
      printf '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}\n'; \
      sleep 0.2) | \
      node dist/index.js mcp --workspace . 2>/dev/null | \
      grep '"id":2' | \
      jq -r 'if .result.tools then "✅ MCP server working! Found \(.result.tools | length) tools available" else "❌ MCP server not returning tools" end' || \
      echo "❌ MCP server failed - ensure Extension Host is running with .vsc-bridge/ directory"

# List available scripts
cli-list:
    @echo "Available scripts:"
    @node dist/index.js script list

# ==========================================
# BREAKPOINT MANAGEMENT
# ==========================================

# Set a breakpoint (usage: just bp-set path=./test.py line=10)
bp-set path line condition="":
    @echo "Setting breakpoint at {{path}}:{{line}}"
    @if [ -n "{{condition}}" ]; then \
        node dist/index.js script run bp.set \
            --param path={{path}} \
            --param line={{line}} \
            --param condition="{{condition}}"; \
    else \
        node dist/index.js script run bp.set \
            --param path={{path}} \
            --param line={{line}}; \
    fi

# Remove a breakpoint (usage: just bp-remove path=./test.py line=10)
bp-remove path line:
    @echo "Removing breakpoint at {{path}}:{{line}}"
    @node dist/index.js script run bp.remove \
        --param path={{path}} \
        --param line={{line}}

# Clear all breakpoints in a file (usage: just bp-clear-file path=./test.py)
bp-clear-file path:
    @echo "Clearing all breakpoints in {{path}}"
    @node dist/index.js script run bp.clear.file \
        --param path={{path}}

# Clear all breakpoints in the project
bp-clear:
    @echo "Clearing all breakpoints in project"
    @node dist/index.js script run bp.clear.project

# List all breakpoints
bp-list:
    @echo "Current breakpoints:"
    @node dist/index.js script run bp.list

# ==========================================
# SAMPLE WORKFLOWS
# ==========================================

# Set test breakpoints in the sample Python file
test-bp-setup:
    @echo "Setting up test breakpoints..."
    just bp-set path="$(pwd)/test/python/sample.py" line=7
    just bp-set path="$(pwd)/test/python/sample.py" line=18 condition='"Bob" in dummy'
    @echo "✅ Test breakpoints set"

# Quick development build (faster than full build)
dev-build:
    @echo "Quick development build..."
    just build-manifest
    just build-schemas
    just build-base-classes
    cd packages/extension && npm run compile
    npm run build:cli
    @echo "✅ Quick build complete"

# Start extension host (requires VS Code)
start:
    @echo "Starting VS Code Extension Development Host..."
    @echo "Press F5 in VS Code to launch the extension"
    @echo "Then run: just cli-setup"
    @echo "Then run: just bp-set path=/your/file.py line=10"

# Full development setup from scratch
dev-setup: install build cli-link cli-setup
    @echo "✅ Development environment ready!"
    @echo ""
    @echo "Next steps:"
    @echo "  1. Press F5 in VS Code to launch extension"
    @echo "  2. Run: just test-bp-setup"
    @echo "  3. Start debugging your code!"

# ==========================================
# DYNAMIC SCRIPT DEVELOPMENT
# ==========================================

# Ensure extension compiles before user runs Extension Host
dev-compile:
    cd packages/extension && npm run compile

# Run dynamic script from test workspace root
dynamic FILE *ARGS:
    cd test && vscb script run -f ../{{FILE}} {{ARGS}}

# DAP capture prototype (rapid iteration - no compilation!)
sample-dap-capture *ARGS:
    cd test && vscb script run -f ../scripts/sample/dynamic/dap-capture.js {{ARGS}}

# Query production debug session capture service
query-capture *ARGS:
    cd test && vscb script run -f ../scripts/sample/dynamic/query-capture.js {{ARGS}}

# Quick test of list-breakpoints sample
sample-bp-list:
    cd test && vscb script run -f ../scripts/sample/dynamic/list-breakpoints.js

# Run list-variables sample with params
sample-vars *ARGS:
    cd test && vscb script run -f ../scripts/sample/dynamic/list-variables.js {{ARGS}}

# Stream large variables to JSONL (Phase 4)
sample-stream *ARGS:
    cd test && vscb script run -f ../scripts/sample/dynamic/stream-variables.js {{ARGS}}
# Run var-children sample for pagination (Phase 2)
# Usage: just sample-var-children --param variablesReference=7 --param start=0 --param count=100
sample-var-children *ARGS:
    cd test && vscb script run -f ../scripts/sample/dynamic/var-children.js {{ARGS}}

# Investigate variable expansion failures (Java Debug Adapter Phase 3 debugging)
# Usage: just investigate-var-expansion
# Or test specific reference: just investigate-var-expansion --param variablesReference=23
investigate-var-expansion *ARGS:
    cd test && vscb script run -f ../scripts/sample/dynamic/investigate-variable-expansion.js {{ARGS}}

# Run echo message sample with optional parameters for hot-reload testing
# Usage: just sample-echo --param greeting="Hello" --param name="Developer"
sample-echo *ARGS:
    cd test && vscb script run -f ../scripts/sample/dynamic/echo-message.js {{ARGS}}

# Quick test with different parameter combinations
sample-echo-test:
    @echo "Test 1: No parameters (defaults)"
    @just sample-echo
    @echo ""
    @echo "Test 2: Custom greeting"
    @just sample-echo --param greeting="Howdy"
    @echo ""
    @echo "Test 3: Custom greeting and name"
    @just sample-echo --param greeting="Bonjour" --param name="Claude"
    @echo ""
    @echo "Test 4: Shout mode"
    @just sample-echo --param greeting="Hey" --param name="Developer" --param shout=true

# Test all dynamic samples
test-dynamic-samples:
    @echo "Testing dynamic script samples..."
    @just sample-bp-list
    @echo "✓ list-breakpoints works"
    @just sample-echo --param greeting="Test"
    @echo "✓ echo-message works (hot-reload + params)"

# Debug status commands (Phase 0b)
sample-debug-status:
    cd test && vscb script run -f ../scripts/sample/dynamic/debug-status.js

sample-debug-tracker:
    cd test && vscb script run -f ../scripts/sample/dynamic/debug-tracker.js

# Run test debug program (in terminal, not through vscb)
test-debug:
    node ./scripts/sample/dynamic/test-debug.js

# Test debug commands
test-debug-status:
    @echo "Testing debug status infrastructure..."
    @echo ""
    @echo "1. First register the DAP tracker:"
    @just sample-debug-tracker
    @echo ""
    @echo "2. Now start debugging test-debug.js in VS Code"
    @echo "   Set a breakpoint at line 19 (debugger statement)"
    @echo ""
    @echo "3. When paused, run: just sample-debug-status"
    @echo ""

# Run test program (for Phase 1 variable testing)
test-vars:
    node ./scripts/sample/dynamic/test-program.js

# Test variable exploration with different parameters (Phase 1)
test-vars-all:
    @echo "Testing variable exploration with different depths..."
    @echo ""
    @echo "1. Depth 1 (no nesting):"
    @just sample-vars --param maxDepth=1
    @echo ""
    @echo "2. Depth 2 (default):"
    @just sample-vars
    @echo ""
    @echo "3. Depth 3 (two levels of nesting):"
    @just sample-vars --param maxDepth=3
    @echo ""
    @echo "4. Limited children (10 max):"
    @just sample-vars --param maxChildren=10
    @echo ""
    @echo "5. Local scope only:"
    @just sample-vars --param scopeFilter=local
    @echo ""

# Test Phase 2 pagination features
test-phase-2:
    @echo "Phase 2: Paging & Expansion Tests"
    @echo ""
    @echo "1. First page (0-99):"
    @just sample-var-children --param variablesReference=7 --param start=0 --param count=100
    @echo ""
    @echo "2. Second page (100-199):"
    @just sample-var-children --param variablesReference=7 --param start=100 --param count=100
    @echo ""
    @echo "3. Large page (0-999):"
    @just sample-var-children --param variablesReference=7 --param start=0 --param count=1000
    @echo ""
    @echo "4. Indexed filter only:"
    @just sample-var-children --param variablesReference=7 --param filter=indexed --param count=50
    @echo ""

# ==========================================
# PLAN DUMPING UTILITIES
# ==========================================

# Dump a plan to scratch/dumps (flattened structure)
# Usage: just dumpplan 8-debug-script-bake-in
# Usage: just dumpplan ./docs/plans/8-debug-script-bake-in
dumpplan plan:
    @echo "Dumping plan: {{plan}}"
    @python3 scripts/dump-plan.py {{plan}}

# List available plans for dumping
list-plans:
    @echo "Available plans in docs/plans/:"
    @ls -1 docs/plans | grep -v "^$" | sort

# Show contents of a plan dump
show-dump plan:
    @echo "Contents of dump for plan: {{plan}}"
    @if [ -d "scratch/dumps/{{plan}}" ]; then \
        echo "Directory: scratch/dumps/{{plan}}"; \
        echo "Files:"; \
        ls -la "scratch/dumps/{{plan}}"; \
    else \
        echo "❌ Dump directory not found: scratch/dumps/{{plan}}"; \
        echo "Run: just dumpplan {{plan}}"; \
    fi

# Clean a specific plan dump
clean-dump plan:
    @echo "Cleaning dump for plan: {{plan}}"
    @if [ -d "scratch/dumps/{{plan}}" ]; then \
        rm -rf "scratch/dumps/{{plan}}"; \
        echo "✅ Removed: scratch/dumps/{{plan}}"; \
    else \
        echo "❌ Dump directory not found: scratch/dumps/{{plan}}"; \
    fi

# Clean all plan dumps
clean-all-dumps:
    @echo "Cleaning all plan dumps..."
    @if [ -d "scratch/dumps" ]; then \
        rm -rf scratch/dumps/*; \
        echo "✅ All dumps cleaned"; \
    else \
        echo "No dumps directory found"; \
    fi

# Package offline installation bundle
package-offline-bundle: build package-extension
    bash ci/scripts/package-offline-bundle.sh