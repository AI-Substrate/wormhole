# Pre-Migration Baseline Documentation

**Task**: T001 - Document current release workflow state
**Date**: 2025-11-10
**Purpose**: Establish baseline for comparison after release-please migration

---

## Current Release Workflow

**Workflow File**: `.github/workflows/build-and-release.yml`

### Trigger Configuration
```yaml
on:
  push:
    branches: [main, develop, org-migration-AI-Substrate]
  pull_request:
    branches: [main]
```

### Job Structure
- **Job**: semantic-release
- **Runner**: ubuntu-latest
- **Permissions**: contents:write, issues:write, pull-requests:write, packages:write

### Workflow Outputs
```yaml
outputs:
  new-release-published: ${{ steps.semantic-release.outputs.new-release-published }}
  new-release-version: ${{ steps.semantic-release.outputs.new-release-version }}
```

### Key Steps
1. Checkout with `SEMANTIC_RELEASE_TOKEN` (PAT)
2. Setup Node.js 22 with npm cache
3. Install just CLI
4. Install npm dependencies (`npm ci`)
5. Run `npx semantic-release` with `SEMANTIC_RELEASE_TOKEN`
6. Upload VSIX as workflow artifact (90-day retention)

### Current Token Usage
- Uses `SEMANTIC_RELEASE_TOKEN` (Personal Access Token)
- Token used for: git checkout, semantic-release execution
- Bypasses branch protection via PAT

---

## Current CHANGELOG.md Format

### Version 1.0.0 Entry
```markdown
## 1.0.0 (2025-11-09)

### 🚀 Features
* LSP Navigation & Code Intelligence - Complete Implementation (#2) (8a18f23)

### 🐛 Bug Fixes
* Add missing TypeScript declaration files for CI build (#4) (407b9d2)
```

### Emoji Section Headers (Confirmed)
- 🚀 Features
- 🐛 Bug Fixes
- ⚡ Performance Improvements (not in current entry, but configured)
- ⏪ Reverts
- 📚 Documentation
- 📦 Code Refactoring
- 🚨 Tests (hidden)
- 🛠 Build System (hidden)
- ⚙️ Continuous Integration (hidden)
- 💎 Styles (hidden)
- 🔧 Miscellaneous Chores (hidden)

---

## Current Version Baseline

### Package Versions (All at v1.0.0)
```
/workspaces/vscode-bridge/package.json: 1.0.0
/workspaces/vscode-bridge/packages/extension/package.json: 1.0.0
/workspaces/vscode-bridge/packages/shared-test/package.json: 1.0.0
```

### Git Tags
```bash
$ git tag -l | grep v1.0.0
v1.0.0
```

### Release Commit
```
6552cc9 chore(release): 1.0.0 [skip ci]
```

**Bootstrap SHA for release-please**: `6552cc9`

---

## Release Artifacts (v1.0.0)

### GitHub Release
- **URL**: https://github.com/AI-Substrate/wormhole/releases/tag/v1.0.0
- **Date**: 2025-11-09
- **Artifacts Expected**:
  - vsc-bridge-1.0.0.vsix
  - vsc-bridge-offline-1.0.0.zip (5-file bundle)

---

## Summary

**Status**: Baseline documented ✅

**Key Findings**:
- Current workflow uses PAT (`SEMANTIC_RELEASE_TOKEN`) for branch protection bypass
- CHANGELOG uses emoji headers matching specification
- All 3 packages synchronized at v1.0.0
- v1.0.0 release commit SHA: `6552cc9` (will be bootstrap-sha for release-please)
- Workflow outputs contract: `new-release-published` + `new-release-version`

**Next Steps**:
- T002: Test organization token policy
- T003: Verify repository merge strategy
- T004: Verify current version baseline (COMPLETE from this doc)
