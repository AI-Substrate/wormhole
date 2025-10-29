# Automated VSIX Releases with Semantic Versioning

## Summary

Automate the complete release workflow for the VSC-Bridge extension, eliminating manual version management and package distribution. The system will automatically determine the next version number based on commit messages following the Conventional Commits standard, build the extension, package it as a VSIX file, and publish it as a GitHub Release with the VSIX attached. This ensures consistency, reduces human error, and provides a clear audit trail of all releases.

**Why**: Manual versioning is error-prone and time-consuming. Developers must remember to bump versions, update changelogs, build packages, and create releases—all of which can be automated. Semantic versioning based on commit messages ensures version numbers accurately reflect the nature of changes (patch, minor, or major) and provides predictability for users.

## Branch & Release Strategy

The release system supports three types of branches with different release behaviors:

### Main Branch (Stable Releases)
- **Branch**: `main`
- **Release Type**: Stable versions (e.g., `1.0.0`, `1.1.0`, `2.0.0`)
- **Trigger**: Merge to main (squash-merge from feature/develop branches)
- **Version Calculation**: Based on conventional commit types since last stable release
  - `fix:` → patch (1.0.0 → 1.0.1)
  - `feat:` → minor (1.0.0 → 1.1.0)
  - `feat!:` or `BREAKING CHANGE:` → major (1.0.0 → 2.0.0)
- **Distribution**: GitHub Release with VSIX attached

### Develop Branch (Beta Pre-releases)
- **Branch**: `develop`
- **Release Type**: Beta pre-releases (e.g., `1.1.0-beta.1`, `1.1.0-beta.2`)
- **Trigger**: Merge to develop
- **Version Calculation**: Base version from commits + `-beta.N` suffix (N increments)
- **Distribution**: GitHub Release (pre-release flag set) with VSIX attached
- **Promotion to Stable**: When develop merges to main, semantic-release calculates stable version automatically (e.g., `1.1.0-beta.2` on develop → merge to main → `1.1.0` stable release)

### Feature Branches (No Releases)
- **Branch Pattern**: `feat/*` or `issue-*-phase-*`
- **Release Type**: None (no automatic releases)
- **Testing**: Local builds only; use `just package-extension` for local testing
- **Purpose**: Development and iteration; merge to develop for beta releases or main for stable releases

### Non-Release Commits
Commits with these types do NOT trigger releases:
- `docs:` - Documentation only
- `ci:` - CI configuration changes
- `chore:` - Maintenance tasks
- `test:` - Test code changes
- `build:` - Build system changes
- `style:` - Code formatting (no functional changes)

## Goals

- **Eliminate manual versioning**: Version numbers are automatically determined from commit messages, removing the need for developers to manually update `package.json` files
- **Ensure version consistency**: All package.json files across the monorepo (root and packages/extension/) maintain synchronized version numbers
- **Automate VSIX packaging**: Extension is automatically built and packaged into a VSIX file with the correct version embedded
- **Publish to GitHub Releases**: Each release is published to GitHub with a detailed changelog and the VSIX file attached as a downloadable asset
- **Maintain accurate changelog**: Automatically generate and update CHANGELOG.md based on commit messages, with release notes published without manual review
- **Enforce commit standards**: Validate that pull request titles follow Conventional Commits format to ensure proper versioning
- **Support pre-release channels**: Enable alpha (feature branches) and beta (develop branch) pre-release versions for testing before stable releases
- **Provide release transparency**: Every release includes clear notes about what changed, linking back to issues and pull requests

## Non-Goals

- **VS Code Marketplace publishing**: Initial implementation only publishes to GitHub Releases; marketplace publishing is a future enhancement
- **npm registry publishing**: The extension is not published to npm, only distributed as VSIX
- **Manual version overrides**: System does not support manual version bumps; all versioning is commit-driven. Emergency hotfixes use expedited PR workflow, not bypass mechanisms
- **Independent package versioning**: All packages in the monorepo share the same version number (not independently versioned). This is intentional because extension, CLI, and MCP server are tightly coupled and must remain version-compatible
- **Support for non-squash merges**: Implementation assumes squash-and-merge is the standard PR merge strategy
- **Automated rollback**: Does not include automatic rollback of failed releases. Broken releases are fixed by publishing new patch versions (forward-only, never revert)

## Acceptance Criteria

