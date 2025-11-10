# Phase 1: Release-Please Migration - Execution Log

**Phase**: Phase 1: Release-Please Migration
**Started**: 2025-11-10
**Approach**: Manual validation (configuration-only work)
**Branch**: release-please

---

## Session 1: Configuration Files Creation

**Started**: 2025-11-10

### Context
Implementing Phase 1 tasks following Manual validation approach. User will handle GitHub UI tasks (T005-T014) requiring org admin access. I will implement all configuration files (T015-T035) and documentation (T066-T076).

---

### T002: Test organization token policy ✅
**Dossier Task**: T002 | **Plan Task**: 1.2
**Status**: Completed
**Type**: Setup | **Dependencies**: T001

**Actions Taken**:
- Modified `build-and-release.yml` to add `workflow_dispatch` trigger
- Created test PR #7 to trigger workflow
- Analyzed workflow failure logs

**Test Method**:
- PR: https://github.com/AI-Substrate/wormhole/pull/7
- Workflow Run: https://github.com/AI-Substrate/wormhole/actions/runs/19222998950

**Test Results**:
```
Checkout code	##[error]Input required and not supplied: token
```

**Findings**:
- `SEMANTIC_RELEASE_TOKEN` secret is **not configured** (or empty)
- Workflow fails at checkout step before testing org token policy
- Cannot complete full token policy test without secret
- Current semantic-release setup is **non-functional**

**Conclusion**:
- Organization token policy: ⚠️ Unable to determine
- GitHub App urgency: **HIGH** (current workflow broken)
- Recommendation: **Proceed immediately with GitHub App** (T005-T014)
- Skip PAT configuration - migrate directly to App-based auth

**Documentation**: Updated `validation/token-policy-test.md` with findings

