# Release-Please Integration Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2025-11-10
**Spec**: [release-please-integration-spec.md](./release-please-integration-spec.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: Release-Please Migration](#phase-1-release-please-migration)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Progress Tracking](#progress-tracking)
8. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: The current semantic-release workflow violates branch protection rules by attempting direct commits to the protected `main` branch. Organization-level read-only GITHUB_TOKEN policy prevents using default tokens for automation.

**Solution**: Migrate to release-please, which creates Release PRs (satisfying branch protection requirements) and uses GitHub App authentication (bypassing org token restrictions). Release-please will handle versioning and CHANGELOG generation, while artifact publishing moves to a separate `on: release` triggered workflow.

**Expected Outcomes**:
- Automated releases without bypassing branch protection
- Clean audit trail via Release PR review process
- Elimination of Personal Access Token dependency
- Maintained emoji-based CHANGELOG format
- Preserved monorepo version synchronization
- Maintained dual-artifact upload (VSIX + offline bundle)

**Success Metrics**:
- Release PR created automatically on conventional commit merge
- All version bumps follow conventional commits spec
- GitHub releases created automatically on Release PR merge
- No branch protection violations
- CHANGELOG format consistency maintained
- Zero manual intervention required (except Release PR merge approval)

---

## Technical Context

### Current System State

**Release Automation**:
- Semantic-release v22.0.12 with 6 plugins
- Custom prepare script (`semrel-prepare.mjs`) orchestrates version bumping, building, and packaging
- Workflow uses `SEMANTIC_RELEASE_TOKEN` (PAT) to bypass branch protection
- Artifacts (VSIX + offline bundle) created during release process and uploaded to GitHub Releases
- CHANGELOG.md auto-generated with emoji section headers (🚀 Features, 🐛 Bug Fixes, etc.)

**Monorepo Structure**:
- npm workspaces with 3 packages: root, `packages/extension`, `packages/shared-test`
- Versions synchronized across root + extension package.json files
- `package-lock.json` updated via `npm install` after version bumps
- Build orchestration via `just` commands (justfile)

**Branch Protection**:
- Main branch has PR-only ruleset (no direct commits allowed)
- Organization enforces read-only default GITHUB_TOKEN
- Current workflow bypasses protection using `SEMANTIC_RELEASE_TOKEN` (PAT)

**Distribution Model**:
- GitHub Releases only (no npm registry, no VS Code Marketplace)
- VSIX file + offline installation bundle (.zip with 5 files)
- Installation via `npx github:AI-Substrate/wormhole` or direct VSIX

### Integration Requirements

- Preserve `just build`, `just package-extension`, `just package-offline-bundle` invocation sequence
- Maintain dual package.json version synchronization
- Keep emoji-based CHANGELOG format
- Preserve workflow output contract (`new-release-published`, `new-release-version`)
- Support custom breaking change versioning (minor bumps in 0.x, major in 1.x+)
- Ensure activation events validation (`activationEvents: ["*"]`) during VSIX packaging

### Constraints and Limitations

1. **GitHub API Rate Limits**: 5000 requests/hour for authenticated requests
2. **Branch Protection**: Cannot bypass via PAT; requires GitHub App or bypass list
3. **release-please v4**: Configuration externalized to JSON files (not workflow YAML)
4. **`releases_created` Output Bug**: Must use singular `release_created` output
5. **Workflow Trigger Limitations**: Default `GITHUB_TOKEN` cannot trigger downstream workflows
6. **Squash Merge Dependency**: PR titles must follow conventional commits (if using squash strategy)

### Assumptions

- Organization allows GitHub App installations
- Repository admin can create and install GitHub Apps
- Team follows conventional commit format consistently
- Current v1.0.0 is the baseline version for release-please bootstrap
- Merging Release PRs will happen on team's schedule (not time-critical)
- Current CHANGELOG.md format (emoji sections) is acceptable and must be preserved
- No pre-release versions needed (alpha/beta releases not in scope)

---

## Critical Research Findings

### Deduplication Log

| Final ID | Source Discoveries | Merge Reason |
|----------|-------------------|--------------|
| 01 | S1-02, S4-03, S3-01 | All discuss monorepo version synchronization |
| 02 | S4-02, S1-07 | Both cover build artifact dependency chain and justfile integration |
| 03 | S1-08, S4-04, S2-01, S2-04 | All relate to GitHub token permissions and branch protection bypass |
| 12 | S1-04, S4-06, S3-06 | All discuss conventional commits with emoji changelog sections |

---

### 🚨 Critical Discovery 01: Monorepo Version Synchronization with Workspace Plugin
**Impact**: Critical
**Sources**: [S1-02, S4-03, S3-01] (pattern analyst + dependency mapper + spec analyst)

**Problem**: Project is an npm workspace monorepo with 3 package.json files (root, extension, shared-test) that must maintain synchronized versions. Current semantic-release uses custom script (`semrel-prepare.mjs`) to manually update root + extension, then runs `npm install` to sync `package-lock.json`.

**Root Cause**: Release-please has monorepo support but requires explicit configuration. Default behavior updates only root package, leaving workspace packages out of sync.

**Solution**: Configure release-please with `node-workspace` plugin and `linked-versions` strategy to automatically discover and update all workspace packages with synchronized versions.

**Example**:
```json
// ❌ WRONG - Only root package updated
{
  "packages": {
    ".": {
      "release-type": "node"
    }
  }
}
// Result: Root at v1.1.0, extension still at v1.0.0

// ✅ CORRECT - All workspace packages synchronized
{
  "packages": {
    ".": {
      "release-type": "node",
      "package-name": "vsc-bridge"
    },
    "packages/extension": {
      "release-type": "node",
      "package-name": "vsc-bridge-extension"
    }
  },
  "plugins": ["node-workspace"],
  "linked-versions": [
    {
      "groupName": "vsc-bridge-monorepo",
      "components": [".", "packages/extension", "packages/shared-test"]
    }
  ]
}
// Result: All packages updated to v1.1.0, package-lock.json synced
```

**Action Required**: Phase 2 must configure `release-please-config.json` with workspace strategy and linked versions.

**Affects Phases**: Phase 2 (configuration), Phase 7 (validation)

---

### 🚨 Critical Discovery 02: Build Artifact Dependencies Chain with Justfile Integration
**Impact**: Critical
**Sources**: [S4-02, S1-07] (dependency mapper + pattern analyst)

**Problem**: Release process has strict 6-step dependency chain: version bump → npm install → build → package VSIX → package offline bundle → upload. The `semrel-prepare.mjs` script orchestrates this, with validation enforcing `activationEvents: ["*"]` (architectural requirement). Justfile contains all build/package logic that shouldn't be duplicated.

**Root Cause**: Semantic-release runs everything in one atomic job. Release-please creates Release PR first, then builds artifacts after merge. Must preserve version-first, then-build ordering and justfile invocation.

**Solution**: Move artifact building to separate `on: release` workflow that runs AFTER release-please creates GitHub Release. Invoke exact `just` command sequence from `semrel-prepare.mjs`.

**Example**:
```yaml
# ❌ WRONG - Building before version update
- name: Build artifacts
  run: just build && just package-extension

- name: Update version
  run: npm version ${{ steps.release.outputs.version }}
  # Too late! Artifacts already built with old version

# ✅ CORRECT - Version in Release PR, build after release created
# .github/workflows/publish-on-release.yml
on:
  release:
    types: [published]

steps:
  - name: Checkout release tag
    uses: actions/checkout@v4
    with:
      ref: ${{ github.event.release.tag_name }}  # Correct version

  - name: Build with correct version
    run: |
      just build                    # Compiles with release version
      just package-extension        # Validates activationEvents
      just package-offline-bundle   # Requires VSIX to exist
```

**Action Required**: Phase 3 creates Release PR workflow only (no artifact building). Phase 4 creates separate publishing workflow triggered by release event.

**Affects Phases**: Phase 3 (workflow structure), Phase 4 (artifact publishing), Phase 7 (validation)

---

### 🚨 Critical Discovery 03: GitHub Token Permission Requirements and Branch Protection Bypass
**Impact**: Critical
**Sources**: [S1-08, S4-04, S2-01, S2-04] (pattern analyst + dependency mapper + technical investigator)

**Problem**: Current workflow uses `SEMANTIC_RELEASE_TOKEN` (PAT) to bypass branch protection. Default `GITHUB_TOKEN` cannot trigger downstream workflows OR bypass branch protection. Organization enforces read-only default tokens.

**Root Cause**: GitHub security model prevents `GITHUB_TOKEN` from triggering workflows (prevent recursive runs) and respects branch protection (prevent security bypass). Only GitHub Apps can be added to branch protection bypass lists.

**Solution**: Create organization-wide GitHub App with minimal permissions (`contents: write`, `pull-requests: write`), install on repository, add to bypass list, and use app installation token in workflows via `actions/create-github-app-token`.

**Example**:
```yaml
# ❌ WRONG - Default token can't bypass protection or trigger workflows
- uses: google-github-actions/release-please-action@v4
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
  # Fails: Cannot create Release PR (blocked by protection)
  # Impact: Publishing workflow won't trigger (no downstream workflows)

# ✅ CORRECT - GitHub App token bypasses protection and triggers workflows
- name: Generate GitHub App token
  id: app-token
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.RELEASE_PLEASE_APP_ID }}
    private-key: ${{ secrets.RELEASE_PLEASE_APP_PRIVATE_KEY }}

- uses: google-github-actions/release-please-action@v4
  with:
    token: ${{ steps.app-token.outputs.token }}
  # Success: Creates Release PR (bypasses protection)
  # Success: Publishing workflow triggers (App token allows downstream)
```

**Action Required**: Phase 1 creates GitHub App, configures permissions, installs on org, adds to bypass list, stores credentials as secrets.

**Affects Phases**: Phase 1 (GitHub App setup), Phase 3 (workflow authentication), Phase 4 (publishing workflow trigger)

---

### 🚨 Critical Discovery 04: Release-Please v4 Configuration Externalization
**Impact**: Critical
**Sources**: [S2-02] (technical investigator)

**Problem**: Release-please v4 moved ALL configuration from workflow YAML inputs to external JSON files. Using v4 action with v3-style workflow inputs causes silent failures or unexpected behavior.

**Root Cause**: v4 architectural redesign favors "infrastructure as code" by externalizing config, enabling better monorepo support and manifest-driven releases.

**Solution**: Create `release-please-config.json` (release configuration) and `.release-please-manifest.json` (version baseline) files. Workflow YAML only references these files, no inline config.

**Example**:
```yaml
# ❌ WRONG - v3 style with inline config (fails in v4)
- uses: googleapis/release-please-action@v4
  with:
    release-type: node
    package-name: vsc-bridge
    extra-files: |
      packages/extension/package.json
  # Fails: v4 ignores these inputs!

# ✅ CORRECT - v4 style with external config files
# .release-please-manifest.json
{
  ".": "1.0.0"
}

# release-please-config.json
{
  "packages": {
    ".": {
      "release-type": "node",
      "package-name": "vsc-bridge",
      "extra-files": ["packages/extension/package.json"]
    }
  }
}

# workflow.yml
- uses: googleapis/release-please-action@v4
  with:
    config-file: release-please-config.json
    manifest-file: .release-please-manifest.json
  # Success: Reads configuration from files
```

**Action Required**: Phase 2 creates both config files with all settings. Phase 3 workflow references files only.

**Affects Phases**: Phase 2 (config creation), Phase 3 (workflow implementation)

---

### 🚨 Critical Discovery 05: releases_created Output Bug - Use Singular Form
**Impact**: Critical
**Sources**: [S2-03] (technical investigator)

**Problem**: The `releases_created` (plural) output in release-please-action v4 is **always true** regardless of whether a release was created. Using this for conditional publishing will deploy unreleased code to production.

**Root Cause**: Bug in v4 action's output logic.

**Solution**: Use `release_created` (singular) or path-specific outputs (`<path>--release_created`) for conditional steps.

**Example**:
```yaml
# ❌ WRONG - Always true, deploys even when no release!
steps:
  - uses: googleapis/release-please-action@v4
    id: release

  - name: Publish artifacts
    if: ${{ steps.release.outputs.releases_created }}  # ❌ ALWAYS TRUE
    run: gh release upload ...
  # Danger: Runs even when no release created!

# ✅ CORRECT - Use singular form
steps:
  - uses: googleapis/release-please-action@v4
    id: release

  - name: Publish artifacts
    if: ${{ steps.release.outputs.release_created }}  # ✅ Correct
    run: gh release upload ...
  # Success: Only runs when release was actually created
```

**Action Required**: Phase 3 and Phase 4 workflows MUST use singular `release_created` output.

**Affects Phases**: Phase 3 (workflow conditionals), Phase 4 (publish workflow conditionals), Phase 7 (validation)

---

### 🚨 Critical Discovery 06: Workflow Output Contract Preservation
**Impact**: Critical
**Sources**: [S4-01] (dependency mapper)

**Problem**: Current `build-and-release.yml` exposes two job outputs (`new-release-published` and `new-release-version`) that external systems or future workflows may depend on. No current workflows consume these (verified), but contract should be preserved for stability.

**Root Cause**: Outputs create API contract. Breaking contract may affect external CI/CD integrations or future workflow additions.

**Solution**: Map release-please outputs to semantic-release output names in workflow.

**Example**:
```yaml
# ❌ WRONG - Different output names break contract
jobs:
  release-please:
    outputs:
      release-created: ${{ steps.release.outputs.release_created }}
      version: ${{ steps.release.outputs.tag_name }}
    # External systems expecting old names will break!

# ✅ CORRECT - Preserve output contract
jobs:
  release-please:
    outputs:
      new-release-published: ${{ steps.release.outputs.release_created }}
      new-release-version: ${{ steps.release.outputs.tag_name }}
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
    # External systems continue working with same output names
```

**Action Required**: Phase 3 workflow must expose outputs with original names.

**Affects Phases**: Phase 3 (workflow outputs), Phase 7 (contract validation)

---

### 🚨 Critical Discovery 07: Failed Release Tag Recovery - Idempotent Tag Creation
**Impact**: Critical
**Sources**: [S3-04] (spec analyst)

**Problem**: If Release PR is merged but tag creation fails (GitHub API 502, network failure, permissions issue), repository enters corrupted state: version bump committed, no tag exists, no release created, future Release PRs blocked with "untagged, merged release PRs outstanding".

**Root Cause**: Non-idempotent tag creation. Release-please expects one-to-one mapping between release commits and tags.

**Solution**: Implement automated recovery workflow that detects untagged release commits and creates missing tags + GitHub Releases idempotently.

**Example**:
```yaml
# .github/workflows/release-tag-verification.yml
name: Verify Release Tags
on:
  schedule:
    - cron: '0 0 * * *'  # Daily verification
  workflow_dispatch:      # Manual recovery trigger

jobs:
  verify-tags:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Find untagged release commits
        id: find-untagged
        run: |
          # Find "chore: release X.Y.Z" commits without corresponding tags
          git log --oneline --grep="^chore: release" --all | \
            while read sha msg; do
              VERSION=$(echo "$msg" | sed -n 's/chore: release \([0-9.]*\).*/\1/p')
              if ! git tag | grep -q "^v${VERSION}$"; then
                echo "${sha}:${VERSION}"
              fi
            done > untagged.txt

      - name: Create missing tags
        if: hashFiles('untagged.txt') != ''
        run: |
          cat untagged.txt | while IFS=: read sha version; do
            git tag "v${version}" "${sha}"
            git push origin "v${version}"
            gh release create "v${version}" --title "v${version}" \
              --notes "$(awk '/^## \[?'${version}'\]?/,/^## / {print}' CHANGELOG.md)"
          done
```

**Action Required**: Phase 3 should include recovery workflow creation. Phase 7 validates recovery workflow works.

**Affects Phases**: Phase 3 (recovery workflow), Phase 7 (failure scenario testing)

---

### 🚨 Critical Discovery 08: Artifact Upload Two-File Contract
**Impact**: Critical
**Sources**: [S4-08] (dependency mapper)

**Problem**: GitHub Releases MUST receive exactly 2 artifacts with specific naming: `vsc-bridge-${VERSION}.vsix` and `vsc-bridge-offline-${VERSION}.zip`. Offline bundle has internal 5-file structure (VSIX, CLI tarball, 2 installers, README) with version substitution. External users depend on naming pattern.

**Root Cause**: Artifact generation has dependencies (offline bundle requires VSIX to exist). Version must be embedded in artifacts during build. Users' installation scripts rely on naming pattern.

**Solution**: Phase 4 publishing workflow must build both artifacts in correct order (VSIX first, then offline bundle) and upload both to release.

**Example**:
```yaml
# ❌ WRONG - Missing offline bundle or wrong naming
- name: Package extension
  run: npx @vscode/vsce package
  # Wrong: Uses default naming, doesn't create offline bundle

# ✅ CORRECT - Both artifacts with correct naming
- name: Build artifacts
  run: |
    VERSION=${{ github.event.release.tag_name }}
    just build                      # Pre-validation + compile
    just package-extension          # Creates artifacts/vsc-bridge-${VERSION}.vsix
    just package-offline-bundle     # Creates artifacts/vsc-bridge-offline-${VERSION}.zip
                                    # (5-file structure: VSIX, tarball, installers, README)

- name: Upload to release
  run: |
    gh release upload "${{ github.event.release.tag_name }}" \
      artifacts/*.vsix \
      artifacts/*.zip \
      --clobber
```

**Action Required**: Phase 4 publishing workflow must invoke exact justfile command sequence and upload both artifacts.

**Affects Phases**: Phase 4 (artifact building and upload), Phase 7 (artifact validation)

---

### ⚠️ High Discovery 09: Custom Prepare Script Integration
**Impact**: High
**Sources**: [S1-01] (pattern analyst)

**Problem**: Semantic-release uses `@semantic-release/exec` plugin with custom `semrel-prepare.mjs` script that validates build integrity BEFORE version changes, updates package.json files, runs npm install, builds, and packages. Release-please has no direct plugin equivalent.

**Root Cause**: Release-please's PR-based flow separates version bumping (in Release PR) from artifact building (after merge).

**Solution**: Extract validation and building logic from `semrel-prepare.mjs` into separate workflow steps in the `on: release` publishing workflow. Version updates handled by release-please automatically.

**Example**:
```bash
# Current semrel-prepare.mjs orchestration:
# 1. Pre-validation build (line 21)
# 2. Update package.json files (lines 25-36)
# 3. npm install to sync package-lock.json (line 40)
# 4. Production build (line 45)
# 5. Package VSIX (line 52)
# 6. Package offline bundle (line 56)

# ✅ CORRECT - Map to workflow steps
# Release-please Release PR handles steps 2-3 automatically
# Publishing workflow handles steps 1, 4-6:

- name: Pre-validation build
  run: just build  # Validates build works before proceeding

- name: Production build
  run: just build  # Build with release version

- name: Package VSIX
  run: just package-extension

- name: Package offline bundle
  run: just package-offline-bundle
```

**Action Required**: Phase 4 publishing workflow replicates `semrel-prepare.mjs` steps 1, 4-6. Phase 5 can delete `semrel-prepare.mjs` after migration.

**Affects Phases**: Phase 4 (publishing workflow design), Phase 5 (cleanup)

---

### ⚠️ High Discovery 10: [skip ci] Pattern and PR-Based Release Flow
**Impact**: High
**Sources**: [S1-05] (pattern analyst)

**Problem**: Semantic-release uses `chore(release): ${version} [skip ci]` commit messages to prevent infinite release loops. Release-please's PR-based flow doesn't push commits directly, so loop prevention strategy differs.

**Root Cause**: Different automation models - semantic-release pushes commits, release-please creates PRs.

**Solution**: Release-please's PR-based flow naturally avoids loops. Release PR creation doesn't trigger push events. Workflow should trigger on `push: main` for creating/updating Release PRs, and publishing workflow triggers on `release: published` event.

**Example**:
```yaml
# ❌ WRONG - Triggering on all push events might cause issues
on:
  push:
    branches: [main]
  # Could trigger on release-please's release commit

# ✅ CORRECT - Release-please handles loop prevention automatically
# .github/workflows/release-please.yml
on:
  push:
    branches: [main]
  # Release-please creates/updates Release PR (no infinite loop)
  # When Release PR merges, release-please creates release (not push)

# .github/workflows/publish-on-release.yml
on:
  release:
    types: [published]
  # Only triggers when release-please creates GitHub Release
  # Won't trigger on random pushes
```

**Action Required**: Phase 3 workflow design must use correct triggers to avoid loops.

**Affects Phases**: Phase 3 (workflow triggers)

---

### ⚠️ High Discovery 11: Pre-1.0 Breaking Change Versioning (Now Obsolete)
**Impact**: High
**Sources**: [S1-06] (pattern analyst)

**Problem**: Current `.releaserc.json` has custom rule where `breaking` type triggers **minor** bump (0.x → 0.y) for pre-1.0 versions. Project is now at v1.0.0, so this rule is obsolete. Need to decide if breaking changes should trigger major bumps (1.x → 2.x) going forward.

**Root Cause**: Custom pre-1.0 versioning strategy. Standard semantic versioning post-1.0 uses breaking → major.

**Solution**: Configure release-please with standard semantic versioning (breaking → major bump post-1.0). Document that major version updates are now automatic for breaking changes.

**Example**:
```json
// ❌ WRONG - Preserving pre-1.0 rule post-1.0
{
  "bump-minor-pre-major": true
}
// Result: 1.0.0 → 1.1.0 on BREAKING CHANGE (unexpected!)

// ✅ CORRECT - Standard semver post-1.0
{
  "bump-minor-pre-major": false,
  "bump-patch-for-minor-pre-major": false
}
// Result: 1.0.0 → 2.0.0 on BREAKING CHANGE (standard semver)
```

**Action Required**: Phase 2 config must set `bump-minor-pre-major: false`. Phase 6 documentation must explain major version bumps for breaking changes.

**Affects Phases**: Phase 2 (configuration), Phase 6 (documentation)

---

### ⚠️ High Discovery 12: Conventional Commits with Emoji Changelog Sections
**Impact**: High
**Sources**: [S1-04, S4-06, S3-06] (pattern analyst + dependency mapper + spec analyst)

**Problem**: Current `.releaserc.json` configures conventional commits with custom emoji section headers (🚀 Features, 🐛 Bug Fixes, ⚡ Performance Improvements, etc.). Release-please has different default changelog format without emojis.

**Root Cause**: Different changelog template systems. Semantic-release uses `conventionalcommits` preset config. Release-please uses `changelog-sections` config.

**Solution**: Configure release-please's `changelog-sections` to match semantic-release's emoji format exactly, preserving all 11 commit types and hidden status.

**Example**:
```json
// release-please-config.json
{
  "packages": {
    ".": {
      "changelog-sections": [
        {"type": "feat", "section": "🚀 Features"},
        {"type": "fix", "section": "🐛 Bug Fixes"},
        {"type": "perf", "section": "⚡ Performance Improvements"},
        {"type": "revert", "section": "⏪ Reverts"},
        {"type": "docs", "section": "📚 Documentation"},
        {"type": "refactor", "section": "📦 Code Refactoring"},
        {"type": "test", "section": "🚨 Tests", "hidden": true},
        {"type": "build", "section": "🛠 Build System", "hidden": true},
        {"type": "ci", "section": "⚙️ Continuous Integration", "hidden": true},
        {"type": "style", "section": "💎 Styles", "hidden": true},
        {"type": "chore", "section": "🔧 Miscellaneous Chores", "hidden": true}
      ]
    }
  }
}
```

**Action Required**: Phase 2 config must map all 11 commit types from `.releaserc.json` lines 76-126 to `changelog-sections`.

**Affects Phases**: Phase 2 (configuration), Phase 7 (CHANGELOG validation)

---

### ⚠️ High Discovery 13: Squash Merge PR Title Requirements
**Impact**: High
**Sources**: [S2-05] (technical investigator)

**Problem**: If repository uses "Squash and Merge" strategy, release-please analyzes the squashed commit message (derived from PR title) instead of individual commits. Non-conventional PR titles cause release-please to skip changes.

**Root Cause**: Squash merging collapses all commits into one, making PR title the sole source of conventional commit metadata.

**Solution**: Repository settings should enforce "Merge commits" or "Rebase and merge" strategy. If squash merge required, add PR title validation workflow.

**Example**:
```yaml
# .github/workflows/pr-title-validation.yml (if using squash merge)
name: Validate PR Title
on:
  pull_request:
    types: [opened, edited, synchronize]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        with:
          types: |
            feat
            fix
            docs
            chore
            refactor
            perf
            test
            build
            ci
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Action Required**: Phase 0 validation should check merge strategy. Phase 6 documentation should document PR title requirements if using squash merge.

**Affects Phases**: Phase 0 (validation), Phase 6 (documentation)

---

### ⚠️ High Discovery 14: GitHub App Key Rotation Lifecycle Management
**Impact**: High
**Sources**: [S3-02] (spec analyst)

**Problem**: GitHub App private key needs secure storage and periodic rotation. Spec mentions rotation but doesn't define schedule, process, or failure handling.

**Root Cause**: Private keys don't expire by default but security best practices require rotation. Key compromise or organizational policy may require emergency rotation.

**Solution**: Implement 90-day proactive rotation with automated expiry monitoring and documented rotation procedure.

**Example**:
```yaml
# .github/workflows/app-key-monitoring.yml
name: Monitor GitHub App Key
on:
  schedule:
    - cron: '0 0 * * *'  # Daily

jobs:
  check-key:
    runs-on: ubuntu-latest
    steps:
      - name: Check key age
        run: |
          # GitHub App keys don't have built-in expiry
          # Track rotation date via repository variable
          LAST_ROTATION="${{ vars.APP_KEY_LAST_ROTATION }}"
          DAYS_SINCE=$(( ($(date +%s) - $(date -d "$LAST_ROTATION" +%s)) / 86400 ))

          if [ $DAYS_SINCE -gt 76 ]; then  # 14 days before 90-day rotation
            gh issue create \
              --title "GitHub App Key Rotation Due" \
              --body "Last rotation: $LAST_ROTATION ($DAYS_SINCE days ago). Rotate before $(date -d "$LAST_ROTATION +90 days" +%Y-%m-%d)."
          fi
```

**Action Required**: Phase 1 GitHub App creation should document rotation procedure. Phase 6 documentation should include rotation schedule and steps.

**Affects Phases**: Phase 1 (app creation), Phase 6 (documentation)

---

### ⚠️ High Discovery 15: Artifact Publishing Timing - Separate on:release Workflow
**Impact**: High
**Sources**: [S3-07] (spec analyst)

**Problem**: Current `semrel-prepare.mjs` builds artifacts **before** creating release. Spec says "publishing triggered by GitHub release event" which means artifacts must be built **after** Release PR merges and release is created.

**Root Cause**: Different automation models. Semantic-release: version → build → release (atomic). Release-please: version (PR) → merge → release → build (sequential).

**Solution**: Create separate `publish-on-release.yml` workflow triggered by `on: release` event. This workflow builds artifacts and uploads to the already-created GitHub Release.

**Example**:
```yaml
# .github/workflows/publish-on-release.yml
name: Publish Artifacts
on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.release.tag_name }}

      - name: Build artifacts
        run: |
          just build
          just package-extension
          just package-offline-bundle

      - name: Upload to release
        run: |
          gh release upload "${{ github.event.release.tag_name }}" \
            artifacts/*.vsix artifacts/*.zip --clobber
```

**Action Required**: Phase 4 creates separate publishing workflow. Phase 3 Release PR workflow does NOT build artifacts.

**Affects Phases**: Phase 3 (workflow design), Phase 4 (publishing workflow)

---

### ⚠️ High Discovery 16: Organization Read-Only Token Policy Verification
**Impact**: High
**Sources**: [S3-05] (spec analyst)

**Problem**: Spec says "organization enforces read-only GITHUB_TOKEN default policy" but current workflow uses `SEMANTIC_RELEASE_TOKEN` (PAT) and works. Need to verify if org policy blocks PAT usage or only affects default `GITHUB_TOKEN`.

**Root Cause**: Unclear if org policy affects custom secrets or only default token.

**Solution**: Test org policy behavior in Phase 0 validation. If PAT still works, GitHub App migration is less urgent. If PAT blocked, GitHub App is required immediately.

**Example**:
```yaml
# .github/workflows/test-org-policy.yml
name: Test Org Token Policy
on: workflow_dispatch

jobs:
  test-tokens:
    runs-on: ubuntu-latest
    steps:
      - name: Test GITHUB_TOKEN
        run: gh label create test-default --color FF0000 || echo "Default token is read-only"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Test SEMANTIC_RELEASE_TOKEN
        run: gh label create test-pat --color 00FF00 && echo "PAT works" || echo "PAT blocked"
        env:
          GH_TOKEN: ${{ secrets.SEMANTIC_RELEASE_TOKEN }}

      - name: Cleanup
        run: gh label delete test-default test-pat --yes
```

**Action Required**: Phase 0 must run policy test workflow and document results.

**Affects Phases**: Phase 0 (policy testing), Phase 1 (determines GitHub App urgency)

---

### ℹ️ Medium Discovery 17: Workflow Naming Convention
**Impact**: Medium
**Sources**: [S1-03] (pattern analyst)

**Problem**: Workflows follow kebab-case naming (build-and-release.yml, pull-request.yml). New workflows should maintain consistency.

**Root Cause**: Established project convention.

**Solution**: Name new workflows `release-please.yml` and `publish-on-release.yml` using kebab-case.

**Action Required**: Phase 3 and Phase 4 must use kebab-case filenames.

**Affects Phases**: Phase 3, Phase 4

---

### ℹ️ Medium Discovery 18: NPM Publication Boundary - GitHub Distribution Only
**Impact**: Medium
**Sources**: [S4-05] (dependency mapper)

**Problem**: Project has `@semantic-release/npm` as devDependency but doesn't use it. Distribution is GitHub-only (no npm registry, no VS Code Marketplace). Must not enable npm publication during migration.

**Root Cause**: Project uses GitHub Releases + npx GitHub installation model.

**Solution**: Configure release-please with GitHub-only distribution. Do NOT enable npm publishing.

**Example**:
```json
// release-please-config.json
{
  "packages": {
    ".": {
      "release-type": "node",
      "skip-github-release": false  // ✅ Create GitHub Releases
      // NO "publish" or npm-related config
    }
  }
}
```

**Action Required**: Phase 2 config must not include npm publishing options.

**Affects Phases**: Phase 2 (configuration)

---

### ℹ️ Medium Discovery 19: CHANGELOG Mutation Cross-Cutting Concern
**Impact**: Medium
**Sources**: [S4-07] (dependency mapper)

**Problem**: CHANGELOG.md is auto-generated by semantic-release and committed back to repo. It's the ONLY auto-maintained documentation file. Release-please also auto-generates CHANGELOG but uses different format by default.

**Root Cause**: Different changelog template systems.

**Solution**: Already covered in Discovery 12 - configure `changelog-sections` to match emoji format.

**Action Required**: Covered by Phase 2 (configuration).

**Affects Phases**: Phase 2 (configuration)

---

### ℹ️ Medium Discovery 20: First Release After Migration - Bootstrap from v1.0.0
**Impact**: Medium
**Sources**: [S3-03] (spec analyst)

**Problem**: Existing CHANGELOG.md has v1.0.0 entry (12 lines). Spec says "start fresh" but unclear if existing content should be preserved or deleted. Also unclear if release-please will skip v1.0.0 or try to re-release.

**Root Cause**: Release-please needs version baseline to know what's already released.

**Solution**: Bootstrap release-please with existing v1.0.0 as baseline via `.release-please-manifest.json`. Keep existing CHANGELOG content; release-please will prepend new entries.

**Example**:
```json
// .release-please-manifest.json
{
  ".": "1.0.0"
}
// Release-please sees v1.0.0 tag exists, starts from next version
```

**Action Required**: Phase 2 manifest creation must set baseline to "1.0.0".

**Affects Phases**: Phase 2 (manifest creation)

---

### ℹ️ Medium Discovery 21: Commit Search Depth and API Rate Limits
**Impact**: Medium
**Sources**: [S2-06] (technical investigator)

**Problem**: Release-please scans commit history to detect changes since last release. For repos with 1000+ commits between releases, default scan can consume hundreds of GitHub API calls, potentially hitting 5000/hour limit.

**Root Cause**: Each commit examination requires API calls. Unbounded scan can exhaust rate limit.

**Solution**: Configure `commit-search-depth: 100` to limit scan window. Use `bootstrap-sha` to define starting commit for initial setup.

**Example**:
```json
// release-please-config.json
{
  "commit-search-depth": 100,
  "bootstrap-sha": "6552cc9...",  // Last commit before automation
  "packages": {
    ".": {
      "release-type": "node"
    }
  }
}
```

**Action Required**: Phase 2 config should include `commit-search-depth: 100` and `bootstrap-sha`.

**Affects Phases**: Phase 2 (configuration)

---

### ℹ️ Medium Discovery 22: BREAKING CHANGE Case Sensitivity
**Impact**: Medium
**Sources**: [S2-07] (technical investigator)

**Problem**: Release-please only recognizes `BREAKING CHANGE:` (all uppercase) in commit footers for major version bumps. Common variations like `Breaking Change:` or `breaking change:` are ignored, resulting in patch/minor bumps when major was intended.

**Root Cause**: Conventional Commits specification requires uppercase. Release-please's parser is case-sensitive.

**Solution**: Document that `BREAKING CHANGE:` must be uppercase, or use `!` syntax (e.g., `feat!:`) which is case-insensitive. Optionally add commit linting.

**Example**:
```bash
# ❌ WRONG - Won't trigger major bump
git commit -m "feat: add endpoint

breaking change: removed v1 API"
# Result: Minor bump (1.0.0 → 1.1.0)

# ✅ CORRECT - Triggers major bump (footer)
git commit -m "feat: add endpoint

BREAKING CHANGE: removed v1 API"
# Result: Major bump (1.0.0 → 2.0.0)

# ✅ CORRECT - Triggers major bump (! syntax)
git commit -m "feat!: add endpoint

Removed v1 API support"
# Result: Major bump (1.0.0 → 2.0.0)
```

**Action Required**: Phase 6 documentation must document breaking change format.

**Affects Phases**: Phase 6 (documentation)

---

### ℹ️ Low Discovery 23: First Release Bootstrap Requirement
**Impact**: Low
**Sources**: [S2-08] (technical investigator)

**Problem**: On initial setup, release-please doesn't know current version or which commit to start from without `.release-please-manifest.json`.

**Root Cause**: Release-please needs version baseline.

**Solution**: Already covered in Discovery 20 - create manifest with "1.0.0" baseline.

**Action Required**: Covered by Phase 2 (manifest creation).

**Affects Phases**: Phase 2 (manifest creation)

---

### ℹ️ Low Discovery 24: Breaking Change Versioning Post-1.0 Transition
**Impact**: Low
**Sources**: [S3-08] (spec analyst)

**Problem**: Current custom rule (breaking → minor for 0.x) is now obsolete at v1.0.0. Need to decide if breaking changes should trigger major bumps (1.x → 2.x) going forward.

**Root Cause**: Project reached v1.0.0 stability milestone.

**Solution**: Already covered in Discovery 11 - use standard semver (breaking → major).

**Action Required**: Covered by Phase 2 (configuration).

**Affects Phases**: Phase 2 (configuration)

---

## Testing Philosophy

### Testing Approach
**Selected Approach**: Manual Only (from specification)

**Rationale**: This is configuration-only work involving GitHub workflows (YAML), GitHub App setup, release-please configuration (JSON), and semantic-release removal. No programmatic code to unit test. Validation requires real GitHub Actions execution and GitHub API interactions.

**Focus Areas**:
- Manual verification of workflow execution
- Release PR creation with correct version bump
- GitHub Release creation on Release PR merge
- Artifact building and upload correctness
- CHANGELOG format consistency
- Branch protection compliance

**Excluded**: Automated tests not applicable for configuration files (YAML/JSON). Integration tests would require GitHub API mocking which adds complexity without value for one-time migration.

### Manual Verification Steps

All phases include manual verification checklists in their acceptance criteria:

1. **GitHub App Setup** - Verify permissions, installation, bypass list inclusion via GitHub UI
2. **Configuration Files** - Validate JSON syntax, verify workspace config matches package structure
3. **Workflow Execution** - Trigger workflow manually, observe Release PR creation, verify outputs
4. **Release PR Content** - Review version bump, CHANGELOG format, package.json changes
5. **Release Creation** - Merge Release PR, verify GitHub Release created with correct tag
6. **Artifact Publishing** - Verify VSIX + offline bundle uploaded with correct naming
7. **Branch Protection** - Confirm no protection violations in workflow logs
8. **End-to-End Flow** - Complete release cycle from commit → Release PR → merge → release → artifacts

---

## Documentation Strategy

**Location**: Hybrid (README + docs/how/)

**Rationale**: Users need quick-start guidance in README (link to automated releases), but detailed GitHub App setup, troubleshooting, and maintenance procedures belong in docs/how/ for maintainers.

**Content Split**:
- **README.md**: Brief mention that releases are automated via release-please, link to detailed documentation
- **docs/how/releases/**: Complete setup guide for GitHub App, release-please configuration, troubleshooting, maintenance

**Target Audience**:
- **README**: All users (brief awareness of automated releases)
- **docs/how/releases/**: Repository maintainers, contributors setting up forks

**Maintenance**: Update when release workflow changes, GitHub App permissions change, or troubleshooting procedures are refined.

### Documentation Placement Decision

**Existing docs/how/ structure**:
```
docs/how/
├── dogfood/
│   └── dogfooding-vsc-bridge.md
├── testing/
│   └── ...
└── manual-test/
    └── ...
```

**Decision**: Create new `docs/how/releases/` directory (no existing release documentation)

**File strategy**: Create numbered files:
- `1-overview.md` - Introduction to release automation
- `2-github-app-setup.md` - Step-by-step GitHub App creation and installation
- `3-release-please-configuration.md` - Configuration file reference
- `4-release-workflow.md` - How Release PRs work, how to merge them
- `5-troubleshooting.md` - Common issues and recovery procedures

---

## Implementation Phases

---

### Phase 1: Release-Please Migration

**Objective**: Complete migration from semantic-release to release-please, including GitHub App setup, configuration files, workflows, semantic-release removal, documentation, and end-to-end validation.

**Deliverables**:
- GitHub App created and installed with bypass permissions
- release-please configuration files (manifest + config)
- Release-please workflow (.github/workflows/release-please.yml)
- Tag recovery workflow (.github/workflows/release-tag-verification.yml)
- Artifact publishing workflow (.github/workflows/publish-on-release.yml)
- Semantic-release removed (config, scripts, dependencies, workflow)
- Documentation created (README + docs/how/releases/)
- End-to-end validation completed

**Dependencies**: None

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GitHub App setup requires org admin | Low | High | Request access before starting |
| Wrong output name breaks downstream | Medium | High | Use singular `release_created` |
| Premature semantic-release removal | Medium | Critical | Only remove after validation passes |
| Test release pollutes git history | Medium | Low | Use chore: scope for test commits |

### Tasks (Manual Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| **Pre-Migration Validation** |
| 1.1 | [ ] | Document current release workflow state | Screenshots of build-and-release.yml execution, CHANGELOG.md, v1.0.0 artifacts | - | Baseline for comparison |
| 1.2 | [ ] | Test organization token policy | Documented: SEMANTIC_RELEASE_TOKEN works? GITHUB_TOKEN works? | - | [Discovery 16](#-high-discovery-16-organization-read-only-token-policy-verification) |
| 1.3 | [ ] | Verify repository merge strategy | Documented: squash merge enabled? PR title validation needed? | - | [Discovery 13](#-high-discovery-13-squash-merge-pr-title-requirements) |
| 1.4 | [ ] | Verify current version baseline | Confirmed: package.json v1.0.0, git tag v1.0.0, CHANGELOG v1.0.0 entry | - | Baseline for manifest |
| **GitHub App Creation** |
| 1.5 | [ ] | Create GitHub App in organization | App exists at https://github.com/organizations/AI-Substrate/settings/apps/ | - | [Discovery 03](#-critical-discovery-03-github-token-permission-requirements-and-branch-protection-bypass) |
| 1.6 | [ ] | Configure App permissions | Permissions: contents:write, pull-requests:write; all others disabled | - | Minimal permissions |
| 1.7 | [ ] | Set App homepage URL | Homepage: https://github.com/AI-Substrate/wormhole | - | Repository URL |
| 1.8 | [ ] | Generate and download private key | Private key (.pem) downloaded to secure location | - | Never commit to git! |
| 1.9 | [ ] | Install App on AI-Substrate organization | Installation confirmed at organization/settings/installations | - | Org-wide installation |
| 1.10 | [ ] | Add App to main branch bypass list | App in Repository Settings → Rules → Rulesets → main → Bypass list | - | Allows Release PR creation |
| 1.11 | [ ] | Store App ID as repository secret | Secret RELEASE_PLEASE_APP_ID created | - | GitHub Settings → Secrets → Actions |
| 1.12 | [ ] | Store private key as repository secret | Secret RELEASE_PLEASE_APP_PRIVATE_KEY created | - | Multi-line secret |
| 1.13 | [ ] | Set APP_KEY_LAST_ROTATION variable | Variable set to today's date (YYYY-MM-DD) | - | For expiry monitoring |
| 1.14 | [ ] | Test App token generation | `actions/create-github-app-token@v1` returns valid token | - | Verify credentials work |
| **Configuration Files** |
| 1.15 | [ ] | Create .release-please-manifest.json | File with `{".": "1.0.0"}` | - | [Discovery 20](#-medium-discovery-20-first-release-after-migration---bootstrap-from-v100) |
| 1.16 | [ ] | Create release-please-config.json | File must contain: (1) `packages` object with keys ".", "packages/extension", "packages/shared-test", (2) `plugins: ["node-workspace"]`, (3) `linked-versions` array with groupName "vsc-bridge-monorepo", (4) `changelog-sections` array with 11 types from Discovery 12. Validate: `cat release-please-config.json \| jq 'has("packages") and has("plugins") and has("linked-versions")'` returns `true` | - | See example config below tasks table |
| 1.17 | [ ] | Configure workspace packages | Config: `.`, `packages/extension`, `packages/shared-test` | - | [Discovery 01](#-critical-discovery-01-monorepo-version-synchronization-with-workspace-plugin) |
| 1.18 | [ ] | Configure node-workspace plugin | `"plugins": ["node-workspace"]` | - | Workspace version sync |
| 1.19 | [ ] | Configure linked-versions | All 3 packages in "vsc-bridge-monorepo" group | - | Synchronized versions |
| 1.20 | [ ] | Configure emoji changelog sections | 11 commit types with emoji headers | - | [Discovery 12](#-high-discovery-12-conventional-commits-with-emoji-changelog-sections) |
| 1.21 | [ ] | Configure versioning strategy | `bump-minor-pre-major: false` | - | Standard semver post-1.0 |
| 1.22 | [ ] | Configure commit search depth | `commit-search-depth: 100` | - | Prevent API rate limits |
| 1.23 | [ ] | Configure bootstrap SHA | `bootstrap-sha: "6552cc9..."` (v1.0.0 commit) | - | Skip ancient history |
| 1.24 | [ ] | Configure extra-files | `extra-files: ["packages/extension/package.json"]` | - | Dual package.json sync |
| 1.25 | [ ] | Validate JSON syntax | Both files pass `jq` validation | - | No syntax errors |
| **Release-Please Workflow** |
| 1.26 | [ ] | Create .github/workflows/release-please.yml | Workflow file with correct structure | - | [Discovery 10](#-high-discovery-10-skip-ci-pattern-and-pr-based-release-flow) |
| 1.27 | [ ] | Configure workflow trigger | `on: push: branches: [main]` | - | Creates/updates Release PR |
| 1.28 | [ ] | Configure workflow permissions | `permissions: contents:write, pull-requests:write` | - | Minimal permissions |
| 1.29 | [ ] | Add GitHub App token generation step | Uses `actions/create-github-app-token@v1` | - | [Discovery 03](#-critical-discovery-03-github-token-permission-requirements-and-branch-protection-bypass) |
| 1.30 | [ ] | Add release-please action step | Uses `googleapis/release-please-action@v4` | - | [Discovery 04](#-critical-discovery-04-release-please-v4-configuration-externalization) |
| 1.31 | [ ] | Configure release-please with App token | `token: steps.app-token.outputs.token` | - | Not GITHUB_TOKEN |
| 1.32 | [ ] | Add workflow outputs | `new-release-published`, `new-release-version` | - | [Discovery 06](#-critical-discovery-06-workflow-output-contract-preservation) |
| 1.33 | [ ] | Verify singular output used | Uses `release_created` (NOT `releases_created`) | - | [Discovery 05](#-critical-discovery-05-releases_created-output-bug---use-singular-form) |
| **Tag Recovery Workflow** |
| 1.34 | [ ] | Create .github/workflows/release-tag-verification.yml | Recovery workflow with schedule + manual dispatch | - | [Discovery 07](#-critical-discovery-07-failed-release-tag-recovery---idempotent-tag-creation) |
| 1.35 | [ ] | Implement untagged release detection | Finds "chore: release X.Y.Z" without vX.Y.Z tags | - | Idempotent recovery |
| 1.36 | [ ] | Implement missing tag creation | Creates tags + GitHub Releases | - | Recovers from failures |
| **Artifact Publishing Workflow** |
| 1.37 | [ ] | Create .github/workflows/publish-on-release.yml | Workflow triggered by release:published | - | [Discovery 15](#-high-discovery-15-artifact-publishing-timing---separate-onrelease-workflow) |
| 1.38 | [ ] | Add checkout with release tag | `ref: github.event.release.tag_name` | - | Correct version |
| 1.39 | [ ] | Add Node.js 22 setup | With npm cache | - | Build environment |
| 1.40 | [ ] | Add just installation | Just installed to /usr/local/bin | - | [Discovery 02](#-critical-discovery-02-build-artifact-dependencies-chain-with-justfile-integration) |
| 1.41 | [ ] | Add npm dependencies install | `npm ci` | - | Required for build |
| 1.42 | [ ] | Add build step | `just build` | - | [Discovery 09](#-high-discovery-09-custom-prepare-script-integration) |
| 1.43 | [ ] | Add VSIX packaging | `just package-extension` | - | Creates *.vsix |
| 1.44 | [ ] | Add offline bundle packaging | `just package-offline-bundle` | - | [Discovery 08](#-critical-discovery-08-artifact-upload-two-file-contract) |
| 1.45 | [ ] | Add artifact upload | `gh release upload` both *.vsix and *.zip | - | Upload to release |
| 1.46 | [ ] | Add workflow artifact backup | 90-day retention | - | Backup copy |
| **Testing and Validation** |
| 1.46a | [ ] | Document rollback baseline | Record current state: `git rev-parse HEAD > /tmp/pre-test-sha.txt`, `git tag -l > /tmp/pre-test-tags.txt`, `gh release list > /tmp/pre-test-releases.txt` | - | Rollback reference if testing fails |
| 1.47 | [ ] | Create test feature branch | Branch: `test/release-please-validation` | - | Safe testing |
| 1.48 | [ ] | Make test commit (feat:) | Commit: `feat(test): validate release-please` | - | Triggers minor bump |
| 1.49 | [ ] | Merge to main | PR merged | - | Triggers workflow |
| 1.50 | [ ] | Verify Release PR created | PR with title "chore: release X.Y.Z" | - | Workflow works |
| 1.51 | [ ] | Verify Release PR contents | Updates: package.json x3, package-lock.json, CHANGELOG.md | - | [Discovery 01](#-critical-discovery-01-monorepo-version-synchronization-with-workspace-plugin) |
| 1.52 | [ ] | Verify CHANGELOG emoji format | Emoji sections match semantic-release | - | [Discovery 12](#-high-discovery-12-conventional-commits-with-emoji-changelog-sections) |
| 1.53 | [ ] | Verify version bump | 1.0.0 → 1.1.0 (minor for feat:) | - | Correct semver |
| 1.54 | [ ] | Merge Release PR | PR merged | - | Triggers release |
| 1.55 | [ ] | Verify GitHub Release created | Release at /releases/tag/vX.Y.Z | - | Release created |
| 1.56 | [ ] | Verify release tag created | Git tag vX.Y.Z exists | - | Tag created |
| 1.57 | [ ] | Verify publish workflow triggered | Workflow run visible in Actions | - | [Discovery 15](#-high-discovery-15-artifact-publishing-timing---separate-onrelease-workflow) |
| 1.58 | [ ] | Verify VSIX uploaded | vsc-bridge-X.Y.Z.vsix attached | - | Artifact present |
| 1.59 | [ ] | Verify offline bundle uploaded | vsc-bridge-offline-X.Y.Z.zip attached | - | Artifact present |
| 1.60 | [ ] | Download and inspect bundle | ZIP has 5 files: VSIX, tarball, 2 installers, README | - | [Discovery 08](#-critical-discovery-08-artifact-upload-two-file-contract) |
| 1.61 | [ ] | Verify workflow outputs | new-release-published=true, new-release-version=vX.Y.Z | - | [Discovery 06](#-critical-discovery-06-workflow-output-contract-preservation) |
| 1.62 | [ ] | Verify no branch protection violations | No "branch protection" errors in logs | - | App bypass works |
| 1.63 | [ ] | Test tag recovery workflow | Manual trigger completes without errors | - | Recovery works |
| 1.64 | [ ] | Verify monorepo version sync | All 3 package.json files same version | - | Sync works |
| 1.65 | [ ] | Test breaking change handling | BREAKING CHANGE triggers major bump | - | [Discovery 11](#-high-discovery-11-pre-10-breaking-change-versioning-now-obsolete) |
| 1.65a | [ ] | VALIDATION GATE: Confirm all tests passed | ALL tasks 1.47-1.65 show ✅ status AND detailed validation checklist (lines 1199+) shows zero failures | - | **BLOCKING**: If ANY failures, execute rollback (task 1.65b) |
| 1.65b | [ ] | **ROLLBACK PROCEDURE** (if validation fails) | (1) Delete test release: `gh release delete v1.1.0 --yes`, (2) Delete test tag: `git tag -d v1.1.0 && git push --delete origin v1.1.0`, (3) Close Release PR: `gh pr close <pr-number> --delete-branch`, (4) Reset to baseline: `git reset --hard $(cat /tmp/pre-test-sha.txt)`, (5) Document what failed in validation/failure-report.md, (6) Fix issues before retrying | - | **ONLY run if validation fails** |
| **Semantic-Release Removal** (Only after validation passes) |
| 1.66 | [ ] | Delete .releaserc.json | File deleted | - | Config removed |
| 1.67 | [ ] | Delete scripts/semrel-prepare.mjs | File deleted | - | Logic migrated |
| 1.68 | [ ] | Remove semantic-release from package.json | Removed from devDependencies | - | |
| 1.69 | [ ] | Remove @semantic-release/* packages | 7 packages removed | - | All plugins |
| 1.70 | [ ] | Remove semantic-release script | Script removed from package.json | - | |
| 1.71 | [ ] | Delete .github/workflows/build-and-release.yml | Workflow deleted | - | Replaced |
| 1.72 | [ ] | Run npm install | package-lock.json updated | - | Clean deps |
| 1.73 | [ ] | Verify no semantic-release references | `grep -r "semantic-release"` clean | - | Complete removal |
| **Documentation** |
| 1.74 | [ ] | Create docs/how/releases/ directory | Directory exists | - | New docs location |
| 1.75 | [ ] | Update README.md | Brief release automation section + link | - | Hybrid approach |
| 1.76 | [ ] | Create docs/how/releases/1-overview.md | Introduction, how release-please works | - | Overview |
| 1.77 | [ ] | Create docs/how/releases/2-github-app-setup.md | Step-by-step app creation, key rotation | - | [Discovery 14](#-high-discovery-14-github-app-key-rotation-lifecycle-management) |
| 1.78 | [ ] | Create docs/how/releases/3-release-please-configuration.md | Config files explanation | - | Reference |
| 1.79 | [ ] | Create docs/how/releases/4-release-workflow.md | How Release PRs work, merge process | - | User guide |
| 1.80 | [ ] | Create docs/how/releases/5-troubleshooting.md | Common issues + recovery | - | [Discovery 07](#-critical-discovery-07-failed-release-tag-recovery---idempotent-tag-creation) |
| 1.81 | [ ] | Document BREAKING CHANGE format | Uppercase or feat!: syntax | - | [Discovery 22](#-medium-discovery-22-breaking-change-case-sensitivity) |
| 1.82 | [ ] | Document PR title requirements | If squash merge enabled | - | [Discovery 13](#-high-discovery-13-squash-merge-pr-title-requirements) |
| 1.83 | [ ] | Document major version bump behavior | Breaking → major (1.x → 2.x) | - | Standard semver |
| 1.84 | [ ] | Review all documentation | Peer review, no broken links | - | Quality check |
| **Final Validation** |
| 1.85 | [ ] | Validate all checklists complete | Workflow, Content, Artifact, Security, Edge Cases | - | See detailed checklist below |
| 1.86 | [ ] | Create validation report | Screenshots, artifact checksums, test results | - | Complete documentation |
| 1.87 | [ ] | Train team on Release PR process | Team understands how to merge Release PRs | - | Knowledge transfer |

### Detailed Validation Checklist

#### Workflow Execution
- [ ] release-please workflow runs on push to main
- [ ] GitHub App token generation succeeds
- [ ] Release PR created with correct title
- [ ] Release PR updates all required files
- [ ] Merging Release PR triggers release creation
- [ ] publish-on-release workflow triggers on release
- [ ] Artifacts build successfully
- [ ] Artifacts upload successfully

#### Content Validation
- [ ] CHANGELOG format matches semantic-release (emojis, sections)
- [ ] Version bump follows conventional commits spec
- [ ] All 3 package.json files synchronized
- [ ] package-lock.json updated correctly
- [ ] Git history clean (no unwanted commits)

#### Artifact Validation
- [ ] VSIX file exists and is downloadable
- [ ] VSIX filename: vsc-bridge-X.Y.Z.vsix
- [ ] Offline bundle exists and is downloadable
- [ ] Offline bundle filename: vsc-bridge-offline-X.Y.Z.zip
- [ ] Offline bundle contains 5 files (VSIX, tarball, 2 installers, README)
- [ ] README.txt has correct version substitution

#### Security & Permissions
- [ ] No branch protection violations
- [ ] GitHub App token works correctly
- [ ] No PAT dependency (App token only)
- [ ] Workflow outputs preserve contract

#### Edge Cases
- [ ] Tag recovery workflow works for untagged releases
- [ ] Breaking change triggers major bump (post-1.0)
- [ ] Manual workflow dispatch works

### Acceptance Criteria

**Phase 1 is complete when ALL of the following are true**:

- [ ] **All 89 tasks (1.1-1.87) show ✅ status** - Every task in the task table completed successfully
- [ ] **Validation gate passed (task 1.65a)** - All testing tasks (1.47-1.65) passed with zero failures
- [ ] **Detailed validation checklist passed (lines 1199-1232)** - All 5 validation categories (Workflow Execution, Content Validation, Artifact Validation, Security & Permissions, Edge Cases) show ✅ for every item
- [ ] **Validation report created** - Comprehensive report documented at `/workspaces/vscode-bridge/docs/plans/28-release-please-integration/validation/final-report.md` with screenshots, test results, and artifact checksums
- [ ] **Semantic-release completely removed** - Tasks 1.66-1.73 completed, `grep -r "semantic-release" --exclude-dir=docs --exclude='*.md' .` returns no results
- [ ] **Build verification** - `just build` succeeds after semantic-release removal
- [ ] **Team handover complete** - Task 1.87 completed, team understands Release PR merge process

**Note**: Individual task success criteria define HOW to verify each step. This section defines WHEN the entire phase is done.

---
## Cross-Cutting Concerns

### Security Considerations

**Input Validation**:
- Conventional commit format validated by release-please parser
- PR title validation (if using squash merge) via action-semantic-pull-request
- JSON configuration files validated via jq before committing

**Authentication/Authorization**:
- GitHub App with minimal permissions (contents:write, pull-requests:write)
- Private key stored in GitHub Secrets (encrypted at rest)
- No PAT dependency eliminates personal token security risks
- App added to branch protection bypass list (auditable)

**Sensitive Data Handling**:
- GitHub App private key never committed to git
- Secrets accessed only via ${{ secrets.* }} syntax in workflows
- Key rotation procedure (90-day schedule) documented
- No credentials in workflow logs (masked by GitHub Actions)

### Observability

**Logging Strategy**:
- GitHub Actions workflow logs capture all execution steps
- release-please action logs show PR creation, version calculation, changelog generation
- publish-on-release workflow logs show build, packaging, upload steps
- Tag recovery workflow logs show untagged release detection and recovery

**Metrics to Capture**:
- Release frequency (via GitHub Releases API)
- Release PR merge time (PR created → merged)
- Artifact build success rate (publish-on-release workflow)
- Tag recovery invocations (how often recovery needed)

**Error Tracking**:
- Workflow failures visible in GitHub Actions UI
- Email notifications for workflow failures (GitHub settings)
- Tag recovery workflow daily checks for untagged releases
- Manual workflow dispatch for immediate recovery

### Documentation

**Location**: Hybrid (README.md + docs/how/releases/)

**Content Structure**:
- **README.md**: Brief mention of automated releases, link to docs/how/releases/
- **docs/how/releases/1-overview.md**: Introduction, how release-please works
- **docs/how/releases/2-github-app-setup.md**: Step-by-step app creation and installation
- **docs/how/releases/3-release-please-configuration.md**: Config file reference
- **docs/how/releases/4-release-workflow.md**: Release PR workflow, merge process
- **docs/how/releases/5-troubleshooting.md**: Common issues and recovery procedures

**Update/Maintenance**:
- Update when workflow structure changes
- Update when GitHub App permissions change
- Update when new troubleshooting cases discovered
- Review after each release-please version upgrade

**Target Audience**:
- Repository maintainers (primary)
- Contributors setting up forks
- Users understanding release process

**Accessibility**:
- Markdown format (readable in GitHub, VS Code, browser)
- Step-by-step instructions with examples
- Troubleshooting guide with symptoms, causes, solutions
- Links to official release-please documentation

---

## Progress Tracking

### Phase Completion Checklist

- [ ] Phase 1: Release-Please Migration - **NOT STARTED**

### Overall Progress
- **Completed Phases**: 0/1
- **Current Phase**: Phase 1 (Release-Please Migration)
- **Blocked**: No
- **Estimated Completion**: TBD (depends on validation and testing results)

### STOP Rule

**IMPORTANT**: This plan must be validated before implementation begins.

**Next Step**: Run `/plan-4-complete-the-plan` to validate:
- All phases have clear deliverables
- All tasks have measurable success criteria
- All critical discoveries are addressed
- Testing strategy is appropriate
- Documentation strategy is complete

**Only proceed to** `/plan-5-phase-tasks-and-brief` **after validation passes.**

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by `/plan-6a-update-progress`.

**Footnote Numbering Authority**: `/plan-6a-update-progress` is the **single source of truth** for footnote numbering across the entire plan.

**Initial State** (before implementation begins):

[^1]: [To be added during implementation via plan-6a]

[^2]: [To be added during implementation via plan-6a]

[^3]: [To be added during implementation via plan-6a]

---

## Appendix: Plan Metadata

**Total Phases**: 1
**Total Tasks**: 89
**Critical Discoveries**: 8
**High-Impact Discoveries**: 8
**Medium-Impact Discoveries**: 7
**Low-Impact Discoveries**: 1

**Configuration Files Created**:
- `.release-please-manifest.json`
- `release-please-config.json`
- `.github/workflows/release-please.yml`
- `.github/workflows/release-tag-verification.yml`
- `.github/workflows/publish-on-release.yml`
- `docs/how/releases/1-overview.md`
- `docs/how/releases/2-github-app-setup.md`
- `docs/how/releases/3-release-please-configuration.md`
- `docs/how/releases/4-release-workflow.md`
- `docs/how/releases/5-troubleshooting.md`

**Files Deleted**:
- `.releaserc.json`
- `scripts/semrel-prepare.mjs`
- `.github/workflows/build-and-release.yml`

**Dependencies Removed**:
- `semantic-release`
- `@semantic-release/changelog`
- `@semantic-release/commit-analyzer`
- `@semantic-release/exec`
- `@semantic-release/git`
- `@semantic-release/github`
- `@semantic-release/npm`
- `@semantic-release/release-notes-generator`

**Validation Complete**: ❌ (Run `/plan-4-complete-the-plan`)
