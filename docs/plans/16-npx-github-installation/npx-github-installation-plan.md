# npx GitHub Installation Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2025-10-18
**Spec**: [./npx-github-installation-spec.md](./npx-github-installation-spec.md)
**Research**: [./research-findings.md](./research-findings.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: Repository Restructuring](#phase-1-repository-restructuring)
   - [Phase 2: Package Configuration & Build Pipeline](#phase-2-package-configuration--build-pipeline)
   - [Phase 3: Integration Testing & Validation](#phase-3-integration-testing--validation)
   - [Phase 4: Documentation & Migration](#phase-4-documentation--migration)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Progress Tracking](#progress-tracking)
8. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

### Problem Statement

Users currently must clone the repository, install dependencies, build manually, and run `npm link` to use the vscb CLI tool. This 10+ minute setup process creates friction for evaluation, CI/CD integration, and one-off usage. npm does NOT support installing workspace sub-packages from GitHub URLs, blocking direct `npx github:AI-Substrate/vsc-bridge` usage with our current `packages/cli/` structure.

### Solution Approach

- **Restructure monorepo**: Move CLI from `packages/cli/` to repository root
- **Build automation**: Use npm `prepare` script to compile TypeScript during installation
- **Clean repository**: Keep `dist/` and build artifacts gitignored
- **Breaking change**: Major version bump (v1 → v2) with migration guide
- **Performance target**: 30-60s first install, <5s cached (documented expectation)

### Expected Outcomes

✅ Users run `npx github:AI-Substrate/vsc-bridge <command>` without any setup
✅ Installation time reduced from 10+ minutes to <60 seconds
✅ CI/CD pipelines can pin specific versions (branches/tags)
✅ Repository remains clean (no committed build artifacts)
✅ Contributor workflows preserved (just build, npm link, F5 debugging)
✅ Structure ready for future npm registry publishing

### Success Metrics

- First-time npx installation completes in <60 seconds
- Cached npx execution completes in <5 seconds
- All existing integration tests pass (0 regressions)
- `just build && just cli-link` still works for contributors
- Repository size remains <10MB (excluding node_modules)

---

## Technical Context

### Current System State

**Repository Structure**:
```
/workspaces/vsc-bridge-devcontainer/
├── package.json (root - private: true, workspaces)
├── packages/
│   ├── cli/ ← TARGET FOR RESTRUCTURING
│   │   ├── src/ (TypeScript CLI source)
│   │   ├── test/ (integration tests, including MCP)
│   │   ├── dist/ (gitignored, built via tsc)
│   │   └── package.json (name: @vsc-bridge/cli, bin: vscb)
│   ├── extension/ (VS Code extension)
│   └── shared-test/ (shared test utilities)
└── mcp-server/ (MCP server implementation)
```

**Build Pipeline**:
1. `scripts/build-manifest.ts` scans `packages/extension/src/vsc-scripts/**/*.meta.yaml`
2. Generates `packages/extension/src/vsc-scripts/manifest.json` (~149KB)
3. `tsc -p packages/cli/tsconfig.json` compiles CLI to `packages/cli/dist/`
4. `shx cp` copies manifest.json to `packages/cli/dist/manifest.json`

**Installation Flow (Current)**:
```bash
# User must manually:
git clone https://github.com/AI-Substrate/vsc-bridge
cd vsc-bridge
npm install          # ~2-3 minutes
just build           # ~30-60 seconds
just cli-link        # Creates global symlink
vscb --help          # Finally works
# Total: 10+ minutes
```

### Integration Requirements

**MCP Server Integration**:
- MCP server code embedded in CLI (`packages/cli/src/lib/mcp/`)
- Integration tests use real file operations (no mocks policy)
- Tests located in `packages/cli/test/integration-mcp/`
- Must preserve test functionality after restructuring

**Extension Dependency**:
- CLI requires `manifest.json` generated from extension metadata
- Cross-package dependency during build time
- Must be handled in prepare script

**Workspaces**:
- Root uses npm workspaces (packages/*, mcp-server)
- shared-test used in dev dependencies (tests only)
- Extension remains as workspace package

### Constraints and Limitations

**npm Limitations** (validated by research):
- ❌ Cannot install workspace sub-packages from GitHub URLs
- ❌ `npx github:org/repo/packages/cli` does NOT work
- ✅ Only root package.json is recognized for git installs
- ✅ devDependencies ARE available during prepare script

**Platform Support**:
- Primary: Linux (devcontainer environment)
- Secondary: Windows/macOS (best-effort, community feedback)
- Node.js ≥18.0.0 required
- npm ≥8.0.0 (bundled with Node 18+)

**Breaking Changes**:
- File paths change (`packages/cli/src` → `src`)
- Import paths must be updated throughout codebase
- Contributors need migration (one-time setup change)
- Major version bump (v1 → v2) required

### Assumptions

1. **Build Process**: TypeScript compilation succeeds on Linux without platform-specific dependencies
2. **Test Isolation**: Existing integration tests don't hardcode `packages/cli/` paths
3. **npm Behavior**: prepare script has access to devDependencies (confirmed by research)
4. **Contributor Impact**: One-time migration guide is sufficient (no automated tooling needed)
5. **Performance**: 30-60s installation is acceptable when prominently documented

---

## Critical Research Findings

Research conducted via Perplexity AI on 2025-10-18. Full findings: [./research-findings.md](./research-findings.md)

### 🚨 Critical Discovery 01: npm Workspace Sub-Package Limitation

**Problem**: npm cannot install workspace sub-packages from GitHub URLs. Running `npx github:org/repo/packages/cli` fails because npm only recognizes the root package.json, treating `/packages/cli` as a branch/tag name rather than a directory path.

**Root Cause**: npm's git dependency resolution works only at repository root level. There is no syntax to select a workspace sub-package from a remote git URL as of npm v10 (2025).

**Solution**: Move CLI to repository root so `npx github:AI-Substrate/vsc-bridge` installs the correct package.

**Evidence**:
- npm CLI documentation (v8, v9, v10)
- GitHub issues: npm/cli#4774, npm/cli#6537, npm/cli#7277
- Real-world example: OpenRailAssociation/osrd moved CLI to root for this exact reason

**Impact**: Forces monorepo restructuring (Phase 1). No workaround exists with current npm tooling.

---

### 🚨 Critical Discovery 02: devDependencies Available in prepare Script

**Problem**: Uncertainty whether TypeScript, tsx, and other build tools would be available when users install from GitHub.

**Root Cause**: Initial concern that devDependencies might not install for git dependencies.

**Solution**: Confirmed that npm DOES install devDependencies before running prepare script for GitHub installations.

**Lifecycle Order**:
```
1. npm downloads repository from GitHub
2. npm installs BOTH dependencies AND devDependencies
3. npm runs prepare script ← TypeScript, tsx, shx all available here
4. npm prunes to only files in "files" array
5. npm creates executable from "bin" field
```

**Evidence**:
- npm lifecycle documentation
- Confirmed by GitHub issue npm/npm#5001
- Validated in real projects (kucherenko/cli-typescript-starter)

**Impact**: We CAN use tsc, tsx, js-yaml, shx in devDependencies (no need to move to dependencies).

---

### 🚨 Critical Discovery 03: Recommended Solution Pattern

**Problem**: Need to validate our approach against industry best practices (2024-2025).

**Root Cause**: Want to ensure we're following modern, idiomatic patterns.

**Solution**: Research confirmed our hypothesis matches the recommended pattern for TypeScript CLI tools.

**Validated Pattern**:
```json
{
  "name": "@org/cli",
  "private": false,
  "bin": { "mycli": "./dist/index.js" },
  "scripts": {
    "build": "tsc",
    "prepare": "npm run build"
  },
  "files": ["/dist"],
  "devDependencies": {
    "typescript": "^5.x",
    "tsx": "^4.x"
  }
}
```

**Real-World Examples**:
- **kucherenko/cli-typescript-starter** (2024) - exact pattern match
- **OpenRailAssociation/osrd** - moved CLI to root for npx support
- Multiple dev.to articles recommend this approach

**Impact**: High confidence in our architectural decision (Phase 2 package.json configuration).

---

### 🚨 Critical Discovery 04: Installation Time Expectations

**Problem**: Is 30-60 seconds too slow for npx installation in 2025?

**Root Cause**: User expectations for instant execution like other npx commands.

**Solution**: 30-60s is acceptable for TypeScript compilation when documented. npm caches reduce subsequent runs to 3-5s.

**Industry Standards** (from research):
- Instant (<5s): Pre-built packages from npm registry
- Fast (5-15s): Simple builds, minimal dependencies
- **Acceptable (30-60s): TypeScript compilation, complex toolchains** ← Our target
- Too Slow (>60s): Inefficient build process

**Mitigation**:
- Document prominently in README: "First run ~30-60s, cached runs <5s"
- Show build progress during installation (console output)
- Consider tsup for future optimization (2x faster than tsc)

**Impact**: 30-60s target is realistic and acceptable (no need to optimize further for MVP).

---

### 🚨 Critical Discovery 05: Cross-Platform Considerations

**Problem**: prepare scripts can fail on Windows due to path separators, shell commands, file permissions.

**Root Cause**: Different path formats (\\ vs /), shell syntax (cmd vs bash), executable permissions.

**Solution**: Use Node.js scripts instead of shell scripts. Leverage cross-platform tools (path module, shx).

**Anti-Patterns to Avoid**:
```javascript
// ❌ WRONG - Windows fails
const filePath = 'dist/' + filename;
execSync('rm -rf dist && mkdir dist');

// ✅ CORRECT - Cross-platform
const filePath = path.join('dist', filename);
execSync('shx rm -rf dist && shx mkdir dist');
```

**Recommended Pattern**:
```javascript
// ci/scripts/prepare-cli.js
const { execSync } = require('child_process');
const path = require('path');

try {
  console.log('Building CLI...');
  execSync('npm run build:manifest && npm run build:cli', {
    stdio: 'inherit',
    env: process.env
  });
  console.log('✅ Build complete!');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
```

**Impact**: Phase 2 prepare script must use Node.js (not shell scripts) and path.join() for all paths.

---

## Testing Philosophy

### Testing Approach: Lightweight

**Selected from Spec**: Lightweight Testing (confirmed in clarifications session)

**Rationale**: This is primarily a build/packaging/distribution change rather than complex business logic. Core functionality validation is sufficient - verify npx works, builds succeed, commands execute correctly. Focus testing effort on critical paths rather than comprehensive coverage.

### Focus Areas

- ✅ Build pipeline succeeds from clean clone
- ✅ npx installation works end-to-end
- ✅ All CLI commands execute identically via npx vs global install
- ✅ Existing integration tests pass (no regressions)
- ✅ Error messages display correctly for common failure scenarios

### Excluded from Testing

- ❌ Extensive edge case testing (rely on real-world usage feedback)
- ❌ Complex test fixtures or test infrastructure
- ❌ Testing every possible npm/Node.js version combination
- ❌ Mocking npm behavior or installation mechanics

### Mock Usage Policy: Avoid Mocks Entirely

**Selected from Spec**: Avoid mocks entirely (confirmed in clarifications session)

Use real data, real npm installs, real file operations. Maximum realism even if tests are slower. This ensures we catch real-world issues with npm behavior, filesystem operations, and cross-package dependencies. Use fixtures for test data only.

**Examples**:
- ✅ Real npm install from GitHub (not mocked)
- ✅ Real file system operations (create/read/delete)
- ✅ Real TypeScript compilation (run tsc)
- ✅ Real npx execution (subprocess)
- ❌ No mocking of npm, file system, or build tools

### Platform Coverage

**Single platform (Linux/devcontainer)** for initial release. Document Windows/macOS as "best effort" until community feedback indicates cross-platform issues.

**Rationale**: Focus resources on core functionality validation rather than cross-platform testing infrastructure. Real users will report platform-specific issues faster than we can predict them.

### Test Documentation

When tests are written (lightweight approach), each test must include:

```typescript
/**
 * Purpose: [what truth this test proves]
 * Quality Contribution: [how this prevents bugs]
 * Acceptance Criteria: [measurable assertions]
 */
test('should [specific behavior]', () => {
  // Test implementation
});
```

---

## Implementation Phases

### Phase 1: Repository Restructuring

**Objective**: Move CLI from `packages/cli/` to repository root, preserving git history and updating all import paths.

**Deliverables**:
- CLI source at `/workspaces/vsc-bridge-devcontainer/src/`
- CLI tests at `/workspaces/vsc-bridge-devcontainer/test/`
- Updated import paths throughout codebase
- Workspace configuration updated (remove packages/cli)

**Dependencies**: None (foundational phase)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Git history loss during move | Low | Medium | Use `git mv` to preserve history |
| Import path update mistakes | Medium | High | Systematic search/replace, test after each change |
| MCP integration tests break | Medium | High | Update imports first, run tests immediately |
| Contributor confusion | High | Low | Clear migration guide, announce in README |

### Tasks (Lightweight Testing Approach)

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 1.1 | [x] | Create feature branch `feat/npx-github-installation` | Branch created from main, pushed to remote | [📋](tasks/phase-1/execution.log.md#t004-confirm-using-current-branch-) | Branch created [^1] |
| 1.2 | [x] | Move CLI source with git history preservation | `git mv packages/cli/src src-cli` successful, history preserved | [📋](tasks/phase-1/execution.log.md#t005-t008-move-cli-files-with-git-history-preservation-) | Moved with git mv [^2] |
| 1.3 | [x] | Move CLI tests with git history preservation | `git mv packages/cli/test test-cli` successful | [📋](tasks/phase-1/execution.log.md#t005-t008-move-cli-files-with-git-history-preservation-) | Moved with git mv [^2] |
| 1.4 | [x] | Move CLI package.json temporarily | `git mv packages/cli/package.json package-cli.json` | [📋](tasks/phase-1/execution.log.md#t005-t008-move-cli-files-with-git-history-preservation-) | Moved with git mv [^2] |
| 1.5 | [x] | Move CLI tsconfig.json | `git mv packages/cli/tsconfig.json tsconfig-cli.json` | [📋](tasks/phase-1/execution.log.md#t005-t008-move-cli-files-with-git-history-preservation-) | Paths corrected post-commit [^2][^3] |
| 1.6 | [x] | Update all import paths in src/ | All imports point to new locations, no broken imports | [📋](tasks/phase-1/execution.log.md#t011-t018-update-import-paths-) | No references found [^4] |
| 1.7 | [x] | Update all import paths in test/ | All test imports work, no path errors | [📋](tasks/phase-1/execution.log.md#t011-t018-update-import-paths-) | 1 file updated [^6] |
| 1.8 | [x] | Update workspace configuration in root package.json | workspaces array excludes packages/cli | [📋](tasks/phase-1/execution.log.md#t019-t022-documentation-and-final-sweep-) | Workspaces updated [^5] |
| 1.9 | [x] | Remove empty packages/cli/ directory | Directory deleted, `packages/cli` no longer exists | [📋](tasks/phase-1/execution.log.md#t023-remove-empty-packagescli-directory-) | Directory removed [^8] |
| 1.10 | [x] | Commit restructuring changes | Changes committed with message "feat: move CLI to root for npx compatibility" | [📋](tasks/phase-1/execution.log.md#phase-1-complete-) | Commit 896c7ae [^9] |

### Validation Tests (Lightweight)

```bash
# Verify structure
ls -la src/          # Should show CLI source files
ls -la test/         # Should show CLI test files
ls -la packages/cli/ # Should not exist

# Verify git history preserved
git log --follow src/index.ts  # Should show full history

# Verify imports compile (will fail until Phase 2)
tsc --noEmit -p tsconfig-cli.json  # Expected to fail (paths not updated)
```

### Acceptance Criteria

- [ ] All files moved successfully with git history intact
- [ ] No files remain in `packages/cli/`
- [ ] Import paths updated throughout codebase
- [ ] Workspace configuration updated
- [ ] Git commit created with clear message

---

### Phase 2: Package Configuration & Build Pipeline

**Objective**: Configure root package.json for npx installation, create build orchestration scripts, and establish prepare script workflow.

**Deliverables**:
- Root package.json configured (bin, prepare, dependencies)
- `ci/scripts/prepare-cli.ts` build orchestration script
- Build pipeline: manifest generation → TypeScript compilation → manifest copy
- justfile updated for new structure

**Dependencies**: Phase 1 complete (files moved to root)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Manifest generation fails in prepare | Medium | High | Add validation, clear error messages |
| Cross-package dependency breaks | Medium | High | Test manifest generation independently |
| Build timeout during npx install | Low | Medium | Optimize build, document expected time |
| devDependencies not available | Low | Critical | Confirmed by research (Discovery 02) |

### Tasks (Lightweight Testing Approach)

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 2.1 | [x] | Rename src-cli → src, test-cli → test | Final directory names established | [log](tasks/phase-2/execution.log.md#t001-rename-src-cli-to-src-with-git-history) [^10] | [📋](tasks/phase-2/tasks.md) T001 (src done), T002a-s (test deferred) |
| 2.2 | [x] | Rename tsconfig-cli.json → tsconfig.json | Primary TypeScript config at root | [log](tasks/phase-2/execution.log.md#t003-rename-tsconfig-clijson-to-tsconfigjson) [^11] | [📋](tasks/phase-2/tasks.md) T003-T004 |
| 2.3 | [x] | Merge package-cli.json into root package.json | All CLI fields migrated to root | [log](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows) [^12] | [📋](tasks/phase-2/tasks.md) T005-T021 |
| 2.4 | [x] | Set private: false in root package.json | Package can be installed from GitHub | [log](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows) [^12] | [📋](tasks/phase-2/tasks.md) T006 |
| 2.5 | [x] | Add bin field pointing to dist/index.js | "bin": { "vscb": "./dist/index.js" } | [log](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows) [^12] | [📋](tasks/phase-2/tasks.md) T007 |
| 2.6 | [x] | Move CLI runtime dependencies to root | @oclif, ink, react, etc. in dependencies | [log](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows) [^12] | [📋](tasks/phase-2/tasks.md) T008 |
| 2.7 | [x] | Move CLI build dependencies to root devDeps | typescript, tsx, shx, js-yaml in devDependencies | [log](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows) [^12] | [📋](tasks/phase-2/tasks.md) T009 |
| 2.8 | [x] | Add files field: ["/dist", "/oclif.manifest.json"] | Only dist/ included in package | [log](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows) [^12] | [📋](tasks/phase-2/tasks.md) T010 |
| 2.9 | [x] | Create ci/scripts/ directory | Directory exists | [log](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows) [^13] | [📋](tasks/phase-2/tasks.md) T012 |
| 2.10 | [x] | Create ci/scripts/prepare-cli.ts | Orchestration script created | [log](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows) [^13] | [📋](tasks/phase-2/tasks.md) T013-T014 |
| 2.11 | [x] | Add prepare script to package.json | "prepare": "tsx ci/scripts/prepare-cli.ts" | [log](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows) [^12] | [📋](tasks/phase-2/tasks.md) T018 |
| 2.12 | [x] | Add build:manifest script | Generates manifest.json from extension | [log](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows) [^12][^14] | [📋](tasks/phase-2/tasks.md) T015 |
| 2.13 | [x] | Add build:cli script | "tsc -p tsconfig.json && npm run copy-manifest" | [log](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows) [^12] | [📋](tasks/phase-2/tasks.md) T017 |
| 2.14 | [x] | Add copy-manifest script | "shx cp packages/extension/src/vsc-scripts/manifest.json dist/manifest.json" | [log](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows) [^12] | [📋](tasks/phase-2/tasks.md) T016 |
| 2.15 | [x] | Update justfile build-cli target | Points to root npm scripts | [log](tasks/phase-2/execution.log.md#justfile-fixes-validation-code-review-fixes) [^15] | [📋](tasks/phase-2/tasks.md) T022 |
| 2.16 | [x] | Update justfile cli-link target | Runs npm link from root | [log](tasks/phase-2/execution.log.md#justfile-fixes-validation-code-review-fixes) [^15] | [📋](tasks/phase-2/tasks.md) T023 |
| 2.17 | [x] | Test build pipeline locally | `npm install && npm run prepare` succeeds | [log](tasks/phase-2/execution.log.md#t026-t035-build-pipeline-validation) | [📋](tasks/phase-2/tasks.md) T026-T029 |
| 2.18 | [x] | Verify dist/ contains manifest.json | File exists and is valid JSON | [log](tasks/phase-2/execution.log.md#justfile-fixes-validation-code-review-fixes) | [📋](tasks/phase-2/tasks.md) T033 |
| 2.19 | [x] | Verify vscb binary is executable | `./dist/index.js --help` works | [log](tasks/phase-2/execution.log.md#t026-t035-build-pipeline-validation) | [📋](tasks/phase-2/tasks.md) T030 |
| 2.20 | [ ] | Commit build configuration changes | Committed with message "feat: add npx build pipeline" | - | [📋](tasks/phase-2/tasks.md) T036 - PENDING |

### Code Templates

**Root package.json Configuration**:

```json
{
  "name": "@vsc-bridge/cli",
  "version": "2.0.0",
  "description": "CLI for VSC-Bridge debugging integration",
  "private": false,
  "type": "module",

  "bin": {
    "vscb": "./dist/index.js"
  },

  "main": "dist/index.js",
  "types": "dist/index.d.ts",

  "files": [
    "/dist",
    "/oclif.manifest.json"
  ],

  "scripts": {
    "prepare": "tsx ci/scripts/prepare-cli.ts",
    "build": "npm run build:manifest && npm run build:extension && npm run build:mcp && npm run build:cli && npm run build:shared-test",
    "build:manifest": "tsx scripts/build-manifest.ts",
    "build:cli": "tsc -p tsconfig.json && npm run copy-manifest",
    "copy-manifest": "shx cp packages/extension/src/vsc-scripts/manifest.json dist/manifest.json",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:integration": "vitest run test/integration/unified-debug.test.ts",
    "test:integration:mcp": "vitest run test/integration-mcp/"
  },

  "workspaces": [
    "packages/extension",
    "packages/shared-test",
    "mcp-server"
  ],

  "dependencies": {
    "@inkjs/ui": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.20.0",
    "@oclif/core": "^3.18.1",
    "chalk": "^5.3.0",
    "fs-extra": "^11.2.0",
    "ink": "^4.4.1",
    "ink-select-input": "^5.0.0",
    "ink-spinner": "^5.0.0",
    "ink-text-input": "^5.0.1",
    "react": "^18.2.0",
    "zod": "^3.22.4"
  },

  "devDependencies": {
    "typescript": "^5.9.3",
    "tsx": "^4.20.6",
    "shx": "^0.3.4",
    "js-yaml": "^4.1.0",
    "@types/fs-extra": "^11.0.4",
    "@types/node": "^20.11.5",
    "@types/react": "^18.2.48",
    "@types/js-yaml": "^4.0.9",
    "oclif": "^4.1.0",
    "vitest": "^2.0.0",
    "@vsc-bridge/shared-test": "*",
    "@commitlint/cli": "^18.4.4",
    "@commitlint/config-conventional": "^18.4.4",
    "@semantic-release/changelog": "^6.0.3",
    "@semantic-release/commit-analyzer": "^11.1.0",
    "@semantic-release/exec": "^6.0.3",
    "@semantic-release/git": "^10.0.1",
    "@semantic-release/github": "^9.2.6",
    "@semantic-release/npm": "^11.0.2",
    "@semantic-release/release-notes-generator": "^12.1.0",
    "@types/chai": "^5.2.2",
    "@types/glob": "^8.1.0",
    "@vscode/test-cli": "^0.0.10",
    "@vscode/test-electron": "^2.5.2",
    "commitizen": "^4.3.0",
    "cz-conventional-changelog": "^3.3.0",
    "glob": "^11.0.3",
    "semantic-release": "^22.0.12",
    "ts-node": "^10.9.2"
  },

  "engines": {
    "node": ">=18.0.0"
  }
}
```

**ci/scripts/prepare-cli.ts**:

```typescript
#!/usr/bin/env tsx

/**
 * Prepare script for npx GitHub installation.
 *
 * This script orchestrates the build process when users install via:
 * npx github:AI-Substrate/vsc-bridge
 *
 * Build Steps:
 * 1. Generate manifest.json from extension metadata
 * 2. Compile TypeScript CLI source
 * 3. Copy manifest to dist/
 *
 * Critical: Uses devDependencies (tsx, typescript, shx, js-yaml)
 * which npm DOES install before running prepare for git installs.
 *
 * Per Critical Discovery 02 and 05:
 * - devDependencies available during prepare
 * - Use Node.js for cross-platform compatibility
 * - Provide clear error messages on failure
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Console colors for better visibility
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m'
};

function log(message: string, color = colors.cyan) {
  console.error(`${color}${message}${colors.reset}`);
}

function error(message: string) {
  console.error(`${colors.red}❌ ${message}${colors.reset}`);
}

function success(message: string) {
  console.error(`${colors.green}✅ ${message}${colors.reset}`);
}

function runCommand(command: string, description: string) {
  log(`\n${description}...`);
  try {
    execSync(command, {
      stdio: 'inherit',
      env: process.env,
      cwd: process.cwd()
    });
    success(description + ' complete');
  } catch (err) {
    error(`${description} failed`);
    throw err;
  }
}

async function main() {
  log('\n🚀 Building vscb CLI for npx installation...\n');
  log('⏱️  First run: ~30-60 seconds (subsequent runs use npm cache: <5s)\n');

  try {
    // Validate environment
    log('Checking build environment...');
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0]);

    if (major < 18) {
      error('Node.js >= 18.0.0 required');
      error(`Current version: ${nodeVersion}`);
      error('\nPlease upgrade Node.js: https://nodejs.org/');
      process.exit(1);
    }
    success(`Node.js ${nodeVersion} ✓`);

    // Check for required files
    const manifestScriptPath = path.join(process.cwd(), 'scripts', 'build-manifest.ts');
    if (!fs.existsSync(manifestScriptPath)) {
      error('Manifest build script not found');
      error(`Expected: ${manifestScriptPath}`);
      error('\nThis may indicate incomplete repository clone.');
      process.exit(1);
    }
    success('Build scripts found ✓');

    // Build steps
    runCommand('npm run build:manifest', 'Step 1/2: Generating manifest');
    runCommand('npm run build:cli', 'Step 2/2: Compiling TypeScript');

    // Validate output
    const distPath = path.join(process.cwd(), 'dist');
    const indexPath = path.join(distPath, 'index.js');
    const manifestPath = path.join(distPath, 'manifest.json');

    if (!fs.existsSync(indexPath)) {
      error('Build failed: dist/index.js not created');
      process.exit(1);
    }

    if (!fs.existsSync(manifestPath)) {
      error('Build failed: dist/manifest.json not created');
      process.exit(1);
    }

    success('\n🎉 Build complete! vscb CLI is ready to use.\n');

  } catch (err) {
    error('\n💥 Build failed\n');
    error('Troubleshooting:');
    error('  1. Ensure Node.js >= 18.0.0: node --version');
    error('  2. Try manual build: npm install && npm run build:manifest && npm run build:cli');
    error('  3. Check TypeScript version: npx tsc --version');
    error('  4. Report issue: https://github.com/AI-Substrate/vsc-bridge/issues');
    error(`\nError details: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
```

### Validation Tests (Lightweight)

```bash
# Test build pipeline
rm -rf node_modules dist
npm install                    # Should run prepare automatically
ls -la dist/index.js          # Should exist
ls -la dist/manifest.json     # Should exist
node dist/index.js --help     # Should show help

# Test CLI globally
npm link
vscb --help                   # Should work
vscb script list              # Should list scripts
```

### Acceptance Criteria

- [ ] Root package.json configured with all required fields
- [ ] prepare script builds successfully from clean state
- [ ] dist/index.js and dist/manifest.json generated
- [ ] `npm link` works from root directory
- [ ] `vscb --help` executes successfully
- [ ] All build scripts pass on clean clone

---

### Phase 3: Integration Testing & Validation

**Objective**: Validate that restructuring hasn't broken existing functionality, test npx installation flow using LOCAL file path testing (no GitHub push required for iteration), and verify contributor workflows still work.

**Deliverables**:
- All existing MCP integration tests pass
- npx installation behavior validated locally via `npm install /path/to/repo`
- Real npx from GitHub tested as final confirmation
- Contributor workflow validated (just build, npm link, F5)
- Performance benchmarks collected

**Dependencies**: Phase 2 complete (build pipeline working)

**Critical Testing Insight**: We can test the EXACT same npm lifecycle that `npx github:org/repo` uses by running `npm install /workspaces/vsc-bridge-devcontainer` from a clean test directory. This provides:
- ✅ Same prepare script execution
- ✅ Same devDependencies installation
- ✅ Same file pruning behavior
- ✅ Instant iteration (no push/pull/wait)
- ✅ Clean environment testing

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| MCP tests fail due to import changes | High | High | Run tests incrementally, fix imports |
| Local test doesn't catch GitHub-specific issues | Low | Medium | Final GitHub npx test as confirmation (task 3.15) |
| Extension debugging breaks | Low | High | Test F5 workflow explicitly |
| prepare script works locally but fails from GitHub | Very Low | Medium | Script uses only standard npm lifecycle, no local-specific paths |

### Tasks (Lightweight Testing Approach with Local npx Simulation)

**Part A: Regression Testing (Existing Functionality)**

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 3.1 | [ ] | Run MCP integration tests locally | `npm run test:integration:mcp` passes 100% | - | Real file operations, no mocks |
| 3.2 | [ ] | Run CLI integration tests | `npm run test:integration:cli` passes 100% | - | Validates CLI commands work |
| 3.3 | [ ] | Run extension tests | `npm run test:extension` passes 100% | - | Ensures extension not broken |
| 3.4 | [ ] | Test clean install from scratch | `rm -rf node_modules dist && npm install` succeeds, prepare runs | - | Validates prepare script in workspace context |
| 3.5 | [ ] | Test `just build` command | All packages build successfully in <2 minutes | - | Contributor workflow validation |
| 3.6 | [ ] | Test `just cli-link` command | Global symlink created, `which vscb` shows symlink, `vscb --help` works | - | Ensures contributors can still develop locally |
| 3.7 | [ ] | Test VS Code F5 debugging | Extension launches in Extension Development Host, debugger attaches | - | Critical contributor workflow |

**Part B: Local npx Simulation Testing (Primary Validation)**

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 3.8 | [ ] | Create clean test environment | `/tmp/vscb-test-1` directory created, empty, no node_modules | - | Isolated testing environment |
| 3.9 | [ ] | Test npm install from local path (First run) | `npm install /workspaces/vsc-bridge-devcontainer` completes in <60s | - | Simulates npx GitHub install lifecycle |
| 3.10 | [ ] | Verify prepare script executed | Console shows manifest generation + TypeScript compilation output | - | Confirms build ran during install |
| 3.11 | [ ] | Verify dist/ artifacts created | `node_modules/.bin/vscb` exists, `dist/index.js` and `dist/manifest.json` present | - | Binary and manifest generated |
| 3.12 | [ ] | Test CLI execution via npx | `npx vscb --help` shows help text, `npx vscb --version` shows version | - | Validates bin field works |
| 3.13 | [ ] | Test script listing | `npx vscb script list` shows available scripts (>10 scripts) | - | Manifest loaded correctly |
| 3.14 | [ ] | Test breakpoint command | `npx vscb script run bp.list` executes without error | - | End-to-end command validation |
| 3.15 | [ ] | Measure first-time install performance | Installation time <60 seconds (document actual time in log) | - | Performance benchmark |
| 3.16 | [ ] | Create second clean test environment | `/tmp/vscb-test-2` directory created | - | Test repeatability |
| 3.17 | [ ] | Test npm install from local path (Second run) | `npm install /workspaces/vsc-bridge-devcontainer` completes | - | Validates consistency |
| 3.18 | [ ] | Test all major CLI command categories | bp.*, debug.*, script.* commands all execute | - | Comprehensive validation |
| 3.19 | [ ] | Test error handling for invalid commands | `npx vscb invalid-command` shows clear error | - | User experience validation |

**Part C: Edge Case & Error Testing**

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 3.20 | [ ] | Test with Node.js version check | Modify prepare-cli.ts to simulate Node <18, verify error message | - | Validates version check works |
| 3.21 | [ ] | Test with missing manifest script | Temporarily rename build-manifest.ts, verify clear error | - | Error handling validation |
| 3.22 | [ ] | Test dist/ cleanup and rebuild | `rm -rf dist && npm install /workspaces/vsc-bridge-devcontainer` succeeds | - | Ensures prepare script is idempotent |
| 3.23 | [ ] | Restore original files | Undo any test modifications (Node version, renamed files) | - | Clean state for GitHub test |

**Part D: Final GitHub npx Validation (Confirmation Only)**

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 3.24 | [ ] | Commit all changes to current branch | All Phase 1-2 changes committed, git status clean | - | Prepare for push |
| 3.25 | [ ] | Push branch to GitHub remote | Branch visible on GitHub, commit hash matches local | - | Required for real npx test |
| 3.26 | [ ] | Create final clean test environment | `/tmp/vscb-github-test` directory created | - | Final validation environment |
| 3.27 | [ ] | Test real npx from GitHub | `npx github:AI-Substrate/vsc-bridge#<current-branch> --help` succeeds | - | THE MOMENT OF TRUTH |
| 3.28 | [ ] | Verify GitHub install matches local | Same build output, same performance, same commands work | - | Consistency validation |
| 3.29 | [ ] | Test branch selection syntax | `npx github:AI-Substrate/vsc-bridge#main --version` when pushed to main | - | Version pinning validation |
| 3.30 | [ ] | Document any GitHub-specific differences | Note any issues found only in GitHub install (expect: none) | - | Learning capture |

### Validation Scripts

**Script 1: Local npx Simulation Testing (PRIMARY - use for fast iteration)**

```bash
#!/bin/bash
# test-local-npx.sh
# Tests npm install behavior that mimics npx github:org/repo
# Run this during development to catch issues WITHOUT pushing to GitHub

set -e  # Exit on error

REPO_ROOT="/workspaces/vsc-bridge-devcontainer"
TEST_DIR="/tmp/vscb-local-test-$(date +%s)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Local npx Simulation Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Test Directory: $TEST_DIR"
echo "📦 Source: $REPO_ROOT"
echo ""

# Create clean test environment
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Test 1: Install from local path (simulates npx github:org/repo)
echo "▶ Test 1/6: npm install from local repository path"
echo "This simulates the EXACT lifecycle npx uses for GitHub installs:"
echo "  1. Install dependencies + devDependencies"
echo "  2. Run prepare script (build manifest + TypeScript)"
echo "  3. Prune to files array"
echo "  4. Create binary"
echo ""
time npm install "$REPO_ROOT"

# Test 2: Verify prepare script ran
echo ""
echo "▶ Test 2/6: Verify prepare script executed"
if [ -f "node_modules/.bin/vscb" ]; then
    echo "✅ Binary created: node_modules/.bin/vscb"
else
    echo "❌ Binary NOT found - prepare script may have failed"
    exit 1
fi

# Test 3: Test CLI execution
echo ""
echo "▶ Test 3/6: Test CLI execution via npx"
npx vscb --version
npx vscb --help | head -10

# Test 4: Test manifest loaded
echo ""
echo "▶ Test 4/6: Verify manifest.json loaded (script list)"
SCRIPT_COUNT=$(npx vscb script list 2>/dev/null | wc -l)
echo "Found $SCRIPT_COUNT scripts in manifest"
if [ "$SCRIPT_COUNT" -lt 10 ]; then
    echo "❌ Too few scripts - manifest may not be loading"
    exit 1
fi
echo "✅ Manifest loaded successfully"

# Test 5: Test actual commands
echo ""
echo "▶ Test 5/6: Test actual CLI commands"
npx vscb script run bp.list 2>&1 | head -5 || echo "(Expected: may fail if no extension running - command executed)"

# Test 6: Performance check
echo ""
echo "▶ Test 6/6: Performance validation"
echo "Note: npm may use cache, so this isn't pure first-time install"
echo "For true first-time test, run: npm cache clean --force"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Local npx simulation test PASSED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Next steps:"
echo "  1. If all tests pass: ready to push and test real npx from GitHub"
echo "  2. If tests fail: fix issues and re-run this script (instant feedback)"
echo "  3. Cleanup: rm -rf $TEST_DIR"
```

**Script 2: Real GitHub npx Testing (FINAL CONFIRMATION - run after push)**

```bash
#!/bin/bash
# test-github-npx.sh
# Tests ACTUAL npx github:org/repo behavior
# Only run this after local testing passes and you've pushed to GitHub

set -e

BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
TEST_DIR="/tmp/vscb-github-test-$(date +%s)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 GitHub npx Installation Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌿 Branch: $BRANCH_NAME"
echo "📁 Test Directory: $TEST_DIR"
echo ""
echo "⚠️  WARNING: This test requires:"
echo "  1. All changes committed"
echo "  2. Branch pushed to GitHub"
echo "  3. Clean npm cache for accurate timing"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# Create clean test environment
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Clear npm cache for accurate first-time install timing
echo ""
echo "🧹 Clearing npm cache for accurate timing..."
npm cache clean --force

# Test real npx from GitHub
echo ""
echo "▶ Test 1/4: First-time npx install from GitHub (timing)"
echo "Target: <60 seconds"
echo ""
time npx github:AI-Substrate/vsc-bridge#$BRANCH_NAME --help

# Test cached execution
echo ""
echo "▶ Test 2/4: Cached npx execution (should be fast)"
echo "Target: <5 seconds"
echo ""
time npx github:AI-Substrate/vsc-bridge#$BRANCH_NAME --version

# Test commands
echo ""
echo "▶ Test 3/4: Test commands work"
npx github:AI-Substrate/vsc-bridge#$BRANCH_NAME script list | head -10

# Test branch syntax
echo ""
echo "▶ Test 4/4: Test branch selection syntax"
npx github:AI-Substrate/vsc-bridge#main --version || echo "(Main branch may not have changes yet)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ GitHub npx test PASSED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Cleanup: rm -rf $TEST_DIR"
```

**Script 3: Contributor Workflow Validation**

```bash
#!/bin/bash
# test-contributor-workflow.sh
# Validates that existing contributor workflows still work

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "👨‍💻 Contributor Workflow Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd /workspaces/vsc-bridge-devcontainer

# Test 1: Clean build
echo "▶ Test 1/4: Clean build from scratch"
rm -rf node_modules dist packages/*/dist packages/*/out
npm install
just build
echo "✅ Build successful"

# Test 2: CLI link
echo ""
echo "▶ Test 2/4: Global CLI link"
just cli-link
echo "✅ CLI linked globally"

# Test 3: CLI execution
echo ""
echo "▶ Test 3/4: CLI execution"
vscb --help | head -5
vscb --version
echo "✅ CLI commands work"

# Test 4: Extension debugging (manual check)
echo ""
echo "▶ Test 4/4: Extension debugging (MANUAL)"
echo "📝 Manual step: Press F5 in VS Code"
echo "   Expected: Extension Development Host launches"
echo ""
read -p "Did F5 launch Extension Development Host successfully? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Extension debugging failed"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Contributor workflow test PASSED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

### Performance Benchmarks

Document these metrics in execution log (use test scripts above):

**Local npx Simulation** (Part B testing):
- **First local install**: `time npm install /workspaces/vsc-bridge-devcontainer` (target: <60s)
- **Prepare script execution**: Should show manifest generation + TypeScript compilation
- **Binary creation**: Verify node_modules/.bin/vscb exists and is executable
- **Command execution**: All test commands complete without error

**Real GitHub npx** (Part D testing):
- **First-time GitHub install**: `time npx github:AI-Substrate/vsc-bridge#<branch> --help` (target: <60s)
- **Cached execution**: Second npx run (target: <5s)
- **Branch selection**: Test with different branches/tags
- **Command compatibility**: All commands work identically to local

**Repository Metrics**:
- **Clean build time**: `time npm run prepare` (baseline: ~30-40s)
- **Repository size**: `du -sh .` excluding node_modules (target: <10MB)

### Acceptance Criteria

**Existing Functionality (Part A)**:
- [ ] All MCP integration tests pass (0 regressions)
- [ ] All CLI integration tests pass
- [ ] Extension tests pass
- [ ] `just build && just cli-link` still works
- [ ] VS Code F5 debugging still works

**Local npx Simulation (Part B - PRIMARY)**:
- [ ] `npm install /workspaces/vsc-bridge-devcontainer` completes in <60s
- [ ] prepare script executes (visible console output)
- [ ] Binary created at node_modules/.bin/vscb
- [ ] `npx vscb --help` works after local install
- [ ] `npx vscb script list` shows >10 scripts
- [ ] All major command categories (bp.*, debug.*, script.*) work
- [ ] Error handling works (invalid commands show clear errors)

**Edge Cases (Part C)**:
- [ ] Node.js version check works (rejects <18)
- [ ] Missing manifest script shows clear error
- [ ] prepare script is idempotent (can rebuild)

**GitHub npx Validation (Part D - CONFIRMATION)**:
- [ ] Real `npx github:AI-Substrate/vsc-bridge#<branch>` works
- [ ] First-time install completes in <60 seconds
- [ ] Cached install completes in <5 seconds
- [ ] GitHub install behavior matches local testing
- [ ] Branch selection syntax works (`#branch`, `#v1.0.0`)
- [ ] No GitHub-specific issues found

**Total Tasks**: 30 (up from 14) - more granular, better coverage, explicit local→GitHub progression

---

### Phase 4: Documentation & Migration

**Objective**: Update README.md with npx as primary installation method, create migration guide for contributors, and document troubleshooting steps.

**Deliverables**:
- Updated README.md (npx primary, global secondary)
- MIGRATION.md guide for existing contributors
- Updated CLAUDE.md with new project structure
- Troubleshooting documentation

**Dependencies**: Phase 3 complete (all tests passing, npx validated)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Incomplete migration instructions | Medium | Medium | Peer review migration guide |
| Confusing installation options | Low | Low | Clear use case guidance |
| Contributors miss migration guide | High | Low | Announce in commit, README, PR |

### Tasks (Lightweight Testing Approach)

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 4.1 | [ ] | Update README.md installation section | npx featured as PRIMARY method | - | See template below |
| 4.2 | [ ] | Add performance expectations to README | "First run ~30-60s, cached <5s" documented | - | |
| 4.3 | [ ] | Add version pinning examples | CI/CD usage documented | - | |
| 4.4 | [ ] | Create docs/MIGRATION.md | Complete migration guide for contributors | - | See template below |
| 4.5 | [ ] | Update CLAUDE.md project structure section | CLI at root documented | - | /workspaces/vsc-bridge-devcontainer/CLAUDE.md |
| 4.6 | [ ] | Update CLAUDE.md CLI commands section | Paths updated (no packages/cli/) | - | |
| 4.7 | [ ] | Add troubleshooting section to README | Common build failures documented | - | |
| 4.8 | [ ] | Update justfile comments | Reflect new structure | - | |
| 4.9 | [ ] | Peer review all documentation | Clarity verified, no broken links | - | |
| 4.10 | [ ] | Commit documentation changes | Message: "docs: update for npx installation and migration" | - | |

### Documentation Templates

**README.md Installation Section** (npx as PRIMARY method):

```markdown
## Installation

### Quick Start with npx (No Installation Required) ⚡

Run vscb directly from GitHub without any setup:

```bash
# Latest from main branch
npx github:AI-Substrate/vsc-bridge script run bp.list

# Specific branch (e.g., develop)
npx github:AI-Substrate/vsc-bridge#develop script run debug.status

# Specific version/tag
npx github:AI-Substrate/vsc-bridge#v2.0.0 --help
```

**⏱️ Performance**:
- First run: ~30-60 seconds (builds TypeScript on your machine)
- Subsequent runs: <5 seconds (uses npm cache)

**✅ Perfect for**:
- Trying out vscb before committing to installation
- CI/CD pipelines (version pinning)
- One-off debugging sessions

---

### Global Installation (Persistent)

For regular use, install globally:

```bash
# From GitHub
npm install -g github:AI-Substrate/vsc-bridge

# From npm (coming soon)
npm install -g @vsc-bridge/cli

# Verify installation
vscb --help
```

---

### For Contributors

If you're developing vsc-bridge:

```bash
# Clone and build
git clone https://github.com/AI-Substrate/vsc-bridge
cd vsc-bridge
npm install
just build

# Link for development
just cli-link

# Now vscb uses your local development version
vscb --help
```

See [MIGRATION.md](docs/MIGRATION.md) if upgrading from v1.x.

---

## Troubleshooting

### Build Failures During npx Install

**Error**: "Build failed: TypeScript compilation errors"

**Fix**:
```bash
# Check Node.js version (must be >= 18)
node --version

# If <18, upgrade: https://nodejs.org/

# Try manual build to see detailed errors
git clone https://github.com/AI-Substrate/vsc-bridge
cd vsc-bridge
npm install
npm run build:manifest
npm run build:cli
```

### Slow Installation

**Symptoms**: npx install takes >60 seconds

**Explanation**: First-time install compiles TypeScript from source (~30-60s is normal). Subsequent runs use npm cache and complete in <5s.

**If consistently slow**:
- Check network speed (npm downloads dependencies)
- Clear npm cache: `npm cache clean --force`
- Use global install instead for better performance

### Version Mismatch Warnings

**Warning**: "CLI v2.0.0 ahead of extension v1.5.0"

**Fix**: Update VS Code extension to match CLI version, or downgrade CLI:

```bash
# Specific CLI version
npx github:AI-Substrate/vsc-bridge#v1.5.0 --help
```
```

**docs/MIGRATION.md**:

```markdown
# Migration Guide: v1.x → v2.x

This guide helps existing contributors migrate to the v2.x restructured repository.

## What Changed?

### Repository Structure

**v1.x (Old)**:
```
vsc-bridge/
├── package.json (root - private)
└── packages/
    └── cli/        ← CLI was here
        ├── src/
        ├── test/
        └── package.json
```

**v2.x (New)**:
```
vsc-bridge/
├── package.json (CLI now at root)
├── src/          ← CLI source moved here
├── test/         ← CLI tests moved here
└── packages/
    ├── extension/
    └── shared-test/
```

### Why This Change?

npm does NOT support installing workspace sub-packages from GitHub URLs. Moving the CLI to the root enables:

```bash
# ✅ NOW WORKS (v2.x)
npx github:AI-Substrate/vsc-bridge --help

# ❌ NEVER WORKED (v1.x)
npx github:AI-Substrate/vsc-bridge/packages/cli --help
```

## Migration Steps (One-Time)

### 1. Clean Your Local Repository

```bash
cd /path/to/vsc-bridge

# Stash any uncommitted changes
git stash

# Fetch latest
git fetch origin

# Switch to main (or develop)
git checkout main
git pull

# Clean build artifacts
rm -rf node_modules packages/*/node_modules packages/*/dist dist
```

### 2. Rebuild

```bash
# Install dependencies
npm install

# Build everything
just build

# Relink CLI globally
just cli-link

# Verify it works
vscb --help
```

### 3. Update Your IDE

**VS Code**:
- Close and reopen workspace
- If debugging doesn't work, reload window (Cmd+Shift+P → "Reload Window")

**TypeScript paths** (if you have custom tsconfig):
- Update any references to `packages/cli/` → root paths

### 4. Update Custom Scripts (If Any)

If you have personal scripts referencing `packages/cli/`:

```bash
# Old path
packages/cli/dist/index.js

# New path
dist/index.js
```

## Breaking Changes

### Import Paths (Internal)

If you import from CLI in your own code:

```typescript
// ❌ Old (v1.x)
import { something } from '../packages/cli/src/lib/something';

// ✅ New (v2.x)
import { something } from '../src/lib/something';
```

### CLI Installation

**v1.x**: Required manual clone + build + link (10+ minutes)

**v2.x**: Use npx directly (<60 seconds)

```bash
# ❌ Old way (still works for contributors)
git clone && npm install && just build && just cli-link

# ✅ New way (end users)
npx github:AI-Substrate/vsc-bridge --help
```

## Workflow Comparison

### Contributor Workflow

**No change** - existing workflow still works:

```bash
# ✅ Still works in v2.x
git pull
just build
just cli-link
vscb --help
```

### End User Workflow

**v1.x** (Old):
```bash
git clone https://github.com/AI-Substrate/vsc-bridge
cd vsc-bridge
npm install     # 2-3 minutes
just build      # 30-60 seconds
just cli-link
vscb --help
# Total: 10+ minutes
```

**v2.x** (New):
```bash
npx github:AI-Substrate/vsc-bridge --help
# Total: 30-60 seconds (first run)
# Total: 3-5 seconds (cached)
```

## Troubleshooting

### "command not found: vscb"

You need to relink after migration:

```bash
just cli-link
```

### "Cannot find module '../packages/cli/...'"

Import paths changed. Update to new structure:

```bash
# Search and replace
rg "packages/cli" --files-with-matches | xargs sed -i 's|packages/cli/||g'
```

### Tests Failing

Update test imports and rebuild:

```bash
npm run test:integration:mcp
# If failures, check import paths in test files
```

### Extension Won't Debug (F5)

Reload VS Code window:
1. Cmd+Shift+P (or Ctrl+Shift+P on Windows/Linux)
2. Type "Reload Window"
3. Press Enter

## Getting Help

If migration fails:

1. **Check Node.js version**: `node --version` (must be ≥18)
2. **Check build logs**: `npm run build:manifest && npm run build:cli`
3. **Report issue**: https://github.com/AI-Substrate/vsc-bridge/issues

Include:
- OS and Node version
- Error messages (full output)
- Steps you've tried


### Acceptance Criteria

- [ ] README.md updated with npx as primary installation method
- [ ] Performance expectations documented prominently
- [ ] MIGRATION.md created with complete guide
- [ ] CLAUDE.md updated to reflect new structure
- [ ] Troubleshooting section added to README
- [ ] Peer review completed (no broken links, clear instructions)
- [ ] Documentation changes committed

---

## Cross-Cutting Concerns

### Security Considerations

**Input Validation**:
- prepare script validates Node.js version (≥18.0.0)
- Manifest generation validates .meta.yaml file structure
- Build scripts check for required files before proceeding

**No Sensitive Data**:
- No credentials or secrets in build process
- manifest.json contains only public script metadata
- dist/ folder excluded from git (clean repository)

**Dependency Security**:
- All dependencies sourced from npm registry
- No custom registry or git dependencies (except self-test)
- Regular dependency updates via dependabot

### Observability

**Build Logging**:
- prepare script logs each build step with color-coded output
- Clear success/failure messages
- Detailed error messages with troubleshooting steps

**Performance Metrics**:
- Installation time logged during npx execution
- Build step timing visible in console output
- Benchmarks documented in Phase 3 execution log

**Error Tracking**:
- Build failures exit with non-zero status code
- Error messages include actionable fixes
- GitHub issues link provided for unresolved failures

### Documentation Strategy

**Location**: README.md only (confirmed in clarifications)

**Rationale**: User-facing feature needing immediate discoverability. README is the first place users look for installation instructions. No deep architectural docs needed since this is a packaging change, not new functionality.

**Content Structure**:
- **Installation section** (prominent, top of README)
  - npx as PRIMARY method (instant access, zero setup)
  - Global installation as SECONDARY method (persistent)
  - Contributor installation (development workflow)
- **Quick start examples** with common commands
- **Performance expectations** (first run ~60s, cached <5s)
- **Version pinning** for CI/CD reproducibility
- **Troubleshooting** common build failures

**Target Audience**:
- New users evaluating the tool (npx is zero-friction)
- CI/CD pipeline authors (version pinning important)
- Contributors (preserve existing workflow docs)

**Maintenance**:
- Update installation section during Phase 4
- Keep examples synchronized with actual CLI commands
- Add troubleshooting entries as users report issues

---

## Progress Tracking

### Phase Completion Checklist

- [x] **Phase 1: Repository Restructuring** - 10 tasks
  - Status: COMPLETE (2025-10-19)
  - Commit: 896c7ae, fix: 8ebc011
  - Log: [📋](tasks/phase-1/execution.log.md#phase-1-complete-)

- [x] **Phase 2: Package Configuration & Build Pipeline** - 20 tasks
  - Status: COMPLETE (2025-10-19)
  - Commit: PENDING (T020 - final commit deferred)
  - Log: [📋](tasks/phase-2/execution.log.md)
  - Notes: Build pipeline functional, prepare script working, justfile updated [^16]

- [x] **Phase 3: Integration Testing & Validation** - Simplified validation
  - Status: COMPLETE (2025-10-19)
  - Performance: 39s GitHub install, 2.25s local (exceeds <60s target)
  - Log: [📋](tasks/phase-3/execution.log.md)
  - Notes: npx validated, MCP working, 39 tests passing, VS Code env fixed [^17][^18]

- [x] **Phase 4: Documentation & Migration** - 13 tasks
  - Status: COMPLETE (2025-10-19)
  - Log: No execution log (documentation-only phase)
  - Notes: README.md updated (npx primary, no performance claims), CLAUDE.md updated (CLI at root) [^19]

**Total Tasks**: 70 (increased from 54 - expanded Phase 3 testing)
**Estimated Effort**: 9-13 hours (increased due to comprehensive testing strategy)
**Testing Approach**: Lightweight (core validation only)
**Mock Usage**: Avoid mocks entirely (real operations)

### STOP Rule

**IMPORTANT**: This plan must be complete before creating task files. After writing this plan:

1. Run `/plan-4-complete-the-plan` to validate readiness
2. Review phase dependencies and acceptance criteria
3. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

**Do NOT start implementation until**:
- [ ] All phases have clear success criteria
- [ ] Dependencies are explicitly stated
- [ ] Risks are identified with mitigations
- [ ] Testing approach is documented
- [ ] Documentation strategy is defined

---

## Change Footnotes Ledger

[^1]: **Phase 1 - Task 1.1**: Setup and reconnaissance
  - Created branch `feat/npx-github-installation` from main
  - 198 files identified for move, 104 references across 43 files documented
  - Subagent reconnaissance completed: TypeScript (1 file), shell scripts (15 refs), configs (3 scripts)

[^2]: **Phase 1 - Tasks 1.2-1.5**: File moves with git history preservation
  - `file:src-cli/**/*` - 23 source files moved from `packages/cli/src/`
  - `file:test-cli/**/*` - 18 test files moved from `packages/cli/test/`
  - `file:package-cli.json` - Moved from `packages/cli/package.json`
  - `file:tsconfig-cli.json` - Moved from `packages/cli/tsconfig.json`
  - All moves used `git mv` to preserve complete commit history

[^3]: **Phase 1 - Post-commit fix**: tsconfig-cli.json path corrections
  - `file:tsconfig-cli.json` - Updated `rootDir: "src"` → `"src-cli"` (line 8)
  - `file:tsconfig-cli.json` - Updated `include: ["src/**/*"]` → `["src-cli/**/*"]` (line 21)
  - Fixed in commit `8ebc011` after code review identified masked TypeScript error TS18003

[^4]: **Phase 1 - Task 1.6**: Import path updates in moved files
  - No references to `packages/cli` found in src-cli/ or test-cli/ (expected after move)
  - Shell scripts (15 refs) deferred to Phase 4 (install/deployment scripts)

[^5]: **Phase 1 - Task 1.8**: Root configuration updates
  - `file:package.json` - Disabled 3 npm scripts (build:cli, cli, cli:init) with warning messages
  - `file:package.json` - Updated workspaces from glob `["packages/*"]` to explicit list excluding cli
  - `file:justfile` - Added warning header, disabled build-cli command temporarily
  - Subagent verified no cross-package dependencies on @vsc-bridge/cli

[^6]: **Phase 1 - Task 1.7**: TypeScript import updates
  - `file:test/integration/helpers/bridge-direct.ts` - Updated 2 imports (lines 28, 47)
    - Changed `../../../packages/cli/src/lib/fs-bridge` → `../../../src-cli/lib/fs-bridge`
  - TypeScript compilation validated: 0 "Cannot find module" errors

[^7]: **Phase 1 - Final sweep**: Comprehensive validation
  - Production code clean: 0 TypeScript/JS/JSON references, 0 .vscode/ references
  - Known remaining: 16 justfile refs (temporarily disabled), 13 shell script refs (Phase 4)

[^8]: **Phase 1 - Task 1.9**: Cleanup and final structure
  - `file:README-cli.md` - Moved from `packages/cli/README.md` with git history
  - Removed build artifacts (dist/, node_modules/) and empty `packages/cli/` directory
  - Final structure: src-cli/, test-cli/, package-cli.json, tsconfig-cli.json, README-cli.md at root

[^9]: **Phase 1 - Task 1.10**: Commit and verification
  - Commit `896c7ae4081c26ef99b6ef875c1062fa6f054df9` - feat(plan-16): Phase 1 - Repository Restructuring
  - 46 files changed, 466 insertions(+), 11 deletions(-)
  - Code review approved after tsconfig fix (commit `8ebc011`)
  - Full details: `git show --stat 896c7ae` or see [execution log](tasks/phase-1/execution.log.md)

[^10]: **Phase 2 - Task 2.1**: src-cli/ → src/ rename with git history
  - `file:/workspaces/vsc-bridge-devcontainer/src/` - Directory renamed using `git mv src-cli src`
  - Git status shows 'R' (rename) flags, preserving full commit history
  - See [execution log#t001](tasks/phase-2/execution.log.md#t001-rename-src-cli-to-src-with-git-history)

[^11]: **Phase 2 - Task 2.2**: tsconfig-cli.json → tsconfig.json rename and path updates
  - `file:tsconfig.json` - Renamed using `git mv tsconfig-cli.json tsconfig.json`
  - `file:tsconfig.json:8` - Updated `rootDir: "src-cli"` → `"src"`
  - `file:tsconfig.json:21` - Updated `include: ["src-cli/**/*"]` → `["src/**/*"]`
  - Validated: `tsc --listFiles` shows src/ files loaded correctly
  - See [execution log#t003-t004](tasks/phase-2/execution.log.md#t003-rename-tsconfig-clijson-to-tsconfigjson)

[^12]: **Phase 2 - Tasks 2.3-2.8, 2.11-2.14**: Root package.json CLI configuration merge
  - `file:package.json:14` - Set `private: false` (enables npx installation)
  - `file:package.json:5` - Added `type: "module"` (ES modules)
  - `file:package.json:7-9` - Added `bin: { "vscb": "./dist/index.js" }`
  - `file:package.json:10-13` - Added `files: ["/dist", "/oclif.manifest.json"]`
  - `file:package.json:29-40` - Merged 10 runtime dependencies (including @modelcontextprotocol/sdk ^1.20.0)
  - `file:package.json:68-92` - Merged 4 devDependencies (@types/fs-extra, @types/react, oclif, shx)
  - `file:package.json:42-67` - Added/updated build scripts: build:cli, copy-manifest, prepare, dev, build:manifest (changed to use tsx)
  - `file:package.json:102-109` - Added oclif configuration block (discovered during validation)
  - Removed: package-cli.json (all configuration merged)
  - See [execution log#summary](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows)

[^13]: **Phase 2 - Tasks 2.9-2.10**: Created npx build orchestration script
  - `file:ci/scripts/prepare-cli.ts` - New file (executable, 124 lines)
  - Orchestrates: manifest generation → TypeScript compilation → manifest copy
  - Validates: Node.js >= 18, build scripts exist, output files created
  - Runs automatically during `npm install` (including npx GitHub installs)
  - See [execution log#summary](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows)

[^14]: **Phase 2 - ES Module Fix**: build-manifest.ts → build-manifest.cts rename
  - `file:scripts/build-manifest.cts` - Renamed from .ts to .cts (CommonJS in ESM project)
  - `file:package.json:51` - Updated build:manifest script to reference .cts
  - `file:ci/scripts/prepare-cli.ts:82` - Updated file existence check to .cts
  - Fixed: "require is not defined" error in ES module context
  - See [execution log#summary](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows)

[^15]: **Phase 2 - Tasks 2.15-2.16 + Code Review Fixes**: justfile CLI workflow restoration and fixes
  - `file:justfile:22` - Fixed: `scripts/build-manifest.ts` → `scripts/build-manifest.cts` (CODE-001)
  - `file:justfile:42-45` - Restored build-cli target: `npm run build:cli`
  - `file:justfile:330` - Restored cli-link target: `npm link` (from root)
  - Removed Phase 1 warning header (lines 3-7)
  - Fixed 11 CLI workspace references (CODE-002):
    - `file:justfile:81` - test-cli: `npx vitest run test-cli/`
    - `file:justfile:89` - test-integration-mcp: `npx vitest run test-cli/integration-mcp/stdio-e2e.test.ts`
    - `file:justfile:279` - check-outdated: removed `cd packages/cli &&`
    - `file:justfile:303` - cli-setup: `node dist/index.js` (removed cd)
    - `file:justfile:447` - cli-list: `node dist/index.js` (removed cd)
    - `file:justfile:457-464` - bp-set: removed `cd packages/cli &&`
    - `file:justfile:470` - bp-remove: removed `cd packages/cli &&`
    - `file:justfile:477` - bp-clear-file: removed `cd packages/cli &&`
    - `file:justfile:483` - bp-clear: removed `cd packages/cli &&`
    - `file:justfile:488` - bp-list: removed `cd packages/cli &&`
    - `file:justfile:508` - dev-build: `npm run build:cli`
  - Validated: `just build`, `just build-cli`, `just cli-link` all succeed
  - See [execution log#justfile-fixes](tasks/phase-2/execution.log.md#justfile-fixes-validation-code-review-fixes)

[^16]: **Phase 2 - Technical Debt Resolution**: bridge-direct.ts import path fixes
  - `file:test/integration/helpers/bridge-direct.ts:28` - Import: `../../../src-cli/lib/fs-bridge` → `../../../src/lib/fs-bridge`
  - `file:test/integration/helpers/bridge-direct.ts:47` - Dynamic import: same path update
  - Resolves Phase 1 technical debt item H.5
  - See [execution log#summary](tasks/phase-2/execution.log.md#summary-t005-t025-package-configuration--contributor-workflows)

[^17]: **Phase 3 - VS Code Test Dependencies Fix**: Installed 13 GUI libraries for Electron/VS Code testing in devcontainer
  - `file:.devcontainer/install-vscode-test-deps.sh` - Created install script (28 lines, 13 packages)
  - `file:.devcontainer/post-install.sh:77-83` - Integrated into devcontainer setup
  - `file:.devcontainer/VSCODE_TEST_DEPS.md` - Documentation (77 lines)
  - `file:package.json:53-54` - Wrapped test commands with `xvfb-run -a`
  - Libraries: libasound2, libatk-bridge2.0-0, libatk1.0-0, libatspi2.0-0, libdbus-1-3, libgbm1, libgtk-3-0, libxcomposite1, libxdamage1, libxfixes3, libxrandr2, libxkbcommon0, xvfb
  - See [execution log#part-4](tasks/phase-3/execution.log.md#part-4-vs-code-extension-test-dependencies-fix-)

[^18]: **Phase 3 - npx Installation Validation**: Performance benchmarks and functional validation
  - Local npx simulation: 2.25s (`npm install /workspaces/vsc-bridge-devcontainer`)
  - GitHub npx validation: 39s (`npx github:AI-Substrate/vsc-bridge#feat/npx-github-installation`)
  - All CLI commands functional: config, exec, mcp, script, status
  - MCP server validated via npx
  - 39 fs-bridge unit tests passing, 2 skipped
  - See [execution log#part-1](tasks/phase-3/execution.log.md#part-1-local-npx-simulation-testing--passed), [execution log#part-2](tasks/phase-3/execution.log.md#part-2-github-npx-validation--passed)

[^19]: **Phase 4 - Documentation Updates**: README.md and CLAUDE.md updated for npx installation
  - `file:README.md:13-62` - Added npx as primary installation method, global install as alternative
  - `file:README.md:23-24` - Removed performance claims per user request (was "~30-60 seconds")
  - `file:README.md:389-501` - Removed verbose global installation section (116 lines deleted)
  - `file:README.md:66-94` - Removed troubleshooting section per user request (29 lines deleted)
  - `file:CLAUDE.md:8-14` - Updated Project Overview to mention CLI at root (not packages/cli/)
  - No migration documentation created (unreleased product, no backwards compatibility needed)

---

## Appendix: Research References

**Full Research Report**: [./research-findings.md](./research-findings.md)

**Key Citations**:
1. npm workspaces documentation: https://docs.npmjs.com/cli/v8/using-npm/workspaces/
2. npm lifecycle scripts: https://docs.npmjs.com/cli/v9/using-npm/scripts/
3. GitHub Issues: npm/cli#4774, npm/cli#6537, npm/cli#7277
4. Real project examples: kucherenko/cli-typescript-starter, OpenRailAssociation/osrd
5. Perplexity research (2025-10-18): Validated approach against 2024-2025 best practices

**Research Confidence**: HIGH - Multiple independent sources confirm findings.

---

## Critical Insights Discussion

**Session**: 2025-10-18 (during plan review)
**Context**: npx GitHub Installation Implementation Plan v1.0.0
**Analyst**: AI Clarity Agent
**Reviewer**: Development Team
**Format**: Water Cooler Conversation (5 Critical Insights)

### Insight 1: The npx Testing Paradox - Local Path Simulation Solution

**Did you know**: We can test the EXACT same npm lifecycle that `npx github:org/repo` uses by running `npm install /workspaces/vsc-bridge-devcontainer` from a clean local directory, eliminating the need to push to GitHub for testing iteration?

**Implications**:
- The original plan had a chicken-and-egg problem: needed to push to GitHub to test npx, but needed to test to know if it works
- Every iteration would require: commit → push → clear cache → test → repeat (potentially hours of debugging)
- Using `npm install /local/path` triggers the EXACT same lifecycle as `npx github:org/repo`:
  1. Installs dependencies + devDependencies
  2. Runs prepare script
  3. Prunes to files array
  4. Creates binary
- This provides instant iteration feedback without any GitHub dependency

**Options Considered**:
- Option A: Accept the Risk (Push and Pray) - Simple but slow, untested code on GitHub
- Option B: Local npx Simulation - Custom tooling, might miss GitHub-specific issues
- Option C: Dedicated Test Repository - High overhead, still requires pushing
- Option D: Two-Stage Validation (Hybrid) - Explicit iteration acknowledgment
- **Option E: Local File Path Testing** (Research-validated) - Fast iteration, real npm behavior, no push needed

**AI Recommendation**: Option E (Local File Path Testing)
- Reasoning: Research via Perplexity confirmed `npm install /local/path` uses identical npm lifecycle to git URLs. This is the standard Node.js/npm workflow (not a hack). Provides fast feedback loop while maintaining 100% fidelity to real npx behavior.

**Discussion Summary**:
User requested avoiding feature branches and using current branch only. User asked to research how uvx (Python) handles local testing, which led to discovering npm's local file path installation feature. This completely solves the testing paradox with zero downsides.

**Decision**: Implement local file path testing as primary validation strategy (Part B of Phase 3)

**Action Items**:
- [x] Expand Phase 3 from 14 tasks to 30 tasks
- [x] Add Part B: Local npx Simulation Testing (12 tasks)
- [x] Add Part C: Edge Case Testing (4 tasks)
- [x] Add Part D: Final GitHub Validation (7 tasks)
- [x] Create 3 detailed validation scripts (test-local-npx.sh, test-github-npx.sh, test-contributor-workflow.sh)
- [x] Update acceptance criteria to reflect local→GitHub progression
- [x] Update task count and time estimates

**Affects**: Phase 3 completely restructured (30 tasks instead of 14), added comprehensive local testing strategy, pushed GitHub testing to final confirmation step only

---

### Session Summary

**Insights Surfaced**: 1 critical insight identified and resolved (4 more available if needed)
**Decisions Made**: 1 decision reached through collaborative discussion
**Action Items Created**: 6 immediate updates applied
**Areas Requiring Updates**:
- Phase 3 tasks completely restructured
- Testing strategy enhanced with local simulation
- Validation scripts provided (3 comprehensive bash scripts)
- Task count increased from 54 to 70
- Estimated effort updated from 7-11h to 9-13h

**Shared Understanding Achieved**: ✓

**Confidence Level**: High - We have a clear, fast-iteration testing strategy that mirrors real npx behavior

**Next Steps**:
The plan is now READY for implementation with enhanced Phase 3 testing strategy. Proceed to `/plan-5-phase-tasks-and-brief` to begin implementation.