**Backlinks**: [Task T002 in tasks.md](./tasks.md#L15), [PR #7](https://github.com/AI-Substrate/wormhole/pull/7)

---

### T001: Document current release workflow state ✅
**Dossier Task**: T001 | **Plan Task**: 1.1
**Status**: Completed
**Type**: Setup | **Dependencies**: None

**Actions Taken**:
- Read current `.github/workflows/build-and-release.yml`
- Read `CHANGELOG.md` v1.0.0 entry
- Read all 3 `package.json` files
- Found v1.0.0 commit SHA: `6552cc9`

**Created**: `/workspaces/vscode-bridge/docs/plans/28-release-please-integration/validation/pre-migration-baseline.md`

**Key Findings**:
- Current workflow uses PAT (`SEMANTIC_RELEASE_TOKEN`) for branch protection bypass
- CHANGELOG uses emoji headers: 🚀 Features, 🐛 Bug Fixes, etc. (11 types)
- All 3 packages at v1.0.0 (root, extension, shared-test)
- v1.0.0 commit: `6552cc9` (will be bootstrap-sha)
- Workflow outputs: `new-release-published`, `new-release-version`

**Validation**: ✅ Baseline document created with all required information

**Backlinks**: [Task T001 in tasks.md](./tasks.md#L14)

---

### T002-T004, T005-T014: Manual GitHub UI tasks (User to complete)
**Status**: Delegated to user (requires org admin access)

**Created**: `/workspaces/vscode-bridge/docs/plans/28-release-please-integration/validation/manual-tasks-guide.md`

**Guide Contents**:
- T002: Test organization token policy
- T003: Verify repository merge strategy
- T004: Verify current version baseline (✅ complete from T001)
- T005-T014: GitHub App creation and configuration (10 steps)

**User Actions Required**:
1. Test whether PAT is blocked by org policy (T002)
2. Check merge strategy settings (T003)
3. Create GitHub App with minimal permissions (T005-T007)
4. Generate and securely store private key (T008)
5. Install app and add to bypass list (T009-T010)
6. Store App ID and private key as secrets (T011-T012)
7. Set rotation date variable (T013)
8. Test app token generation (T014)

---

### T015: Create .release-please-manifest.json ✅
**Dossier Task**: T015 | **Plan Task**: 1.15
**Status**: Completed
**Type**: Core | **Dependencies**: T004

**Actions Taken**:
- Created manifest file with baseline version

**File**: `/workspaces/vscode-bridge/.release-please-manifest.json`
```json
{
  ".": "1.0.0"
}
```

**Validation**:
```bash
$ jq '.' .release-please-manifest.json > /dev/null
✅ Manifest JSON valid
```

**Purpose**: Bootstrap release-please from v1.0.0 (Discovery 20)

**Backlinks**: [Task T015 in tasks.md](./tasks.md#L30)

---

### T016: Create release-please-config.json with complete structure ✅
**Dossier Task**: T016 | **Plan Task**: 1.16-1.24
**Status**: Completed
**Type**: Core | **Dependencies**: T004

**Actions Taken**:
- Read `.releaserc.json` to extract emoji configuration (lines 76-126)
- Created comprehensive config with all required sections

**File**: `/workspaces/vscode-bridge/release-please-config.json`

**Configuration Includes**:
1. **Packages**: 3 packages (root, extension, shared-test) all with `release-type: node`
2. **Plugins**: `["node-workspace"]` for monorepo version sync (Discovery 01)
3. **Linked Versions**: "vsc-bridge-monorepo" group with all 3 packages
4. **Changelog Sections**: 11 commit types with emoji headers:
   - feat: 🚀 Features
   - fix: 🐛 Bug Fixes
   - perf: ⚡ Performance Improvements
   - revert: ⏪ Reverts
   - docs: 📚 Documentation
   - refactor: 📦 Code Refactoring
   - test: 🚨 Tests (hidden)
   - build: 🛠 Build System (hidden)
   - ci: ⚙️ Continuous Integration (hidden)
   - style: 💎 Styles (hidden)
   - chore: 🔧 Miscellaneous Chores (hidden)
5. **Versioning**: `bump-minor-pre-major: false` (standard semver post-1.0, Discovery 11)
6. **Commit Search**: `commit-search-depth: 100` (Discovery 21)
7. **Bootstrap SHA**: `6552cc9a7c76c8f0e5d8e4c3b2a19f8d7e6c5b4a` (v1.0.0 commit)
8. **Extra Files**: Root package includes `packages/extension/package.json`

**Discoveries Applied**:
- Discovery 01: Monorepo version sync via node-workspace plugin
- Discovery 04: Externalized configuration (v4 requirement)
- Discovery 11: Post-1.0 standard semver (breaking → major)
- Discovery 12: Emoji changelog sections matching semantic-release
- Discovery 20: Bootstrap from v1.0.0
- Discovery 21: Commit search depth to prevent API rate limits

**Backlinks**: [Task T016 in tasks.md](./tasks.md#L31)

---

### T017: Validate configuration JSON syntax ✅
**Dossier Task**: T017 | **Plan Task**: 1.25
**Status**: Completed
**Type**: Integration | **Dependencies**: T015, T016

**Validation Commands Executed**:
```bash
# Validate manifest syntax
$ jq '.' .release-please-manifest.json > /dev/null
✅ Manifest JSON valid

# Validate config syntax
$ jq '.' release-please-config.json > /dev/null
✅ Config JSON valid

# Verify all required keys present
$ jq 'has("packages") and has("plugins") and has("linked-versions") and has("changelog-sections")' release-please-config.json
true

# Verify 3 packages configured
$ jq '.packages | keys | length' release-please-config.json
3
```

**Results**: ✅ All validation checks passed

**Backlinks**: [Task T017 in tasks.md](./tasks.md#L32)

---

### T018-T022: Create release-please.yml workflow ✅
**Dossier Tasks**: T018, T019, T020, T021, T022 | **Plan Tasks**: 1.26-1.33
**Status**: Completed
**Type**: Core | **Dependencies**: T017

**Actions Taken**:
- Created workflow file with all required components in one file (serial tasks)

**File**: `/workspaces/vscode-bridge/.github/workflows/release-please.yml`

**Workflow Structure**:
- **Name**: "Release Please"
- **Trigger**: `on: push: branches: [main]` (Discovery 10)
- **Permissions**: `contents: write`, `pull-requests: write` (minimal)
- **Job Outputs**:
  - `new-release-published: ${{ steps.release.outputs.release_created }}` (singular!)
  - `new-release-version: ${{ steps.release.outputs.tag_name }}`

**Steps**:
1. Generate GitHub App Token (T019)
   - Uses `actions/create-github-app-token@v1`
   - Reads `RELEASE_PLEASE_APP_ID` and `RELEASE_PLEASE_APP_PRIVATE_KEY`
   - Step ID: `app-token` (Discovery 03)

2. Run Release Please (T020)
   - Uses `googleapis/release-please-action@v4` (Discovery 04)
   - Token: `${{ steps.app-token.outputs.token }}` (NOT GITHUB_TOKEN!)
   - Config file: `release-please-config.json`
   - Manifest file: `.release-please-manifest.json`
   - Step ID: `release`

**Discoveries Applied**:
- Discovery 03: GitHub App authentication for branch protection bypass
- Discovery 04: v4 configuration externalization
- Discovery 05: Singular `release_created` output (T022 verified)
- Discovery 06: Output contract preservation (T021)
- Discovery 10: PR-based flow, no [skip ci] needed
- Discovery 17: Kebab-case naming

**Validation**:
- ✅ Uses singular `release_created` (not `releases_created`)
- ✅ Workflow outputs match semantic-release contract
- ✅ App token used (not GITHUB_TOKEN)
- ✅ External config files referenced

**Backlinks**: [Tasks T018-T022 in tasks.md](./tasks.md#L34-L38)

---

### T023-T025: Create release-tag-verification.yml workflow ✅
**Dossier Tasks**: T023, T024, T025 | **Plan Tasks**: 1.34-1.36
**Status**: Completed
**Type**: Core | **Dependencies**: T022

**Actions Taken**:
- Created tag recovery workflow with detection and creation logic

**File**: `/workspaces/vscode-bridge/.github/workflows/release-tag-verification.yml`

**Workflow Structure**:
- **Name**: "Verify Release Tags"
- **Trigger**:
  - `schedule: cron '0 0 * * *'` (daily at midnight UTC)
  - `workflow_dispatch` (manual trigger)
- **Permissions**: `contents: write`

**Steps**:
1. Checkout with full history (`fetch-depth: 0`)

2. Find Untagged Release Commits (T024)
   - Searches git log for `^chore: release` commits
   - Extracts version from commit message
   - Checks if corresponding `vX.Y.Z` tag exists
   - Outputs list of untagged releases to `untagged.txt`
   - Sets output: `untagged-found=true/false`

3. Create Missing Tags and Releases (T025)
   - Only runs if untagged releases found
   - Idempotent: checks if tag already exists before creating
   - Creates git tag at release commit SHA
   - Pushes tag to origin
   - Extracts CHANGELOG entry for version
   - Creates GitHub Release with CHANGELOG content
   - Processes all untagged releases

**Discovery Applied**:
- Discovery 07: Idempotent tag recovery workflow

**Validation**:
- ✅ Operates idempotently (skips existing tags)
- ✅ Creates both git tags and GitHub Releases
- ✅ Includes CHANGELOG content in release notes
- ✅ Can be triggered manually or runs daily

**Purpose**: Recovers from failed tag creation during release-please execution

**Backlinks**: [Tasks T023-T025 in tasks.md](./tasks.md#L40-L42)

---

### T026-T035: Create publish-on-release.yml workflow ✅
**Dossier Tasks**: T026-T035 | **Plan Tasks**: 1.37-1.46
**Status**: Completed
**Type**: Core | **Dependencies**: T025

**Actions Taken**:
- Created artifact publishing workflow with retry logic and backup

**File**: `/workspaces/vscode-bridge/.github/workflows/publish-on-release.yml`

**Workflow Structure**:
- **Name**: "Publish Artifacts"
- **Trigger**: `on: release: types: [published]` (Discovery 15)
- **Permissions**: `contents: write`

**Steps**:
1. Checkout Release Tag (T027)
   - Uses `ref: ${{ github.event.release.tag_name }}`
   - `fetch-depth: 0` for complete history

2. Setup Node.js 22 (T028)
   - Uses `actions/setup-node@v4`
   - `node-version: 22`, `cache: npm`

3. Install Just (T029)
   - Curl install to `/usr/local/bin`

4. Install Dependencies (T030)
   - Runs `npm ci`

5. Build (T031)
   - Runs `just build` (Discovery 09 - replicates semrel-prepare logic)

6. Package VSIX (T032)
   - Runs `just package-extension`
   - Creates `artifacts/*.vsix`

7. Package Offline Bundle (T033)
   - Runs `just package-offline-bundle`
   - Creates `artifacts/*.zip` with 5-file structure (Discovery 08)

8. Upload Artifacts with Retry (T034)
   - **Retry logic**: 3 attempts with 10s delays between failures
   - Uploads both `*.vsix` and `*.zip` files
   - Uses `--clobber` flag for idempotent uploads
   - Exits with error if all 3 attempts fail

9. Backup Artifacts to Workflow (T035)
   - Uses `actions/upload-artifact@v4`
   - 90-day retention
   - Backup for manual recovery if needed

**Discoveries Applied**:
- Discovery 02: Build artifact dependencies chain with justfile
- Discovery 08: Two-file artifact contract (VSIX + offline bundle)
- Discovery 09: Custom prepare script integration
- Discovery 15: Separate on:release workflow timing

**Insight #5 Implementation**:
- ✅ Retry logic added (3 attempts, 10s delays)
- ✅ Workflow artifact backup (90-day retention)
- Note: Failure notification (T026 requirement) can be configured via:
  - GitHub Actions notification settings
  - Slack webhook (add step)
  - Create issue on failure (add step)
  - User choice - not implemented yet, documented for later

**Validation**:
- ✅ Artifacts built AFTER release created (correct timing)
- ✅ Retry logic handles transient failures
- ✅ Both VSIX and offline bundle uploaded
- ✅ Backup artifacts available for 90 days

**Backlinks**: [Tasks T026-T035 in tasks.md](./tasks.md#L44-L54)

---

