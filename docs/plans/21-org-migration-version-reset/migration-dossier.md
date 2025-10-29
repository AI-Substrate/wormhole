# AI-Substrate → AI-Substrate Migration Dossier

**Generated**: 2025-10-22
**Scope**: Complete repository scan for all AI-Substrate references

---

## Executive Summary

- **Total references**: 72
- **Critical changes (MUST fix)**: 30 references
- **Documentation (CAN update)**: 42 references
- **Estimated time**: 30-45 minutes

---

## Critical Changes (Priority 1)

### 1. Extension ID References (4 files)
**Impact**: Tests and installation scripts fail without these changes

| File | Line | Current | New |
|------|------|---------|-----|
| `packages/extension/.vscode-test.mjs` | 50 | `AI-Substrate.vsc-bridge-extension` | `AI-Substrate.vsc-bridge-extension` |
| `justfile` | 198, 203 | `AI-Substrate.vsc-bridge-extension` | `AI-Substrate.vsc-bridge-extension` |
| `.devcontainer/post-install.sh` | 146 | `AI-Substrate.vsc-bridge-extension` | `AI-Substrate.vsc-bridge-extension` |

### 2. GitHub API Default Owner (1 file)
**Impact**: `get-vsix`, `status`, `mcp` commands download from wrong repo

| File | Line | Current | New |
|------|------|---------|-----|
| `src/lib/github.ts` | 25 | `DEFAULT_OWNER = 'AI-Substrate'` | `DEFAULT_OWNER = 'AI-Substrate'` |

### 3. User-Facing Messages (7 files)
**Impact**: Users see incorrect installation instructions

| File | Lines | Pattern |
|------|-------|---------|
| `src/commands/status.ts` | 72, 74 | `npx github:AI-Substrate/vsc-bridge` → `npx github:AI-Substrate/wormhole` |
| `src/commands/get-vsix.ts` | 147, 153, 220 | `AI-Substrate/vsc-bridge` → `AI-Substrate/wormhole` |
| `src/commands/mcp.ts` | 95, 97 | `npx github:AI-Substrate/vsc-bridge` → `npx github:AI-Substrate/wormhole` |
| `src/lib/fs-bridge.ts` | 83, 85 | `npx github:AI-Substrate/vsc-bridge` → `npx github:AI-Substrate/wormhole` |
| `ci/scripts/prepare-cli.ts` | 7, 118 | `AI-Substrate/vsc-bridge` → `AI-Substrate/wormhole` |

**Special case** - Extension ID format fix:
- `src/commands/get-vsix.ts` line 147: `ai-substrate.vsc-bridge` → `AI-Substrate.vsc-bridge-extension`

### 4. Extension Lookups in Tests (9 files)
**Impact**: All integration tests fail

Replace in all files:
```typescript
// OLD:
vscode.extensions.getExtension('AI-Substrate.vsc-bridge-extension')

// NEW:
vscode.extensions.getExtension('AI-Substrate.vsc-bridge-extension')
```

Files to update:
1. `packages/extension/src/test/integration/scriptLoadingESM.test.ts` (line 18)
2. `packages/extension/src/test/integration/factory.test.ts` (line 14)
3. `packages/extension/src/test/integration/lifecycle.test.ts` (line 24)
4. `packages/extension/src/test/integration/registry.test.ts` (line 18)
5. `packages/extension/src/test/integration/validation.tiered.test.ts` (line 19)
6. `packages/extension/src/test/integration/smoke.test.ts` (lines 27, 40, 58)
7. `packages/extension/src/test/integration/bridgeContext.test.ts` (line 15)
8. `packages/extension/src/test/integration/scripts/debug-wait.test.ts` (line 27)

### 5. Runtime Extension Lookup (1 file)
**Impact**: Diagnostic collection fails

| File | Line | Change |
|------|------|--------|
| `packages/extension/src/vsc-scripts/diag/collect.js` | 69 | `AI-Substrate.vsc-bridge` → `AI-Substrate.vsc-bridge-extension` |

### 6. Package.json URLs (1 file)

| File | Line | Current | New |
|------|------|---------|-----|
| `packages/shared-test/package.json` | 27 | `AI-Substrate/vsc-bridge` | `AI-Substrate/wormhole` |

---

## Documentation Changes (Priority 2)

### CHANGELOG.md
**Recommendation**: LEAVE AS-IS (historical record)
- 42+ references in release notes from v1.0.0-alpha onwards
- These document the project's history under original organization
- GitHub redirects work; no functional impact

### LICENSE
**Recommendation**: UPDATE

| File | Line | Current | New |
|------|------|---------|-----|
| `LICENSE` | 3 | `Copyright (c) 2025 AI-Substrate` | `Copyright (c) 2025 AI-Substrate` |

### Installation Docs
**Recommendation**: UPDATE for user clarity

| File | Line | Change |
|------|------|--------|
| `scripts/INSTALL_VSIX.md` | 120 | Update GitHub release URL |

---

## Build Artifacts (Auto-Regenerate)

These files are compiled output - they regenerate automatically when source is built:

```
dist/commands/status.js        → from src/commands/status.ts
dist/commands/mcp.js          → from src/commands/mcp.ts
dist/commands/get-vsix.js     → from src/commands/get-vsix.ts
dist/lib/github.js            → from src/lib/github.ts
dist/lib/fs-bridge.js         → from src/lib/fs-bridge.ts
```

**Action**: Update source files only, then run `npm run build:cli`

---

## Migration Checklist

### Phase 1: Source Code Changes
- [ ] Update `src/lib/github.ts` DEFAULT_OWNER
- [ ] Update 7 user-facing message files
- [ ] Update 9 test files with extension lookups
- [ ] Update `packages/extension/src/vsc-scripts/diag/collect.js`
- [ ] Update `packages/shared-test/package.json`

### Phase 2: Configuration Changes
- [ ] Update `packages/extension/.vscode-test.mjs`
- [ ] Update `justfile` (2 locations)
- [ ] Update `.devcontainer/post-install.sh`

### Phase 3: Documentation
- [ ] Update `LICENSE` copyright
- [ ] Update `scripts/INSTALL_VSIX.md`

### Phase 4: Build & Verify
- [ ] Run `npm run build:cli`
- [ ] Run `cd packages/extension && npm run compile`
- [ ] Run `npm test:extension`
- [ ] Verify `vscb status` shows correct URLs
- [ ] Verify `vscb get-vsix --help` shows correct repo

---

## Quick Replace Patterns

For bulk find-replace:

1. Extension ID:
   - Find: `AI-Substrate.vsc-bridge-extension`
   - Replace: `AI-Substrate.vsc-bridge-extension`

2. NPX install command:
   - Find: `npx github:AI-Substrate/vsc-bridge`
   - Replace: `npx github:AI-Substrate/wormhole`

3. GitHub repo URL:
   - Find: `AI-Substrate/vsc-bridge`
   - Replace: `AI-Substrate/wormhole`

4. Extension ID (short form):
   - Find: `ai-substrate.vsc-bridge`
   - Replace: `AI-Substrate.vsc-bridge-extension`

---

## Notes

- ✅ GitHub Actions workflows already correct (point to AI-Substrate)
- ✅ Root `package.json` and extension `package.json` already updated
- ✅ README.md already uses correct npx commands
- ⚠️ Version already reset to 0.0.1 (in progress from dry run)