### AC1: Patch Release from Bug Fix
**Given** the current version is 0.0.1
**When** a PR titled "fix: correct breakpoint handling" is merged to main
**Then** version 0.0.2 is released with the bug fix in the changelog

### AC2: Minor Release from New Feature
**Given** the current version is 0.0.2
**When** a PR titled "feat: add variable inspection" is merged to main
**Then** version 0.1.0 is released with the feature in the changelog

### AC3: Major Release from Breaking Change
**Given** the current version is 0.1.0
**When** a PR titled "feat!: redesign debug API" or containing "BREAKING CHANGE:" is merged to main
**Then** version 1.0.0 is released with breaking changes highlighted in the changelog

### AC4: Beta Pre-release on Develop Branch
**Given** the develop branch exists
**When** a PR is merged to develop
**Then** pre-release versions like "0.2.0-beta.1", "0.2.0-beta.2" are created for integration testing

### AC5: VSIX Attachment
**Given** a release is triggered
**When** the release process completes
**Then** a VSIX file named "vsc-bridge-{version}.vsix" is attached to the GitHub Release

### AC6: Version Synchronization
**Given** a release is created
**When** the version is bumped
**Then** all package.json files (root and packages/extension/) contain the same version number

### AC11: Obsolete Code Cleanup
**Given** the mcp-server/ directory exists but is obsolete
**When** implementing the release automation
**Then** mcp-server/ is removed from the repository and workspaces configuration

### AC7: PR Title Validation
**Given** a pull request is opened
**When** the PR title does not follow Conventional Commits format (e.g., "update files")
**Then** the PR is blocked from merging with a clear error message explaining the required format

### AC8: Changelog Generation
**Given** multiple commits of different types (feat, fix, perf)
**When** a release is created
**Then** CHANGELOG.md is updated with sections for Features, Bug Fixes, and Performance Improvements

### AC9: No Release for Non-Releasable Commits
**Given** only documentation or CI config changes have been made (docs:, ci:, chore:)
**When** commits are pushed to main
**Then** no release is created (version remains unchanged)

### AC10: VSIX Contains Correct Version
**Given** a release with version 0.2.0 is created
**When** the VSIX is downloaded and inspected
**Then** the package.json inside the VSIX shows version "0.2.0" (not the old version)

## Risks & Assumptions

### Risks

1. **Incorrect commit messages trigger wrong versions**: If a developer uses "feat:" for a bug fix, a minor version bump occurs instead of a patch
   - Mitigation: PR title validation prevents merging incorrectly formatted commits

2. **Build failures during release leave repo in inconsistent state**: If the build fails after version is bumped but before VSIX is created
   - Mitigation: Build and package occur in atomic prepare step; version commit only happens after successful build

3. **Rapid merges cause version conflicts**: Multiple PRs merging quickly could theoretically conflict on version numbers
   - Mitigation: Semantic-release handles this via git tags and atomic commits; sequential processing prevents conflicts

4. **Protected branch restrictions block automated commits**: GitHub protected branch rules might prevent the release bot from committing version bumps
   - Mitigation: Configure branch protection to allow GitHub Actions bot to push [skip ci] commits

5. **VSIX packaging fails silently**: Build succeeds but VSIX is corrupted or incomplete
   - Mitigation: Validate VSIX structure as part of release process; test installs in CI

### Assumptions

- **Squash-merge is standard**: All PRs are merged using squash-merge, so PR title becomes the commit message on main
- **Team adopts Conventional Commits**: Developers will learn and use the Conventional Commits format for PR titles
- **Node.js 22 environment**: CI runs on Node.js 22, which is supported by all build tools
- **Just build tool available**: The `just` build tool is installed and configured in CI
- **GitHub token has sufficient permissions**: The default GITHUB_TOKEN has write access to contents, issues, and pull requests

## Testing Strategy

**Approach**: Manual Only

**Rationale**: This is primarily configuration and workflow setup (semantic-release config, GitHub Actions workflows, build scripts). The heavy lifting is done by well-tested tools (semantic-release, vsce, just). Manual verification through dry-runs and controlled test releases provides sufficient validation.

**Verification Steps**:
1. Local dry-run: `npx semantic-release --dry-run --no-ci --debug` to verify version calculation
2. Test PR: Create test PR with conventional commit title, verify PR title validation workflow blocks invalid titles
3. Test release: Merge a test PR to main, verify full release workflow (version bump, build, VSIX package, GitHub Release)
4. VSIX validation: Download and inspect VSIX from test release, verify version is correct
5. Changelog verification: Review generated CHANGELOG.md for correct formatting and content

