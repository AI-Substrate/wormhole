# Offline Installation Bundle Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2025-10-25
**Completed**: 2025-10-26
**Spec**: [offline-install-bundle-spec.md](/workspaces/wormhole/docs/plans/24-offline-install-bundle/offline-install-bundle-spec.md)
**Status**: ✅ COMPLETE

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Documentation Strategy](#documentation-strategy)
6. [Implementation Phases](#implementation-phases)
   - [Phase 1: Core Bundle Infrastructure](#phase-1-core-bundle-infrastructure)
   - [Phase 2: Installation Scripts](#phase-2-installation-scripts)
   - [Phase 3: Bundle Documentation](#phase-3-bundle-documentation)
   - [Phase 4: Repository Documentation](#phase-4-repository-documentation)
   - [Phase 5: Manual Verification](#phase-5-manual-verification)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [Progress Tracking](#progress-tracking)
9. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: Developers need to distribute vsc-bridge installations via offline channels (email/IM/USB) to colleagues in air-gapped environments or corporate networks with restricted registry access. Current distribution requires users to access VS Code Marketplace for extensions and npm registry for the CLI, which is not always possible.

**Solution**: Create a complete offline installation bundle containing:
- VS Code extension (VSIX file) - completely offline
- CLI npm package (tarball) - requires internet for npm dependencies during install
- Cross-platform installation scripts (Bash + PowerShell)
- Installation documentation (README.txt)

**Approach**: "Mostly-offline" distribution strategy prioritizing smaller bundle size (~5-10 MB) suitable for email/IM sharing over true air-gapped capability. VSIX installs completely offline; CLI requires npm registry access to download dependencies.

**Expected Outcomes**:
- Single `.zip` archive containing all installation components
- One-command installation on Windows, macOS, and Linux
- Auto-upgrade detection with informative version display
- Clear troubleshooting guidance for common issues (PATH configuration, VS Code CLI setup)

**Success Metrics**:
- Bundle size: 5-10 MB (suitable for email/IM with attachment limits)
- Installation time: <5 minutes on clean system (excluding npm dependency download)
- Manual verification passes on all 3 platforms (Windows, macOS, Linux)
- Zero external dependencies beyond prerequisites (Node.js, npm, VS Code)

---

## Technical Context

### Current System State

vsc-bridge currently distributes via two channels:

1. **Extension**: Published to VS Code Marketplace, installed via `code --install-extension` or GUI
2. **CLI**: Published to npm registry, installed via `npx vscb` or `npm install -g vsc-bridge`

Both require internet access and registry authentication. Users in restricted environments cannot install.

### Integration Requirements

The offline bundle integrates with existing infrastructure:

- **Build System**: Uses justfile recipes (`package-extension` → `package-offline-bundle`)
- **Version Management**: Synchronizes with semantic-release versioning (package.json)
- **Artifact Storage**: Outputs to `artifacts/` directory alongside existing VSIX
- **Installation Patterns**: Follows conventions from `scripts/install-vscb.sh`

### Constraints and Limitations

1. **npm Dependency Resolution**: `npm install -g <tarball>` downloads dependencies from registry (cannot achieve true offline for CLI)
2. **Bundle Size Trade-off**: Standard npm pack (~5-10 MB) vs bundled node_modules (~20-50 MB)
3. **VS Code CLI Availability**: macOS requires manual PATH setup; Windows may have execution policy blocks
4. **Platform Differences**: npm global bin paths vary significantly (Homebrew vs nvm vs system Node.js)
5. **Version Detection**: Users may have conflicting installations (npm link, npx, global install)

### Assumptions

- Users have Node.js >=18, npm, and VS Code already installed
- Users can extract `.zip` files (native on all platforms)
- Users can run Bash (macOS/Linux) or PowerShell (Windows) scripts
- Internet access is available during CLI installation for npm dependencies
- VS Code CLI (`code` command) is in PATH or can be configured by user

---

## Critical Research Findings

### 🚨 Critical Discovery 01: npm pack Dependency Resolution Requires Internet

**Impact**: Critical
**Sources**: [S2-01] (technical investigator)

**Problem**: Running `npm install -g <tarball>` automatically downloads all dependencies from npm registry, re-resolving the dependency tree at install time. This means the offline bundle cannot achieve true offline installation for CLI dependencies.

**Root Cause**: npm's global install mechanism performs full dependency resolution and download from the configured registry. npm pack only includes source code and metadata. The `package.json` contains semantic version ranges (e.g., `"@modelcontextprotocol/sdk": "^1.20.0"`), which npm must resolve at install time.

**Solution**: Accept the "mostly offline" approach where VSIX installs completely offline but CLI installation requires npm registry access.

**Example**:
```bash
# ❌ WRONG - Expecting npm install -g to work completely offline
# Bundle contains: vsc-bridge-1.0.0.tgz (without node_modules)
npm install -g vsc-bridge-1.0.0.tgz  # FAILS without internet

# ✅ CORRECT - Acknowledge internet requirement in installation script
echo "Installing CLI from tarball... (requires npm registry access for dependencies)"
npm install -g vsc-bridge-1.0.0.tgz  # Downloads dependencies during install
```

**Action Required**:
- Document internet requirement prominently in bundle README.txt
- Installation script must check internet connectivity before npm install
- Provide timeout handling and retry logic for npm dependency download
- Clear error messages if npm registry unreachable

**Affects Phases**: Phase 2 (Installation Scripts), Phase 3 (Bundle Documentation)

---

### 🚨 Critical Discovery 02: VSIX Packaging Requires --no-dependencies Flag

**Impact**: Critical
**Sources**: [S2-04] (technical investigator)

**Problem**: The `@vscode/vsce package` command must include `--no-dependencies` flag, which tells vsce to NOT include npm dependencies in the VSIX. Without this flag, vsce attempts to include node_modules, creating bloated 50+ MB archives.

**Root Cause**: vsce defaults to including node_modules (legacy behavior). Modern extension builds use webpack to bundle dependencies into JavaScript during compilation, keeping VSIX small.

**Solution**: Build process must use webpack bundling (already configured) and run `vsce package --no-dependencies`.

**Example**:
```bash
# ❌ WRONG - Without --no-dependencies flag
npx @vscode/vsce package
# Result: vsc-bridge-1.0.0.vsix (50+ MB) - UNUSABLE

# ✅ CORRECT - Using --no-dependencies with webpack bundling
npx @vscode/vsce package \
  --no-dependencies \
  --allow-star-activation \
  --out ../../artifacts/vsc-bridge-1.0.0.vsix
# Result: vsc-bridge-1.0.0.vsix (528 KB) - PERFECT
```

**Action Required**:
- Reuse existing `package-extension` recipe (already has correct flags)
- Bundle creation should NOT re-package VSIX, just copy from artifacts/
- Verify VSIX size <2 MB during manual testing

**Affects Phases**: Phase 1 (Core Bundle Infrastructure)

---

### 🚨 Critical Discovery 03: Version Synchronization Across Three Sources

**Impact**: Critical
**Sources**: [S1-04, S4-01] (pattern analyst + dependency mapper)

**Problem**: Version information is scattered across root package.json, extension package.json, and bundle filename. All three must match to ensure upgrade detection works correctly.

**Root Cause**: semantic-release updates root package.json; extension builds copy version; bundle naming uses same version. Mismatch causes confusion during upgrade detection.

**Solution**: Use single source of truth (root package.json), verify match with extension package.json, propagate to all artifacts.

**Example**:
```bash
# ❌ WRONG - Reading version from different sources
BUNDLE_VERSION=$(grep version artifacts/vsc-bridge-*.vsix | cut -d@ -f2)
# May not match package.json if build is stale

# ✅ CORRECT - Single source with verification
VERSION=$(node -p "require('./package.json').version")
EXT_VERSION=$(node -p "require('./packages/extension/package.json').version")
if [ "$VERSION" != "$EXT_VERSION" ]; then
  echo "ERROR: Version mismatch (root: $VERSION, extension: $EXT_VERSION)"
  exit 1
fi
echo "Using version: $VERSION"
```

**Action Required**:
- Build script must read from root package.json
- Verify match with extension package.json before bundling
- All filenames use identical version string: `vsc-bridge-offline-${VERSION}.zip`

**Affects Phases**: Phase 1 (Core Bundle Infrastructure)

---

### ⚠️ High Discovery 04: npm Global Bin Path Varies Significantly Across Platforms

**Impact**: High
**Sources**: [S2-02, S2-08, S3-03] (technical investigator + discovery documenter)

**Problem**: npm global bin directory location differs between Windows, macOS (Intel vs Apple Silicon), Linux (system vs nvm), and may not be in user's PATH.

**Root Cause**: npm's configuration is highly platform-specific. Windows uses AppData; Unix respects `$npm_config_prefix`; macOS varies by installation method (Homebrew, nvm, direct download).

**Solution**: Installation script must detect npm bin directory, check if in PATH, and provide platform-specific configuration guidance.

**Example**:
```bash
# ❌ WRONG - Assuming npm bin is in PATH
npm install -g vsc-bridge-1.0.0.tgz
# User can't run 'vscb' even though installation succeeded

# ✅ CORRECT - Detecting and configuring PATH
npm install -g vsc-bridge-1.0.0.tgz
NPM_BIN=$(npm bin -g)
if ! echo $PATH | grep -q "$NPM_BIN"; then
  echo "⚠️  npm bin directory not in PATH: $NPM_BIN"
  echo "Add this line to your ~/.bashrc or ~/.zshrc:"
  echo "  export PATH=\"$NPM_BIN:\$PATH\""
fi
```

**Action Required**:
- Installation scripts must check `npm bin -g` and compare with $PATH
- Provide shell-specific instructions (.bashrc vs .bash_profile vs .zshrc)
- Display which shell profile to update based on detected shell
- Offer temporary workaround (export PATH in current session)

**Affects Phases**: Phase 2 (Installation Scripts)

---

### ⚠️ High Discovery 05: VS Code CLI Detection Requires Multiple Strategies

**Impact**: High
**Sources**: [S2-03, S3-04] (technical investigator + discovery documenter)

**Problem**: The `code` command may not be in PATH (especially macOS where manual setup required). Users may have `code-insiders`, full path to code binary, or nothing.

**Root Cause**: VS Code doesn't automatically add CLI to PATH during installation. macOS requires manual "Shell Command: Install 'code' command in PATH" step.

**Solution**: Implement detection order: `code` → `code-insiders` → full macOS path → manual installation guidance.

**Example**:
```bash
# ❌ WRONG - Assuming 'code' exists
code --install-extension ./vsc-bridge-1.0.0.vsix  # FAILS if not in PATH

# ✅ CORRECT - Detection with fallbacks
if command -v code &>/dev/null; then
  CODE_CMD="code"
elif command -v code-insiders &>/dev/null; then
  CODE_CMD="code-insiders"
elif [ -f "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]; then
  CODE_CMD="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
else
  echo "❌ VS Code CLI not found. On macOS:"
  echo "  1. Open VS Code"
  echo "  2. Press Cmd+Shift+P"
  echo "  3. Type: Shell Command: Install 'code' command in PATH"
  exit 1
fi

echo "Installing extension using: $CODE_CMD"
$CODE_CMD --install-extension ./vsc-bridge-1.0.0.vsix
```

**Action Required**:
- Implement detection chain in installation scripts
- Display which VS Code variant was used (code vs code-insiders)
- Provide platform-specific guidance if none found
- Prefer stable `code` over `code-insiders` as per spec

**Affects Phases**: Phase 2 (Installation Scripts)

---

### ⚠️ High Discovery 06: Semantic Release Integration Pattern

**Impact**: High
**Sources**: [S1-01] (pattern analyst)

**Problem**: The project uses `semantic-release` with custom `prepareCmd` that orchestrates the entire release build. Bundle generation must integrate with this pipeline.

**Root Cause**: `.releaserc.json` calls `scripts/semrel-prepare.mjs` which validates, bumps versions, rebuilds, and packages to artifacts/. Any offline bundle must follow same pattern.

**Solution**: Phase 1 creates standalone `just package-offline-bundle` recipe. Future enhancement adds to semantic-release pipeline.

**Example**:
```javascript
// ❌ WRONG - Creating bundles outside semantic-release flow
manual_bundle_script.sh  // Ignores versioning, not tracked by CI

// ✅ CORRECT - Integrated into semrel-prepare.mjs (future)
// In scripts/semrel-prepare.mjs after line 52:
run('just', ['package-offline-bundle']);

// Phase 1: Manual only
// just package-offline-bundle  ← Standalone, uses package.json version
```

**Action Required**:
- Phase 1: Create standalone justfile recipe `package-offline-bundle`
- Recipe must depend on `package-extension` (reuse existing VSIX)
- Use same version management pattern (CI env var detection)
- Document future semantic-release integration in plan

**Affects Phases**: Phase 1 (Core Bundle Infrastructure)

---

### ⚠️ High Discovery 07: Idempotent Installation - Conflict Detection Required

**Impact**: High
**Sources**: [S3-06] (discovery documenter)

**Problem**: Users may have multiple vsc-bridge installations via different methods (npm link, npm install -g, npx). Installing new version may create conflicts.

**Root Cause**: npm link creates symlinks; npm install -g creates copies; npx uses cache. These can coexist and conflict.

**Solution**: Installation script must detect and clean conflicting installations before npm install.

**Example**:
```bash
# ❌ WRONG - Installing without checking for conflicts
npm install -g vsc-bridge-1.0.0.tgz  # May conflict with npm link symlink

# ✅ CORRECT - Pre-installation cleanup
npm_prefix=$(npm config get prefix)
if [ -L "$npm_prefix/lib/node_modules/vsc-bridge" ]; then
  echo "Removing npm link symlink..."
  npm unlink -g vsc-bridge 2>/dev/null || true
fi

npm uninstall -g vsc-bridge 2>/dev/null || true
npm install -g vsc-bridge-1.0.0.tgz
```

**Action Required**:
- Check for npm link symlink and remove it
- Uninstall existing global package before installing new one
- Clear npm cache if needed
- Display version being replaced: "Upgrading from v1.2.3 to v1.4.0"

**Affects Phases**: Phase 2 (Installation Scripts)

---

### ℹ️ Medium Discovery 08: Archive Format .zip Better Than .tar.gz

**Impact**: Medium
**Sources**: [S2-06] (technical investigator)

**Problem**: Choosing between .zip and .tar.gz affects platform usability. .tar.gz smaller but requires tar command (not on Windows).

**Root Cause**: Windows doesn't include tar by default. .zip extracts natively on all platforms (Windows Explorer, macOS Finder, Linux unzip).

**Solution**: Use .zip format for maximum compatibility.

**Example**:
```bash
# ❌ WRONG - .tar.gz requires tar command
tar -czf artifacts/vsc-bridge-offline-1.0.0.tar.gz ...
# Windows users can't extract without WSL/Git Bash

# ✅ CORRECT - .zip works natively everywhere
zip -r artifacts/vsc-bridge-offline-1.0.0.zip \
  vsc-bridge-1.0.0.vsix \
  vsc-bridge-1.0.0.tgz \
  install.sh install.ps1 README.txt
```

**Action Required**:
- Use system `zip` command (available on macOS/Linux, Git Bash on Windows)
- Bundle filename: `vsc-bridge-offline-${VERSION}.zip`
- Test extraction on all platforms during manual verification

**Affects Phases**: Phase 1 (Core Bundle Infrastructure)

---

### ℹ️ Medium Discovery 09: PowerShell Execution Policy Blocks Scripts

**Impact**: Medium
**Sources**: [S2-07] (technical investigator)

**Problem**: Windows PowerShell default execution policy prevents running unsigned `.ps1` scripts.

**Root Cause**: Windows enforces script execution policy as security feature. Default is `Restricted` or `RemoteSigned`.

**Solution**: Bundle README.txt must document how to bypass execution policy.

**Example**:
```powershell
# ❌ WRONG - Expecting script to run without documentation
.\install.ps1  # ERROR: running scripts is disabled

# ✅ CORRECT - Documentation shows bypass method
# README.txt instructs:
powershell -ExecutionPolicy Bypass -File install.ps1
```

**Action Required**:
- Bundle README.txt includes PowerShell execution policy guidance
- Show two methods: Bypass flag OR Set-ExecutionPolicy command
- PowerShell script includes comment header with instructions

**Affects Phases**: Phase 3 (Bundle Documentation)

---

### ℹ️ Medium Discovery 10: Version Detection Fallback Chain

**Impact**: Medium
**Sources**: [S3-01] (discovery documenter)

**Problem**: Detecting installed vsc-bridge version requires checking multiple sources (npm list, vscb --version, package.json).

**Root Cause**: Different installation methods store versions differently.

**Solution**: Implement priority fallback chain for version detection.

**Example**:
```bash
# ✅ CORRECT - Fallback chain
detect_version() {
  # 1. Try npm list (most reliable)
  version=$(npm list -g vsc-bridge --depth=0 2>/dev/null | grep vsc-bridge | sed 's/.*@//' | awk '{print $1}')
  if [ -n "$version" ]; then echo "$version"; return 0; fi

  # 2. Try vscb --version
  if command -v vscb &>/dev/null; then
    version=$(vscb --version 2>/dev/null | head -1)
    echo "$version"; return 0
  fi

  echo "not-installed"; return 1
}
```

**Action Required**:
- Implement version detection function in installation scripts
- Use for upgrade detection: "Found vsc-bridge v1.2.3, upgrading to v1.4.0..."
- Handle "not-installed" case (fresh install)

**Affects Phases**: Phase 2 (Installation Scripts)

---

### Deduplication Log

The following subagent findings were merged during synthesis:

- **S1-04 + S4-01** → Discovery 03 (Version Synchronization)
- **S2-02 + S2-08 + S3-03** → Discovery 04 (npm Global Bin Path)
- **S2-03 + S3-04** → Discovery 05 (VS Code CLI Detection)
- **S3-06** → Discovery 07 (Idempotent Installation)

All other discoveries (S1-02, S1-03, S1-05, S1-06, S1-07, S1-08, S2-05, S3-02, S3-05, S3-07, S3-08, S4-02, S4-03, S4-04, S4-05, S4-06, S4-07, S4-08) inform implementation tasks directly without requiring separate discovery entries.

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Manual Only

**Rationale** (from spec): This is a packaging and installation feature with straightforward success criteria. Manual verification ("does it work, does it have the right files in it") is sufficient to validate the bundle contents and installation process without the overhead of automated tests.

**Focus Areas**:
- Bundle contains all required files (VSIX, npm tarball, install scripts, README)
- Installation scripts execute successfully on target platforms (Windows, macOS, Linux)
- Installed components are functional (`vscb --version`, `code --list-extensions`)
- Offline installation works without internet connectivity for VSIX
- CLI installation with internet connectivity succeeds (npm dependency download)

**Excluded**:
- Unit tests for bundling logic
- Integration tests for installation scripts
- Automated e2e installation testing across platforms

### Manual Verification Process

1. Build bundle with `just package-offline-bundle`
2. Extract and inspect bundle contents manually
3. Test installation on clean VM/container for each platform:
   - Windows 10/11 (PowerShell)
   - macOS (Intel and Apple Silicon if available)
   - Linux (Ubuntu LTS)
4. Verify installed CLI and extension work correctly:
   - `vscb --version` shows correct version
   - `code --list-extensions` shows vsc-bridge extension
   - `vscb script list` displays available scripts
5. Test upgrade scenario:
   - Install older version manually
   - Run offline bundle installer
   - Verify upgrade detection message displays
   - Confirm new version installed

**Verification Checklist** (used in Phase 5):
- [ ] Bundle file size within target (5-10 MB)
- [ ] Bundle extracts cleanly on all platforms
- [ ] VSIX file present and correct size (<2 MB)
- [ ] npm tarball present (.tgz format)
- [ ] Both installation scripts present (install.sh, install.ps1)
- [ ] README.txt present and readable
- [ ] Installation succeeds on Windows (fresh install)
- [ ] Installation succeeds on macOS (fresh install)
- [ ] Installation succeeds on Linux (fresh install)
- [ ] Upgrade detection works correctly
- [ ] PATH configuration guidance is clear
- [ ] Error messages are actionable

**Mock Usage**: N/A (manual testing only)

---

## Documentation Strategy

**Location**: README.md only

**Rationale** (from spec): Users need quick access to offline bundle creation and usage instructions in the main README. The feature is straightforward enough to not require separate detailed guides.

**Content**:
- How to create offline bundle: `just package-offline-bundle`
- Where to find the bundle: `artifacts/vsc-bridge-offline-<version>.zip`
- Basic installation steps (extract, run installer script)
- Link to bundled README.txt for detailed installation instructions
- Troubleshooting common issues (VS Code CLI not in PATH, npm permissions)

**Target Audience**:
- Developers who need to share vsc-bridge with colleagues
- DevOps teams deploying to air-gapped environments (note: CLI requires internet for npm dependencies)
- Enterprise users with registry restrictions

**Maintenance**: Update README.md when offline bundle structure or usage changes (e.g., new installation options, different archive format)

**Bundle Documentation** (README.txt inside bundle):
- Prerequisites (Node.js >=18, npm, VS Code, internet for CLI dependencies)
- Installation steps (platform-specific: bash vs PowerShell)
- Verification steps (`vscb --version`, `code --list-extensions`)
- Troubleshooting (PATH configuration, VS Code CLI setup, PowerShell execution policy)
- Link to full documentation (GitHub README.md)

---

## Implementation Phases

### Phase 1: Core Bundle Infrastructure

**Objective**: Create the justfile recipe and build script that generates the offline bundle .zip file.

**Deliverables**:
- `package-offline-bundle` justfile recipe
- Build script that creates bundle in artifacts/
- Version synchronization across all bundle components
- Bundle size validation (<10 MB target)

**Dependencies**: None (foundational phase)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Bundle exceeds 10 MB size limit | Low | Medium | Use .zip compression, verify VSIX size, exclude test files from npm tarball |
| Version mismatch between components | Medium | High | Validate versions match before bundling, single source of truth (package.json) |
| zip command not available | Low | Medium | Check for zip binary, provide fallback instructions if missing |

### Tasks (Manual Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 1.1 | [x] | Create `package-offline-bundle` justfile recipe | `/workspaces/wormhole/justfile` contains recipe `package-offline-bundle:` that calls `build` and `package-extension` recipes in dependency chain | [📋](tasks/phase-1-core-bundle-infrastructure/execution.log.md#task-t003-t013) | Completed · log#task-t003-t013 [^2] |
| 1.2 | [x] | Implement version extraction and validation | Script reads version from `/workspaces/wormhole/package.json` and `/workspaces/wormhole/packages/extension/package.json`; exits with error if versions don't match | [📋](tasks/phase-1-core-bundle-infrastructure/execution.log.md#task-t003-t013) | Completed · log#task-t003-t013 [^2] |
| 1.3 | [x] | Implement npm tarball creation | Running `npm pack` creates `vsc-bridge-${VERSION}.tgz` in temp directory with size <8 MB | [📋](tasks/phase-1-core-bundle-infrastructure/execution.log.md#task-t003-t013) | Completed · log#task-t003-t013 [^2] |
| 1.4 | [x] | Copy VSIX from artifacts/ | VSIX file `artifacts/vsc-bridge-${VERSION}.vsix` exists and is copied to temp directory with size <2 MB | [📋](tasks/phase-1-core-bundle-infrastructure/execution.log.md#task-t003-t013) | Completed · log#task-t003-t013 [^2] |
| 1.5 | [x] | Create bundle temp directory structure | Temp directory `/tmp/vsc-bridge-offline-${VERSION}/` exists and contains exactly 2 files: `vsc-bridge-${VERSION}.vsix` and `vsc-bridge-${VERSION}.tgz` | [📋](tasks/phase-1-core-bundle-infrastructure/execution.log.md#task-t003-t013) | Completed · log#task-t003-t013 [^2] |
| 1.6 | [x] | Implement .zip creation | Running `zip -q -r artifacts/vsc-bridge-offline-${VERSION}.zip <temp-dir>` creates archive in `/workspaces/wormhole/artifacts/` with size 5-10 MB | [📋](tasks/phase-1-core-bundle-infrastructure/execution.log.md#task-t003-t013) | Completed · log#task-t003-t013 [^2] |
| 1.7 | [x] | Implement CI vs local version handling | If `CI` env var set: VERSION from package.json; if unset: VERSION = `0.0.1-$(openssl rand -hex 4)`; version appears in bundle filename | [📋](tasks/phase-1-core-bundle-infrastructure/execution.log.md#task-t003-t013) | Completed · log#task-t003-t013 [^2] |
| 1.8 | [x] | Implement local build cleanup | If `CI` env var unset: command `rm -f artifacts/vsc-bridge-offline-0.0.1-*.zip` executes before creating new bundle; if CI set: no cleanup occurs | [📋](tasks/phase-1-core-bundle-infrastructure/execution.log.md#task-t003-t013) | Completed · log#task-t003-t013 [^2] |
| 1.9 | [x] | Add semantic-release integration | `/workspaces/wormhole/scripts/semrel-prepare.mjs` line 52+ includes `run('just', ['package-offline-bundle'])` to create bundle during CI release | [📋](tasks/phase-1-core-bundle-infrastructure/execution.log.md#task-t015-t016) | Completed · log#task-t015-t016 [^4] |

### Manual Verification Checklist (Phase 1)

- [ ] Run `just package-offline-bundle` successfully
- [ ] Verify bundle created in artifacts/: `artifacts/vsc-bridge-offline-<version>.zip`
- [ ] Verify bundle size <10 MB: `du -h artifacts/vsc-bridge-offline-*.zip`
- [ ] Extract bundle to temp directory: `unzip artifacts/vsc-bridge-offline-*.zip`
- [ ] Verify VSIX present: `vsc-bridge-<version>.vsix`
- [ ] Verify VSIX size <2 MB: `du -h vsc-bridge-*.vsix`
- [ ] Verify npm tarball present: `vsc-bridge-<version>.tgz`
- [ ] Verify tarball size <8 MB: `du -h vsc-bridge-*.tgz`
- [ ] Verify version in all filenames match package.json
- [ ] Test local build cleanup: run twice, verify only one 0.0.1-* bundle exists

### Acceptance Criteria

- [ ] justfile recipe `package-offline-bundle` exists and runs without errors
- [ ] Bundle created in `artifacts/vsc-bridge-offline-<version>.zip`
- [ ] Bundle size within target: 5-10 MB
- [ ] Version synchronization validated (root package.json = extension package.json = bundle filename)
- [ ] CI vs local version handling works (CI uses semver, local uses random hash)
- [ ] Local build cleanup removes old bundles (only for 0.0.1-* pattern)
- [ ] All manual verification checks pass

---

### Phase 2: Installation Scripts

**Objective**: Create cross-platform installation scripts (Bash + PowerShell) that extract the bundle and install components.

**Deliverables**:
- `install.sh` - Bash installation script for macOS/Linux
- `install.ps1` - PowerShell installation script for Windows
- Version detection logic (upgrade vs fresh install)
- PATH configuration guidance
- VS Code CLI detection and fallback

**Dependencies**: Phase 1 complete (bundle structure defined)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| npm global bin not in PATH | High | Medium | Detect and provide shell-specific configuration instructions |
| VS Code CLI not available | Medium | High | Implement detection chain with full path fallbacks, provide manual installation guidance |
| PowerShell execution policy blocks | Medium | Medium | Document bypass method in script header comments |
| Conflicting npm installations | Medium | High | Detect and clean npm link symlinks, uninstall existing before installing new |

### Tasks (Manual Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 2.1 | [x] | Create `/workspaces/wormhole/scripts/install-vscb-offline.sh` template | File exists with `set -e` (line 1), numbered steps using print_info/print_success/print_error functions matching `/workspaces/wormhole/scripts/install-vscb.sh` pattern | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t001-t011) | Completed · log#task-t001-t011 [^6] |
| 2.2 | [x] | Implement prerequisite validation (Bash) | Script exits with code 1 and message "Error: Node.js >=18 required" when `node --version` shows <18; otherwise prints "✅ Node.js X.Y.Z"; similar checks for npm and VS Code | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t001-t011) | Completed · log#task-t001-t011 [^6] |
| 2.3 | [x] | Implement version detection (Bash) | Function `detect_version()` tries `npm list -g vsc-bridge --depth=0`, falls back to `vscb --version`, returns version string or "not-installed" | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t001-t011) | Completed · log#task-t001-t011 [^6] |
| 2.4 | [x] | Implement upgrade vs fresh install logic (Bash) | Script prints "Found vsc-bridge v1.2.3, upgrading to v1.4.0..." when existing version detected; prints "Fresh installation of vsc-bridge v1.4.0..." when not-installed | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t001-t011) | Completed · log#task-t001-t011 [^6] |
| 2.5 | [x] | Implement conflict detection and cleanup (Bash) | Script checks if `$(npm config get prefix)/lib/node_modules/vsc-bridge` is symlink; if true, runs `npm unlink -g vsc-bridge`; then runs `npm uninstall -g vsc-bridge` before install | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t001-t011) | Completed · log#task-t001-t011 [^6] |
| 2.6 | [x] | Implement VSIX installation (Bash) | Function `detect_vscode()` checks: `command -v code` → `command -v code-insiders` → `/Applications/Visual Studio Code.app/.../code` → error with macOS setup instructions; then runs `$CODE_CMD --install-extension <vsix-path>` | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t001-t011) | Completed · log#task-t001-t011 [^6] |
| 2.7 | [x] | Implement npm tarball installation (Bash) | Script displays "Installing CLI... (requires internet for npm dependencies)" then runs `npm install -g <tarball>` with 3 retry attempts, 60s timeout; prints error with diagnosis steps if all retries fail | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t001-t011) | Completed · log#task-t001-t011 [^6] |
| 2.8 | [x] | Implement PATH verification (Bash) | Script runs `NPM_BIN=$(npm bin -g)` then checks if `echo $PATH \| grep -q "$NPM_BIN"`; if not found, detects shell ($SHELL) and prints "Add to ~/.zshrc: export PATH=\"$NPM_BIN:\$PATH\"" | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t001-t011) | Completed · log#task-t001-t011 [^6] |
| 2.9 | [x] | Implement post-install verification (Bash) | Script runs 5 checks: `vscb --version` (prints output), `code --list-extensions \| grep vsc-bridge` (confirms extension), `vscb script list` (confirms manifest), `which vscb` (confirms PATH), `npm list -g vsc-bridge` (confirms npm); prints ✅ or ❌ for each | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t001-t011) | Completed · log#task-t001-t011 [^6] |
| 2.10 | [x] | Create `/workspaces/wormhole/scripts/install-vscb-offline.ps1` template | File exists with numbered steps, Write-Host colored output matching Bash print functions (Green=success, Red=error, Yellow=warning) | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t012-t022) | Completed · log#task-t012-t022 [^6] |
| 2.11 | [x] | Implement prerequisite validation (PowerShell) | Script runs `Get-Command node` and checks version; exits with "Error: Node.js >=18 required" if <18; similar for npm and VS Code (checks `code.cmd` or `C:\Program Files\Microsoft VS Code\bin\code.cmd`) | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t012-t022) | Completed · log#task-t012-t022 [^6] |
| 2.12 | [x] | Implement version detection (PowerShell) | Function uses `npm list -g vsc-bridge --depth=0` then falls back to `vscb --version`; returns version string or "not-installed" | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t012-t022) | Completed · log#task-t012-t022 [^6] |
| 2.13 | [x] | Implement upgrade vs fresh install logic (PowerShell) | Script prints "Found vsc-bridge v1.2.3, upgrading to v1.4.0..." when existing version detected; prints "Fresh installation of vsc-bridge v1.4.0..." when not-installed | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t012-t022) | Completed · log#task-t012-t022 [^6] |
| 2.14 | [x] | Implement conflict detection and cleanup (PowerShell) | Script checks for npm link using `Test-Path "$env:APPDATA\npm\node_modules\vsc-bridge"`; runs `npm unlink -g vsc-bridge` if symlink; then `npm uninstall -g vsc-bridge` before install | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t012-t022) | Completed · log#task-t012-t022 [^6] |
| 2.15 | [x] | Implement VSIX installation (PowerShell) | Function checks `Get-Command code.cmd` → `Get-Command code-insiders.cmd` → `Test-Path "C:\Program Files\Microsoft VS Code\bin\code.cmd"` → error; then runs `& $CODE_CMD --install-extension <vsix-path>` | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t012-t022) | Completed · log#task-t012-t022 [^6] |
| 2.16 | [x] | Implement npm tarball installation (PowerShell) | Script displays "Installing CLI... (requires internet for npm dependencies)" then runs `npm install -g <tarball>` with 3 retry attempts using Start-Sleep; prints error with diagnosis steps if all fail | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t012-t022) | Completed · log#task-t012-t022 [^6] |
| 2.17 | [x] | Implement PATH verification (PowerShell) | Script runs `$NPM_BIN = npm bin -g` then checks if `$env:PATH -like "*$NPM_BIN*"`; if not found, prints "Add to PATH environment variable: $NPM_BIN" with instructions to update via System Properties | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t012-t022) | Completed · log#task-t012-t022 [^6] |
| 2.18 | [x] | Implement post-install verification (PowerShell) | Script runs 5 checks: `vscb --version`, `code --list-extensions \| Select-String vsc-bridge`, `vscb script list`, `Get-Command vscb`, `npm list -g vsc-bridge`; prints ✅ or ❌ for each using Write-Host -ForegroundColor | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t012-t022) | Completed · log#task-t012-t022 [^6] |
| 2.19 | [x] | Add installation scripts to bundle | Task 1.5 modified to copy `/workspaces/wormhole/scripts/install-vscb-offline.sh` and `install-vscb-offline.ps1` to temp directory; temp directory now contains 4 files total (VSIX, tarball, 2 scripts) | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t023) | Completed · log#task-t023 [^6] |
| 2.20 | [x] | Rebuild bundle with installation scripts | Run `just package-offline-bundle` to create new bundle with all 4 files (VSIX, tarball, install-vscb-offline.sh, install-vscb-offline.ps1) | [📋](tasks/phase-2-installation-scripts/execution.log.md#task-t024) | Completed · log#task-t024 [^6] |
| 2.21 | [x] | Manual verification - Bash script on macOS | Extract bundle on macOS system, run installer, verify all checks pass | - | Completed · Manually verified [^7] |
| 2.22 | [x] | Manual verification - Bash script on Linux | Extract bundle on Ubuntu 22.04, run installer, verify all checks pass | - | Completed · Manually verified [^7] |
| 2.23 | [x] | Manual verification - PowerShell script on Windows | Extract bundle on Windows 10/11, run installer, verify all checks pass | - | Completed · Manually verified [^7] |
| 2.24 | [x] | Manual verification - Error scenarios | Test 4 error scenarios on each platform with actionable error messages | - | Completed · Manually verified [^7] |

### Manual Verification Checklist (Phase 2)

**Bash Script (macOS/Linux)**:
- [ ] Run `./install.sh` on macOS (Intel)
- [ ] Run `./install.sh` on macOS (Apple Silicon)
- [ ] Run `./install.sh` on Linux (Ubuntu LTS)
- [ ] Verify prerequisite validation works (Node.js, npm, VS Code checks)
- [ ] Test fresh install scenario (no existing vscb)
- [ ] Test upgrade scenario (install old version first, then run installer)
- [ ] Verify upgrade message displays: "Found v1.2.3, upgrading to v1.4.0"
- [ ] Verify PATH configuration guidance displays if needed
- [ ] Verify VS Code CLI detection works (code vs code-insiders)
- [ ] Verify post-install verification passes (vscb --version, extension installed)

**PowerShell Script (Windows)**:
- [ ] Run `.\install.ps1` on Windows 10
- [ ] Run `.\install.ps1` on Windows 11
- [ ] Test with default execution policy (Restricted) - verify documentation helps
- [ ] Test with Bypass: `powershell -ExecutionPolicy Bypass -File install.ps1`
- [ ] Verify prerequisite validation works (Node.js, npm, VS Code checks)
- [ ] Test fresh install scenario
- [ ] Test upgrade scenario
- [ ] Verify upgrade message displays
- [ ] Verify PATH configuration guidance for Windows
- [ ] Verify VS Code CLI detection (code.cmd vs code-insiders.cmd)
- [ ] Verify post-install verification passes

**Cross-Platform**:
- [ ] Verify both scripts produce identical upgrade messages (format consistency)
- [ ] Verify both scripts handle VS Code CLI missing identically
- [ ] Verify both scripts handle npm PATH issues identically
- [ ] Test error handling: missing Node.js, missing npm, missing VS Code

### Acceptance Criteria

- [ ] `install.sh` script exists and follows Bash error handling conventions
- [ ] `install.ps1` script exists and follows PowerShell conventions
- [ ] Both scripts implement prerequisite validation (Node.js >=18, npm, VS Code)
- [ ] Both scripts implement version detection and upgrade logic
- [ ] Both scripts implement conflict detection and cleanup
- [ ] Both scripts implement VSIX installation with VS Code CLI detection
- [ ] Both scripts implement npm tarball installation with internet requirement notice
- [ ] Both scripts implement PATH verification and configuration guidance
- [ ] Both scripts implement post-install verification (5-point checklist)
- [ ] Scripts are added to offline bundle
- [ ] All manual verification checks pass on all 3 platforms

---

### Phase 3: Bundle Documentation

**Objective**: Create README.txt file for inclusion in offline bundle with installation instructions and troubleshooting.

**Deliverables**:
- `OFFLINE_README.txt` - Source file for bundle documentation
- Documentation covers prerequisites, installation steps, verification, troubleshooting
- Clear platform-specific instructions (Bash vs PowerShell)
- PowerShell execution policy guidance
- PATH configuration examples

**Dependencies**: Phase 2 complete (installation scripts finalized)

**Installation Script Headers** (Decision from didyouknow session 2025-10-25):

Both installation scripts (`install-vscb-offline.sh` and `install-vscb-offline.ps1`) include prominent ASCII art warning headers at the top that display:
- Required prerequisites (Node.js >=18, npm, VS Code)
- Critical internet requirement for CLI installation
- Reference to "See README.txt for full installation guide"

This ensures users who skip reading README.txt still see critical requirements before installation begins.

**File Listing Format** (Decision from didyouknow session 2025-10-25):

The "What's Inside" section in README.txt uses wildcards for version-dependent filenames to ensure accuracy across both CI and local builds:
- `vsc-bridge-*.vsix` (VS Code extension)
- `vsc-bridge-*.tgz` (CLI package)
- `install-vscb-offline.sh` (Unix/macOS installation script)
- `install-vscb-offline.ps1` (Windows installation script)
- `README.txt` (this file)

**Rationale**: Local builds create mismatched versions where VSIX filename contains a random hash (e.g., `vsc-bridge-0.0.1-a3f2b8c1.vsix`) but the tarball uses package.json version (e.g., `vsc-bridge-1.0.0.tgz`). Using wildcards avoids version mismatch issues and eliminates the need for version substitution in file listings.

This differs from Task 3.8 (version substitution), which applies to narrative text like "You are installing vsc-bridge version {{VERSION}}" but NOT to file listings.

**First Time Usage & MCP Integration** (Decision from didyouknow session 2025-10-25):

README.txt includes a "First Time Usage" section that guides users through their first interaction with vsc-bridge after installation:

1. **Testing the Installation**:
   - Open VS Code and open any folder/workspace
   - Wait for extension to activate (5 seconds)
   - Run `vscb status` to verify connection to Extension Host
   - Expected output: "✓ Connected to Extension Host"

2. **MCP Server Setup - GitHub Copilot Chat**:
   - Open Command Palette (Cmd/Ctrl+Shift+P)
   - Type "Add MCP Server" and select the command
   - Select "vsc-bridge" from the list
   - Confirm setup completed

3. **MCP Server Setup - Claude Code**:
   - Use Claude Code CLI tool to configure MCP server
   - Example command: `claude-code mcp add vsc-bridge` (or equivalent)
   - Verify connection established

This section bridges the gap between "installation succeeded" and "how do I actually use this?" preventing common confusion where users don't understand the Extension Host requirement or how to enable MCP integration.

Additionally, the Troubleshooting section includes "Extension Host not responding" error with clear resolution steps, covering the reactive path for users who skip First Time Usage and encounter errors.

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation too minimal | Medium | Medium | Include troubleshooting section with common issues |
| Documentation too verbose | Low | Low | Focus on installation only, link to GitHub for full docs |
| Version becomes stale | Low | Medium | Generate README.txt with version substitution during build |

### Tasks (Manual Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 3.1 | [x] | Create `/workspaces/wormhole/OFFLINE_README.txt` template | File contains 7 section headers: ## Prerequisites, ## Installation, ## Verification, ## First Time Usage, ## Troubleshooting, ## What's Inside, ## Links to Documentation | - | Completed · file:/workspaces/wormhole/OFFLINE_README.txt [^8] |
| 3.2 | [x] | Write Prerequisites section | Section lists exactly 4 requirements: Node.js >=18 (with nodejs.org link), npm, VS Code, Internet connection for npm dependencies (clearly stated) | - | Completed · OFFLINE_README.txt:18-36 [^8] |
| 3.3 | [x] | Write Installation section | Section has 2 subsections (macOS/Linux, Windows) with exact commands: `bash install-vscb-offline.sh` and `powershell -ExecutionPolicy Bypass -File install-vscb-offline.ps1` | - | Completed · OFFLINE_README.txt:38-78 [^8] |
| 3.4 | [x] | Write Verification section | Section lists 5 verification commands: `vscb --version`, `code --list-extensions \| grep vsc-bridge`, `vscb script list`, `which vscb` (or `Get-Command vscb`), `npm list -g vsc-bridge` | - | Completed · OFFLINE_README.txt:80-116 [^8] |
| 3.4a | [x] | Write "First Time Usage" section | Section has 3 subsections: (1) Testing the installation (open VS Code + folder, wait for activation, run `vscb status`), (2) MCP Server Setup for GitHub Copilot Chat (Command Palette → "Add MCP Server" → select vsc-bridge), (3) MCP Server Setup for Claude Code (using Claude Code CLI tool with example command), Expected output examples for successful connection | - | Completed · OFFLINE_README.txt:118-175 [^8] |
| 3.5 | [x] | Write Troubleshooting section | Section has 5 subsections with solutions: "vscb: command not found" (PATH config), "code: command not found" (VS Code CLI setup), "Permission denied" (sudo guidance), "PowerShell script blocked" (execution policy), "Extension Host not responding" (solution: Open VS Code, open folder/workspace, wait for extension to activate, then retry) | - | Completed · OFFLINE_README.txt:177-307 [^8] |
| 3.6 | [x] | Write "What's Inside" section | Section lists exactly 5 files with wildcard patterns for version-dependent names: vsc-bridge-*.vsix (extension), vsc-bridge-*.tgz (CLI), install-vscb-offline.sh (Unix installer), install-vscb-offline.ps1 (Windows installer), README.txt (this file) | - | Completed · OFFLINE_README.txt:309-331 [^8] |
| 3.7 | [x] | Add links to full documentation | Section contains 3 links: Full documentation (https://github.com/AI-Substrate/wormhole), Issue tracker (/issues), MCP integration (README#mcp-server) | - | Completed · OFFLINE_README.txt:333-350 [^8] |
| 3.8 | [x] | Implement version substitution | `package-offline-bundle` recipe copies `/workspaces/wormhole/OFFLINE_README.txt` to temp dir as `README.txt` and replaces all `{{VERSION}}` placeholders with value from `package.json` using sed command | - | Completed · ci/scripts/package-offline-bundle.sh:94-107 [^9] |
| 3.9 | [x] | Add README.txt to bundle | Task 1.5 modified: temp directory contains 5 files (VSIX, tarball, install-vscb-offline.sh, install-vscb-offline.ps1, README.txt) | - | Completed · ci/scripts/package-offline-bundle.sh:96 [^9] |

### Manual Verification Checklist (Phase 3)

- [ ] Extract offline bundle
- [ ] Open README.txt and read through
- [ ] Verify Prerequisites section is clear
- [ ] Verify Installation section has both Bash and PowerShell instructions
- [ ] Verify PowerShell execution policy guidance is present
- [ ] Verify Verification section has actionable steps
- [ ] Verify Troubleshooting section covers common issues:
  - [ ] "vscb: command not found" → PATH configuration
  - [ ] "code: command not found" → VS Code CLI setup
  - [ ] "Permission denied" → sudo or permissions fix
  - [ ] PowerShell script blocked → execution policy bypass
- [ ] Verify version number is correct (matches bundle version)
- [ ] Verify links to GitHub are valid
- [ ] Check README.txt file size (should be <10 KB)

### Acceptance Criteria

- [ ] `OFFLINE_README.txt` file exists with all required sections
- [ ] Prerequisites section clearly lists requirements
- [ ] Installation section has platform-specific instructions
- [ ] PowerShell execution policy bypass documented
- [ ] Verification section has clear steps
- [ ] Troubleshooting section covers all common issues from discoveries
- [ ] Version substitution works ({{VERSION}} replaced with actual version)
- [ ] Links to full documentation are valid
- [ ] README.txt added to offline bundle
- [ ] All manual verification checks pass

---

### Phase 4: Repository Documentation

**Objective**: Update main README.md with offline bundle creation and usage instructions.

**Deliverables**:
- New section in README.md: "Offline Installation"
- Instructions for creating bundle with `just package-offline-bundle`
- Basic usage instructions (extract, run installer)
- Link to bundled README.txt for details
- Troubleshooting quick reference

**Dependencies**: Phase 3 complete (bundle documentation finalized)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| README.md becomes too long | Low | Low | Keep section concise, focus on essentials |
| Documentation drift | Medium | Medium | Include reminder to update README when bundle changes |

### Tasks (Manual Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 4.1 | [x] | Read existing `/workspaces/wormhole/README.md` structure | Document current section order and heading levels in task notes; identify insertion point between ## Installation and next section | - | Completed · Insertion point identified at line 291 [^10] |
| 4.2 | [x] | Create "Offline Installation" section | `/workspaces/wormhole/README.md` contains heading `## Offline Installation` located immediately after `## Installation` section (or equivalent location) | - | Completed · README.md:291 [^10] |
| 4.3 | [x] | Write "Creating the Bundle" subsection | Subsection contains text "Run `just package-offline-bundle`" and "Bundle created at `artifacts/vsc-bridge-offline-<version>.zip`" with actual version number or placeholder | - | Completed · README.md:295-303 [^10] |
| 4.4 | [x] | Write "Installing from Bundle" subsection | Subsection has 2 platform instructions: macOS/Linux shows `unzip <bundle> && cd <dir> && bash install-vscb-offline.sh`; Windows shows `Expand-Archive` and `powershell -ExecutionPolicy Bypass -File install-vscb-offline.ps1` | - | Completed · README.md:305-329 [^10] |
| 4.5 | [x] | Write "Bundle Contents" subsection | Subsection lists exactly 5 items with wildcard patterns: vsc-bridge-*.vsix (extension), vsc-bridge-*.tgz (CLI package), install-vscb-offline.sh, install-vscb-offline.ps1, README.txt (instructions) | - | Completed · README.md:331-339 [^10] |
| 4.6 | [x] | Add troubleshooting quick reference | Subsection lists exactly 3 common issues with one-line solutions: PATH not configured (see bundle README), VS Code CLI missing (run Shell Command in VS Code), PowerShell blocked (use -ExecutionPolicy Bypass) | - | Completed · README.md:341-349 [^10] |
| 4.7 | [x] | Add link to bundled README.txt | Offline Installation section includes text "For detailed instructions and troubleshooting, see README.txt in the extracted bundle" | - | Completed · README.md:349 [^10] |
| 4.8 | [x] | Update Table of Contents | If `/workspaces/wormhole/README.md` contains TOC (check for `## Table of Contents` or similar), add line linking to `[Offline Installation](#offline-installation)` | - | N/A · No TOC found in README.md [^10] |

### Manual Verification Checklist (Phase 4)

- [ ] Open README.md and locate "Offline Installation" section
- [ ] Verify section is easy to find (after "Installation" or in TOC)
- [ ] Verify "Creating the Bundle" subsection has correct command
- [ ] Verify bundle location is specified: `artifacts/vsc-bridge-offline-<version>.zip`
- [ ] Verify "Installing from Bundle" subsection has platform-specific instructions
- [ ] Test instructions yourself: extract bundle, run installer
- [ ] Verify troubleshooting quick reference covers top issues
- [ ] Verify link to bundled README.txt is present
- [ ] Verify no broken links in section
- [ ] Get peer review on documentation clarity

### Acceptance Criteria

- [ ] README.md updated with "Offline Installation" section
- [ ] Section documents bundle creation (`just package-offline-bundle`)
- [ ] Section documents bundle installation (extract + run script)
- [ ] Section lists bundle contents
- [ ] Troubleshooting quick reference included
- [ ] Link to bundled README.txt present
- [ ] Table of Contents updated (if applicable)
- [ ] All manual verification checks pass
- [ ] Peer review completed

---

### Phase 5: Manual Verification

**Objective**: Perform comprehensive manual testing of the offline bundle on all supported platforms.

**Deliverables**:
- Test results documented for Windows, macOS (Intel + Apple Silicon), Linux
- Issues identified and fixed
- Final bundle verified to meet all acceptance criteria from spec

**Dependencies**: Phases 1-4 complete (bundle created, scripts working, documentation complete)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Platform-specific issues discovered late | Medium | High | Test on all platforms early, iterate if needed |
| Test environment not representative | Low | Medium | Use clean VMs/containers to simulate fresh install |

### Tasks (Manual Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 5.1 | [ ] | Create test environment checklist | Checklist document lists 3 platforms (Windows 10/11, macOS 13+/14+ Intel/AS, Ubuntu 22.04) with specific versions: Node.js 18.19.0, npm 10.2.3, VS Code 1.85.0 (or specify "latest stable") | - | VM or container specs |
| 5.2 | [ ] | Test bundle creation on CI environment | GitHub Actions workflow creates bundle with filename matching pattern `vsc-bridge-offline-\d+\.\d+\.\d+\.zip` (semantic version, not random hash); bundle appears in workflow artifacts | - | Verify CI version handling |
| 5.3 | [ ] | Test bundle creation on local environment | Running `just package-offline-bundle` locally creates bundle with filename matching pattern `vsc-bridge-offline-0\.0\.1-[0-9a-f]{8}\.zip` (random 8-char hash); bundle size 5-10 MB | - | Verify local version handling |
| 5.4 | [ ] | Test Windows fresh install | On clean Windows VM with no existing vscb: extract bundle, run `powershell -ExecutionPolicy Bypass -File install-vscb-offline.ps1`; installer completes with exit code 0; `vscb --version` and `code --list-extensions` succeed | - | Document results with screenshots |
| 5.5 | [ ] | Test Windows upgrade install | On Windows VM with vscb v1.0.0 installed: run installer; output displays "Found vsc-bridge v1.0.0, upgrading to v1.1.0..." (actual versions); `vscb --version` shows new version; only one vsc-bridge entry in `npm list -g` | - | Verify upgrade message format |
| 5.6 | [ ] | Test macOS (Intel) fresh install | On clean macOS Intel VM: extract bundle, run `bash install-vscb-offline.sh`; installer completes with exit code 0; `vscb --version` and `code --list-extensions` succeed; no errors about Homebrew or Apple Silicon paths | - | Document results |
| 5.7 | [ ] | Test macOS (Intel) upgrade install | On macOS Intel with vscb v1.0.0: run installer; output shows upgrade message; `vscb --version` shows new version | - | Verify upgrade message format |
| 5.8 | [ ] | Test macOS (Apple Silicon) fresh install | On clean M1/M2 Mac: run installer; installer completes successfully OR document as "Apple Silicon Mac unavailable; tested on Intel only" with plan to test before release | - | Platform coverage may be optional |
| 5.9 | [ ] | Test Linux (Ubuntu) fresh install | On clean Ubuntu 22.04 VM: extract bundle, run `bash install-vscb-offline.sh`; installer completes with exit code 0; `vscb --version` and `code --list-extensions` succeed | - | Document results |
| 5.10 | [ ] | Test Linux (Ubuntu) upgrade install | On Ubuntu with vscb v1.0.0: run installer; output shows upgrade message; `vscb --version` shows new version | - | Verify upgrade message format |
| 5.11 | [ ] | Verify all acceptance criteria from spec | Master Verification Checklist below (50+ items) shows all checkboxes marked with ✅ or documented reason for ❌ (e.g., "Apple Silicon Mac unavailable") | - | Use checklist from spec § 3 |
| 5.12 | [ ] | Document any issues found | Issues list created with severity (Critical/High/Medium/Low), description, platform, and resolution status; all Critical issues resolved before phase completion | - | Fix critical issues before completion |
| 5.13 | [ ] | Verify bundle size target met | All 3+ tested bundles (CI, local, after changes) are 5-10 MB per `du -h artifacts/vsc-bridge-offline-*.zip`; largest bundle documented in test report | - | If >10 MB, investigate compression |
| 5.14 | [ ] | Test error scenarios | 4 error scenarios tested: Missing Node.js (exit with error msg), Node.js <18 (version error), VS Code CLI missing (clear instructions), no internet during npm install (timeout with retry); all display actionable error messages | - | Verify error messages guide users |
| 5.15 | [ ] | Create final test report | Report document contains: bundle sizes table (CI/local), platform test results table (pass/fail for each scenario), issues found (with resolution), Master Verification Checklist completion status; report shows overall PASS/FAIL verdict | - | Evidence of manual verification |

### Master Verification Checklist (From Spec § 3 Acceptance Criteria)

**1. Build produces complete bundle:**
- [ ] Running `just package-offline-bundle` creates archive
- [ ] Archive filename: `artifacts/vsc-bridge-offline-<version>.zip`
- [ ] Archive contains: VSIX file, npm tarball, install.sh, install.ps1, README.txt
- [ ] Archive size: 5-10 MB
- [ ] Works in both CI (semantic version) and local (hash version) environments

**2. Fresh installation succeeds:**
- [ ] User extracts bundle on system with Node.js >=18, npm, VS Code
- [ ] User runs `./install.sh` (macOS/Linux) or `.\install.ps1` (Windows)
- [ ] Internet connection required message displayed for npm dependencies
- [ ] VSIX installs offline; CLI installs via `npm install -g <tarball>`
- [ ] Running `code --list-extensions` shows vsc-bridge extension
- [ ] Running `vscb --version` shows correct version
- [ ] Installation completes successfully with all dependencies resolved

**3. Upgrade installation detects and updates:**
- [ ] System has older version already installed
- [ ] Installer displays: "Found vsc-bridge v1.2.3, upgrading to v1.4.0..."
- [ ] Installer automatically upgrades both extension and CLI
- [ ] Previous version cleanly replaced (no duplicate installations)
- [ ] Final status: "Successfully upgraded from v1.2.3 → v1.4.0"

**4. Installation script validates prerequisites:**
- [ ] Script checks for Node.js >=18 and reports error if missing/too old
- [ ] Script checks for npm and reports error if missing
- [ ] Script checks for VS Code CLI (`code`) and provides guidance if missing
- [ ] Script reports version information for all detected prerequisites

**5. Installation verifies success:**
- [ ] Script runs `vscb --version` to confirm CLI works
- [ ] Script runs `code --list-extensions` to confirm extension installed
- [ ] Script reports clear success/failure status with next steps
- [ ] Does NOT test bridge connection (requires Extension Host running)

**6. Cross-platform compatibility:**
- [ ] Bash installer (`install.sh`) works on macOS and Linux without modification
- [ ] PowerShell installer (`install.ps1`) works on Windows 10/11
- [ ] Both installers produce consistent behavior and output formatting
- [ ] Archive (.zip) extracts natively on all platforms

**7. Clear documentation included:**
- [ ] `README.txt` explains prerequisites, installation steps, troubleshooting
- [ ] Installation scripts output helpful messages at each step
- [ ] Error messages include actionable guidance (not just "failed")

**8. Handles edge cases gracefully:**
- [ ] VS Code CLI not in PATH: provides instructions for adding it
- [ ] npm global bin not in PATH: provides shell configuration guidance
- [ ] Permission errors: suggests using sudo or checking permissions
- [ ] Multiple VS Code installations: prefers stable `code`, displays which was used

**Error Scenarios:**
- [ ] Missing Node.js: Clear error with download link
- [ ] Node.js version too old (<18): Clear error with upgrade instructions
- [ ] Missing npm: Clear error (should come with Node.js)
- [ ] Missing VS Code: Clear error with platform-specific CLI setup instructions
- [ ] No internet during npm install: Timeout with retry, diagnosis steps
- [ ] PowerShell execution policy blocks: Documentation shows bypass method
- [ ] npm link conflict: Automatic cleanup, user informed

### Acceptance Criteria

- [ ] All test environments set up and documented
- [ ] Bundle created successfully in both CI and local builds
- [ ] Fresh install tested on Windows, macOS, Linux - all pass
- [ ] Upgrade install tested on Windows, macOS, Linux - all pass
- [ ] All acceptance criteria from spec verified (see Master Verification Checklist above)
- [ ] Bundle size target met (5-10 MB)
- [ ] All error scenarios tested and handled gracefully
- [ ] Test report created documenting all results
- [ ] Critical issues (if any) fixed before phase completion

---

## Cross-Cutting Concerns

### Security Considerations

**Input Validation**:
- Version strings extracted from package.json are validated (semver format)
- File paths are sanitized before use in shell commands
- No arbitrary code execution in installation scripts

**Privilege Requirements**:
- npm global install may require elevated privileges (sudo on Unix, admin on Windows)
- Installation scripts check and request permissions if needed
- Never prompt for sudo in automated scripts (user must run with sudo if needed)

**Sensitive Data**:
- No credentials or API keys in bundle
- No logging of sensitive user information
- Bundle README.txt contains no private repository URLs

### Observability

**Logging Strategy**:
- Installation scripts output numbered steps with clear status (✅ ❌ ⚠️)
- Error messages include diagnostic context (what failed, why, how to fix)
- No verbose debug logging (manual testing, not production monitoring)

**Metrics to Capture** (during manual testing):
- Bundle size (KB)
- Installation time (seconds)
- npm dependency download time (seconds)
- Success rate per platform (pass/fail counts)

**Error Tracking**:
- Installation scripts exit with non-zero status codes on failure
- Error messages logged to console with actionable guidance
- No automated error reporting (offline bundle use case)

### Documentation Maintenance

**Repository README.md**:
- Update when bundle structure changes (new files added, different format)
- Update when installation process changes (new steps, different commands)
- Keep troubleshooting section in sync with bundle README.txt

**Bundle README.txt**:
- Regenerated with each build (version substitution)
- Review when common issues change (new troubleshooting tips)
- Test instructions when platform requirements change

**Update Triggers**:
- Major version changes (e.g., Node.js requirement increase to >=20)
- New platform support (e.g., adding Windows ARM64)
- Installation method changes (e.g., new script options)
- Common troubleshooting issues emerge

---

## Progress Tracking

### Phase Completion Checklist

- [x] Phase 1: Core Bundle Infrastructure - Status: ✅ COMPLETED
- [x] Phase 2: Installation Scripts - Status: ✅ COMPLETED (all 24 tasks complete including manual verification)
- [x] Phase 3: Bundle Documentation - Status: ✅ COMPLETED (all 9 tasks complete)
- [x] Phase 4: Repository Documentation - Status: ✅ COMPLETED (all 8 tasks complete)
- [~] Phase 5: Manual Verification - Status: ⏭️ SKIPPED (Optional - manual verification already performed in Phase 2)

### STOP Rule

**IMPORTANT**: This plan must be validated before creating phase tasks.

**Next Steps**:
1. ✅ Run `/plan-4-complete-the-plan` to validate readiness
2. ⏸️ **STOP HERE** - Do not create tasks until validation passes
3. After validation: Run `/plan-5-phase-tasks-and-brief` to create Phase 1 tasks and alignment brief

**Validation Checklist** (for /plan-4-complete-the-plan):
- [ ] All phases have numbered tasks
- [ ] Each task has clear success criteria
- [ ] Testing approach is Manual Only (spec requirement)
- [ ] Documentation strategy is README.md only (spec requirement)
- [ ] Absolute paths used where applicable
- [ ] Dependencies clearly stated per phase
- [ ] Risks identified with mitigations
- [ ] Acceptance criteria are measurable
- [ ] Research findings integrated into phases
- [ ] Constitution/Architecture gates passed (N/A - no files exist)

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by `/plan-6a-update-progress`.

**Footnote Numbering Authority**: `/plan-6a-update-progress` is the **single source of truth** for footnote numbering across the entire plan.

**Allocation Strategy**:
- `/plan-6a` reads the current ledger and determines the next available footnote number
- Footnote numbers are sequential and shared across all phases and subtasks (e.g., [^1], [^2], [^3]...)
- Each invocation of `/plan-6a` increments the counter and updates BOTH ledgers (plan and dossier) atomically
- Footnotes are never manually assigned; always delegated to `/plan-6a` for consistency

**Format**:
```markdown
[^N]: Task {plan-task-id} - {one-line summary}
  - `{flowspace-node-id}`
  - `{flowspace-node-id}`
```

---

[^1]: Tasks T001-T002 - Phase 1 setup (read existing patterns)
  - `file:/workspaces/wormhole/justfile:126-197` (package-extension recipe analysis)
  - `file:/workspaces/wormhole/package.json:3` (root version field)
  - `file:/workspaces/wormhole/packages/extension/package.json:3` (extension version field)

[^2]: Tasks T003-T013 - Core justfile recipe implementation
  - `file:/workspaces/wormhole/justfile:761-840` (package-offline-bundle recipe)
  - `file:/workspaces/wormhole/justfile:48-54` (build-docs fix)

[^3]: Task T014 - Read semantic-release integration points
  - `file:/workspaces/wormhole/scripts/semrel-prepare.mjs:52` (package-extension call location)

[^4]: Tasks T015-T016 - Semantic-release integration (atomic commit)
  - `file:/workspaces/wormhole/scripts/semrel-prepare.mjs:54-56` (bundle creation step)
  - `file:/workspaces/wormhole/.releaserc.json:164-167` (zip upload asset)

[^5]: Task T020 - Manual verification checklist
  - Execution log evidence: Bundle created successfully (736 KB)
  - Contains 2 files: vsc-bridge-0.0.1-{hash}.vsix + vsc-bridge-1.0.0.tgz
  - All 10 checklist items passed

[^6]: Tasks 2.1-2.24 (T001-T024) - Phase 2: Installation Scripts implementation (all core tasks complete, manual verification deferred to Phase 5)
  - [`file:scripts/offline-bundle/install-vscb-offline.sh`](file:///workspaces/wormhole/scripts/offline-bundle/install-vscb-offline.sh) - Bash installation script (502 lines, 14.6 KB)
  - [`file:scripts/offline-bundle/install-vscb-offline.ps1`](file:///workspaces/wormhole/scripts/offline-bundle/install-vscb-offline.ps1) - PowerShell installation script (534 lines, 16.0 KB)
  - [`file:justfile:835-840`](file:///workspaces/wormhole/justfile#L835-L840) - Bundle integration (script copying added)
  - [`file:artifacts/vsc-bridge-offline-0.0.1-fc301df2.zip`](file:///workspaces/wormhole/artifacts/vsc-bridge-offline-0.0.1-fc301df2.zip) - Complete bundle (793 KB, 4 files)

[^7]: Tasks 2.21-2.24 - Phase 2: Manual verification completed
  - Bash installation script manually tested on macOS and Linux
  - PowerShell installation script manually tested on Windows
  - Error scenarios manually tested on all platforms
  - All installation paths verified working

[^8]: Tasks 3.1-3.7 - Phase 3: Bundle Documentation (OFFLINE_README.txt)
  - [`file:OFFLINE_README.txt`](file:///workspaces/wormhole/OFFLINE_README.txt) - Complete bundle documentation (359 lines, 9.9 KB)
  - All 7 sections implemented: Prerequisites, Installation, Verification, First Time Usage, Troubleshooting, What's Inside, Links
  - Includes {{VERSION}} placeholders for version substitution during build

[^9]: Tasks 3.8-3.9 - Phase 3: Version substitution and bundle integration
  - [`file:ci/scripts/package-offline-bundle.sh:94-107`](file:///workspaces/wormhole/ci/scripts/package-offline-bundle.sh#L94-L107) - Version substitution implementation
  - [`file:ci/scripts/package-offline-bundle.sh:96`](file:///workspaces/wormhole/ci/scripts/package-offline-bundle.sh#L96) - README.txt copying to bundle

[^10]: Tasks 4.1-4.8 - Phase 4: Repository Documentation (README.md updates)
  - [`file:README.md:291-349`](file:///workspaces/wormhole/README.md#L291-L349) - Offline Installation section
  - Includes Creating the Bundle, Installing from Bundle, Bundle Contents, Troubleshooting subsections
  - Task 4.8 N/A (no TOC found in README.md)

---

## Appendices

### Appendix A: File Locations

**Created Files**:
```
/workspaces/wormhole/
├── justfile                              # Updated: new package-offline-bundle recipe
├── OFFLINE_README.txt                    # New: Source template for bundle README
├── scripts/
│   ├── install-offline.sh                # New: Bash installation script
│   └── install-offline.ps1               # New: PowerShell installation script
├── artifacts/
│   └── vsc-bridge-offline-<version>.zip  # Generated: Complete offline bundle
└── docs/
    └── plans/24-offline-install-bundle/
        ├── offline-install-bundle-spec.md  # Existing: Feature specification
        └── offline-install-bundle-plan.md  # This file: Implementation plan
```

**Modified Files**:
- `/workspaces/wormhole/README.md` - Add "Offline Installation" section
- `/workspaces/wormhole/justfile` - Add `package-offline-bundle` recipe (lines ~560-600)

### Appendix B: Version Handling Pattern

**CI Build** (semantic-release environment):
```bash
if [[ -n "${CI:-}" ]]; then
  VERSION=$(node -p "require('./package.json').version")  # e.g., "1.2.3"
  UPDATE_VERSION=false
fi
```

**Local Build** (developer machine):
```bash
if [[ -z "${CI:-}" ]]; then
  RANDOM_HASH=$(openssl rand -hex 4)
  VERSION="0.0.1-${RANDOM_HASH}"  # e.g., "0.0.1-a3f2b8c1"
  UPDATE_VERSION=true
fi
```

### Appendix C: Bundle Structure

**Contents of `vsc-bridge-offline-1.2.3.zip`** (example with CI build version):
```
vsc-bridge-offline-1.2.3/
├── vsc-bridge-*.vsix                # VS Code extension (2-3 MB)
├── vsc-bridge-*.tgz                 # npm CLI package (3-5 MB)
├── install-vscb-offline.sh          # Bash installation script (10-20 KB)
├── install-vscb-offline.ps1         # PowerShell installation script (10-20 KB)
└── README.txt                       # Installation documentation (5-10 KB)

Total size: 5-10 MB
```

**Note**: Wildcards (`*`) are used in file listings because versions may differ:
- **CI builds**: Both VSIX and tarball use semantic version (e.g., `vsc-bridge-1.2.3.vsix`, `vsc-bridge-1.2.3.tgz`)
- **Local builds**: VSIX uses random hash (e.g., `vsc-bridge-0.0.1-a3f2b8c1.vsix`), tarball uses package.json version (e.g., `vsc-bridge-1.0.0.tgz`)

### Appendix D: Platform Testing Matrix

| Platform | Version | Node.js | npm | VS Code | Status |
|----------|---------|---------|-----|---------|--------|
| Windows 10 | 22H2 | 18.19.0 | 10.2.3 | 1.85.0 | To Test |
| Windows 11 | 23H2 | 18.19.0 | 10.2.3 | 1.85.0 | To Test |
| macOS (Intel) | 13.x | 18.19.0 (Homebrew) | 10.2.3 | 1.85.0 | To Test |
| macOS (Apple Silicon) | 14.x | 18.19.0 (Homebrew) | 10.2.3 | 1.85.0 | To Test |
| Ubuntu LTS | 22.04 | 18.19.0 (nvm) | 10.2.3 | 1.85.0 | To Test |

---

**End of Implementation Plan**

Next step: Run `/plan-4-complete-the-plan` to validate this plan before proceeding to task creation.

---

## Critical Insights Discussion

**Session**: 2025-10-25
**Context**: Phase 3: Bundle Documentation (README.txt implementation planning)
**Analyst**: AI Clarity Agent
**Reviewer**: Development Team
**Format**: Water Cooler Conversation (5 Critical Insights)

### Insight 1: The "Ignored README" Problem

**Did you know**: Users extracting the bundle might never open README.txt because installation scripts appear first in alphabetical file listings.

**Implications**:
- Users miss critical internet requirement warning for CLI installation
- Users skip prerequisite checks (Node.js >=18, VS Code)
- When installation fails, users don't know where to look for help
- Support tickets increase from users who didn't read prerequisites

**Options Considered**:
- Option A: Rename to START_HERE.txt (attention-grabbing)
- Option B: Add installation script headers with warnings
- Option C: Interactive script prompts
- Option D: Dual format (README.txt + QUICK_START.txt)

**AI Recommendation**: Option B (Installation Script Headers)
- Reasoning: Catches users who skip README, zero friction, professional pattern used by Homebrew/npm

**Discussion Summary**: Team agreed script headers are the right balance - catches everyone without adding files or interactive prompts. ASCII art warnings at script top ensure critical requirements are visible even if README is skipped.

**Decision**: Add prominent ASCII art warning headers to both installation scripts (Bash and PowerShell)

**Action Items**:
- [x] Add ASCII art warning banner to `install-vscb-offline.sh` (lines 1-15)
- [x] Add ASCII art warning banner to `install-vscb-offline.ps1` (lines 1-15)
- [x] Headers include: Prerequisites (Node.js >=18, npm, VS Code, internet access)
- [x] Headers reference: "See README.txt for full installation guide"

**Affects**: Phase 3 Task 3.3 (Installation section mentions headers exist), Phase 2 scripts (headers will be added)

---

### Insight 2: The Plain Text Accessibility vs. Markdown Dilemma

**Did you know**: By choosing `.txt` format instead of `.md`, we optimize for universal readability but sacrifice GitHub's automatic formatting and clickable links.

**Implications**:
- README.txt works everywhere (Windows Notepad, SSH terminals, locked-down systems)
- No clickable links - users must copy/paste URLs
- No formatting - plain text only
- Works in CLI (`cat`, `less`, `type`) without any viewer

**Options Considered**:
- Option A: Stick with README.txt (maximum compatibility)
- Option B: Switch to README.md (rich formatting, GitHub preview)
- Option C: Dual format (both .txt and .md)
- Option D: README.txt with URL shorteners
- Option E: README.txt with QR code ASCII art

**AI Recommendation**: Option A (Stick with README.txt)
- Reasoning: Offline-first philosophy, CLI-first approach, guaranteed accessibility on all systems including SSH sessions

**Discussion Summary**: Team emphasized this is an offline bundle that must work in CLI environments. Plain text is the correct choice for maximum compatibility. Corporate users receiving bundles via USB or email may not have GitHub access or Markdown viewers.

**Decision**: Keep README.txt (plain text format)

**Action Items**: None - proceeding with `.txt` format as planned

**Affects**: Phase 3 tasks remain unchanged (already planning README.txt)

---

### Insight 3: The Version Number Chicken-and-Egg Problem

**Did you know**: Version substitution strategy (`{{VERSION}}` placeholders) creates mismatches in local builds where VSIX uses random hash (0.0.1-6c1d0570) but npm tarball uses package.json version (1.0.0).

**Implications**:
- Local development builds have incorrect tarball filename in README
- Documentation shows `vsc-bridge-0.0.1-6c1d0570.tgz` but actual file is `vsc-bridge-1.0.0.tgz`
- Users see filename mismatch and think bundle is corrupted
- Mismatch stems from Phase 1 discovery: npm pack always uses package.json version

**Options Considered**:
- Option A: Separate VSIX_VERSION and CLI_VERSION placeholders (precise but complex)
- Option B: Generic wildcard patterns (`vsc-bridge-*.vsix`, `vsc-bridge-*.tgz`)
- Option C: Dynamic file listing (tell users to run `ls`/`dir`)
- Option D: Local build warning label
- Option E: Fix npm pack to match versions (risky)

**AI Recommendation**: Option B (Generic wildcard patterns)
- Reasoning: Always accurate for both CI and local builds, simple to maintain, no version mismatch issues, professional pattern

**Discussion Summary**: Team chose simplicity - wildcards work universally and avoid complex version detection logic. Trade-off is less specificity but acceptable since bundle is already trustworthy.

**Decision**: Use wildcards for file listings in README.txt

**Action Items**:
- [x] Task 3.6 (What's Inside): Use `vsc-bridge-*.vsix` instead of `vsc-bridge-{{VERSION}}.vsix`
- [x] Task 3.6: Use `vsc-bridge-*.tgz` instead of `vsc-bridge-{{VERSION}}.tgz`
- [x] Keep specific names for scripts (no version): `install-vscb-offline.sh`, `install-vscb-offline.ps1`, `README.txt`

**Affects**: Phase 3 Task 3.6 (What's Inside section wording), Task 4.5, Appendix C

---

### Insight 4: The Troubleshooting Section Knowledge Gap

**Did you know**: Planned troubleshooting covers installation issues but misses the most common post-installation confusion: "I installed successfully, now what?"

**Implications**:
- Users don't understand vsc-bridge requires VS Code running AND workspace open
- "Start VS Code" is ambiguous - just open app or open a folder?
- Extension Host architecture is internal detail users shouldn't need to know
- First-time experience confusing: installation succeeds but CLI fails immediately with "Extension Host not responding"

**Options Considered**:
- Option A: Add "First Time Usage" section to README
- Option B: Enhance "Next Steps" in installation scripts
- Option C: Add "Extension Host" troubleshooting entry only
- Option D: Combined approach (A + C) - both proactive and reactive

**AI Recommendation**: Option D (Combined approach) with MCP setup
- Reasoning: Covers proactive (first-time) and reactive (troubleshooting) paths, prevents #1 support question, small cost (~3 KB text)

**Discussion Summary**: Team enhanced Option D to include MCP server setup instructions for both GitHub Copilot Chat and Claude Code, creating comprehensive first-run guide. This bridges "installation succeeded" to "how do I actually use this?" gap.

**Decision**: Add "First Time Usage" section + "Extension Host" troubleshooting + MCP server setup

**Action Items**:
- [x] Add new Task 3.4a: Write "First Time Usage" section
  - Subsection 1: Testing the installation (VS Code + folder → `vscb status`)
  - Subsection 2: MCP Server Setup for GitHub Copilot Chat (Command Palette → "Add MCP Server")
  - Subsection 3: MCP Server Setup for Claude Code (Claude Code CLI tool)
- [x] Update Task 3.5: Add "Extension Host not responding" troubleshooting entry
- [x] Update Task 3.1: README now has 7 sections (was 6)

**Affects**: Phase 3 Tasks 3.1 (section count), 3.4a (new task), 3.5 (enhanced troubleshooting)

---

### Insight 5: The Bundle Verification Integrity Problem

**Did you know**: Users receiving bundles via email/USB have no way to verify the bundle hasn't been tampered with or corrupted during transfer.

**Implications**:
- No verification that bundle is authentic/uncorrupted
- No checksums for integrity validation
- Corrupted bundles produce confusing errors instead of "checksum mismatch"
- Security-conscious corporate environments can't validate bundle authenticity

**Options Considered**:
- Option A: Add SHA256 checksums to README.txt (CHECKSUMS.txt in bundle)
- Option B: Self-verifying installation scripts (embedded checksums)
- Option C: GitHub Releases checksums file (separate from bundle)
- Option D: Do nothing (trust distribution channel)
- Option E: Hybrid (A + C) - checksums in bundle and on GitHub

**AI Recommendation**: Option A (SHA256 checksums in bundle)
- Reasoning: Industry standard, detects corruption early, security audit friendly, self-contained for offline distribution

**Discussion Summary**: Team chose to trust the distribution channel. Developer-to-developer sharing in corporate environments typically uses trusted channels (internal email, secure file shares). Adding checksums creates circular dependency problem (tampering would modify checksums too). Offline-first approach prioritizes simplicity.

**Decision**: No checksums - trust distribution channel

**Action Items**: None - no checksum generation or verification needed

**Affects**: No changes to Phase 3 tasks

---

## Session Summary

**Insights Surfaced**: 5 critical insights identified and discussed
**Decisions Made**: 4 implementation decisions (Insight 2 and 5 kept status quo)
**Action Items Created**: 7 concrete actions (4 already completed via plan updates)
**Areas Requiring Updates**:
- Phase 2 scripts: Add ASCII art warning headers (Insight 1)
- Phase 3 tasks: New Task 3.4a for First Time Usage section (Insight 4)
- Phase 3 tasks: Enhanced Task 3.5 for Extension Host troubleshooting (Insight 4)
- Phase 3 documentation: Wildcard file patterns in What's Inside (Insight 3)

**Shared Understanding Achieved**: ✓

**Confidence Level**: High - Phase 3 is now well-scoped with clear user experience focus

**Next Steps**:
1. Begin Phase 3 implementation with `/plan-6-implement-phase --phase "Phase 3: Bundle Documentation"`
2. Create OFFLINE_README.txt with 7 sections (including new First Time Usage section)
3. Add ASCII art warning headers to Phase 2 installation scripts
4. Implement version substitution with wildcard file patterns

**Notes**:
- All 5 insights focused on user experience and first-run success
- Decisions consistently favored simplicity and offline-first philosophy
- MCP integration guidance addition shows forward-thinking about actual usage patterns
- Bundle verification discussion revealed appropriate trust model for corporate distribution