**Focus Areas**: End-to-end workflow validation, VSIX integrity, version synchronization across package.json files

**Excluded**: Unit tests for individual scripts or configuration files

## Documentation Strategy

**Location**: docs/how/ only

**Rationale**: This is an internal development workflow feature that requires detailed explanation for troubleshooting and understanding the automation. Developers need comprehensive guides for conventional commits, release workflow, and handling edge cases.

**Content to Include**:
- Conventional Commits guide with examples for each type (feat, fix, breaking changes)
- Release workflow diagram and step-by-step explanation
- PR title validation rules and error resolution
- Troubleshooting failed releases
- Emergency hotfix procedures (if supported)
- Dry-run testing instructions for release workflow changes

**Target Audience**: VSC-Bridge developers and maintainers

**Maintenance**: Update documentation when release workflow changes or new edge cases are discovered

## Clarifications Summary

All critical ambiguities have been resolved. The feature is fully specified and ready for architecture planning.

| Topic | Decision | Impact |
|-------|----------|--------|
| Testing Strategy | Manual Only (dry-run + test releases) | No automated tests; manual verification sufficient for config/workflow |
| Documentation | docs/how/ only | Detailed guides for conventional commits, troubleshooting, workflow |
| Emergency Hotfixes | Expedited PR (no bypass) | Maintain audit trail; fast-track review + merge |
| Rollback Strategy | Forward-only (new patch) | Never revert; always publish fix as new version |
| Pre-release Promotion | Semantic-release default | Automatic version calculation when merging develop → main |
| Obsolete Code | Remove mcp-server/ now | Clean up dead code before implementing versioning |
| Package Versioning | Shared version forever | All packages tightly coupled; single version across repo |
| Release Notes | Fully automated | No manual review; trust conventional commits |
| Notifications | GitHub only | Use GitHub release events; no Slack/issue notifications |

### Session 2025-10-19

**Q1: Testing Strategy**
- **Answer**: Manual Only (Option D)
- **Rationale**: Configuration and workflow setup delegated to well-tested tools; manual verification sufficient

**Q2: Documentation Strategy**
- **Answer**: docs/how/ only (Option B)
- **Rationale**: Internal development workflow requiring detailed troubleshooting guides

**Q3: Emergency Hotfix Process**
- **Answer**: No bypass - use expedited PR (Option A)
- **Rationale**: Create PR with `fix:` title, fast-track review, squash-merge triggers automated release. Maintains audit trail and consistency.

**Q4: Rollback Strategy**
- **Answer**: Publish new patch release (Option A)
- **Rationale**: Only forward, never back. Create `fix:` PR addressing the issue, merge triggers new patch version. Clean history, no reverts or deletions.

**Q5: Pre-release Promotion**
- **Answer**: Semantic-release default behavior (Option A)
- **Rationale**: When develop merges to main, semantic-release automatically calculates the correct stable version from commit history. No manual intervention needed; the `-beta` suffix only exists on develop branch releases.

**Q6: Obsolete mcp-server/ Directory**
- **Answer**: Remove mcp-server/ now (Option C)
- **Rationale**: The mcp-server/ directory is obsolete (replaced by CLI-integrated MCP). Delete it as part of this plan to clean up dead code before implementing versioning.
- **Packages to Version**: root + packages/extension/ only (after mcp-server/ removal)

**Q7: Future Package Versioning Strategy**
- **Answer**: Keep shared version forever (Option A)
- **Rationale**: All packages (extension VSIX, npx CLI tool, MCP server) are tightly coupled and must be version-compatible. Shared versioning ensures users always get matching versions across components.
- **Scope**: Applies to all current and future packages in the monorepo (extension, CLI/npx installation per Plan 16)

**Q8: Release Notes & Notifications**
- **Answer**: Fully automated (Option A)
- **Rationale**: Trust in conventional commits to generate accurate release notes automatically. Fast releases without manual review bottlenecks.
- **Notifications**: GitHub notifications only (release events). No special Slack/issue notifications needed.

## Open Questions

**Remaining questions deferred to implementation:**

1. **Version starting point**: Confirmed to start at 0.0.1 (per earlier user decision)

2. **Dry-run testing**: Manual verification steps documented in Testing Strategy section (local dry-run with `--dry-run --no-ci --debug` flag)
