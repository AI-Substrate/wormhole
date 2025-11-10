# Manual Tasks Guide for Release-Please Migration

**Purpose**: Step-by-step instructions for GitHub UI tasks requiring organizational admin access

**Tasks Covered**: T002-T004 (validation), T005-T014 (GitHub App setup)

---

## Part 1: Pre-Migration Validation (T002-T004)

### T002: Test Organization Token Policy

**Objective**: Determine if `SEMANTIC_RELEASE_TOKEN` (PAT) is blocked by org policy or only default `GITHUB_TOKEN`

**Steps**:
1. Navigate to: https://github.com/AI-Substrate/wormhole/actions
2. Manually trigger `build-and-release.yml` workflow
3. Observe workflow execution:
   - Does it complete successfully using `SEMANTIC_RELEASE_TOKEN`?
   - Check logs for "permission denied" or "read-only" errors
4. Test default token behavior (if possible):
   - Create temporary workflow using `GITHUB_TOKEN` instead
   - Attempt label creation: `gh label create test-default`
   - Expect: "read-only" error (confirms org policy)

**Document Results in** `/workspaces/vscode-bridge/docs/plans/28-release-please-integration/validation/token-policy-test.md`:
```markdown
# Token Policy Test Results

Date: [DATE]

## SEMANTIC_RELEASE_TOKEN Test
- Status: [Works / Blocked]
- Evidence: [Workflow run URL or error message]

## GITHUB_TOKEN Test
- Status: [Read-only confirmed / Other]
- Evidence: [Error message or test output]

## Conclusion
- Organization policy: [Blocks PATs / Only default token read-only]
- GitHub App urgency: [High (PATs blocked) / Medium (PATs work but not recommended)]
```

---

### T003: Verify Repository Merge Strategy

**Objective**: Document merge strategy to determine if PR title validation is needed

**Steps**:
1. Navigate to: https://github.com/AI-Substrate/wormhole/settings
2. Scroll to "Pull Requests" section
3. Check which merge methods are enabled:
   - [ ] Allow merge commits
   - [ ] Allow squash merging
   - [ ] Allow rebase merging
4. Note default merge method

**Document Results in** `/workspaces/vscode-bridge/docs/plans/28-release-please-integration/validation/merge-strategy.md`:
```markdown
# Repository Merge Strategy

Date: [DATE]

## Enabled Merge Methods
- Merge commits: [Yes/No]
- Squash merging: [Yes/No]
- Rebase merging: [Yes/No]

## Default Method
[Merge / Squash / Rebase]

## Impact on Release-Please
- If squash merge enabled: PR titles MUST follow conventional commits format
- If merge commits only: Individual commit messages used (no PR title requirement)

## Recommendation
[Continue with current strategy / Add PR title validation workflow]
```

---

### T004: Verify Current Version Baseline

**Status**: ✅ COMPLETE (documented in pre-migration-baseline.md)

**Confirmed**:
- All 3 package.json files: v1.0.0
- Git tag v1.0.0 exists
- CHANGELOG.md has v1.0.0 entry
- Bootstrap SHA: `6552cc9`

---

## Part 2: GitHub App Creation (T005-T014)

### T005: Create GitHub App in Organization

**Objective**: Create organization-wide GitHub App for release-please automation

**Prerequisites**: Organization admin access

**Steps**:
1. Navigate to: https://github.com/organizations/AI-Substrate/settings/apps
2. Click "New GitHub App"
3. Fill in app details:
   - **GitHub App name**: `AI-Substrate Release Please` (or similar unique name)
   - **Homepage URL**: `https://github.com/AI-Substrate/wormhole`
   - **Webhook**: Uncheck "Active" (not needed for release automation)
   - **Permissions** (configure in T006):
     - Repository permissions → Contents: Read and write
     - Repository permissions → Pull requests: Read and write
     - **All others**: No access
   - **Where can this GitHub App be installed?**: Only on this account
4. Click "Create GitHub App"
5. **Record App ID** (shown after creation)

**Document Results**:
- App name: [RECORD]
- App ID: [RECORD] (needed for T011)
- App URL: https://github.com/organizations/AI-Substrate/settings/apps/[app-slug]

---

### T006: Configure App Permissions

**Objective**: Set minimal permissions (contents:write, pull-requests:write)

**Steps**:
1. Navigate to app settings: https://github.com/organizations/AI-Substrate/settings/apps/[app-slug]
2. Scroll to "Permissions" section
3. Configure **Repository permissions**:
   - Contents: **Read and write**
   - Pull requests: **Read and write**
   - Metadata: Read-only (auto-selected, required)
4. **Verify all other permissions are "No access"**:
   - Actions, Administration, Checks, Commit statuses, etc. → No access
5. Scroll to bottom, click "Save changes"

**Validation**: Screenshot permissions page showing only contents + pull-requests enabled

---

### T007: Set App Homepage URL

**Objective**: Link app to wormhole repository

**Steps**:
1. In app settings, locate "Identify and authorize users" section
2. Set **Homepage URL**: `https://github.com/AI-Substrate/wormhole`
3. Click "Save changes"

**Validation**: Homepage URL visible in app settings

---

### T008: Generate and Download Private Key

**Objective**: Create authentication key for workflow

**⚠️ CRITICAL SECURITY WARNINGS**:
- **NEVER commit the .pem file to git**
- Store key in secure location (1Password, encrypted vault, etc.)
- Key will be uploaded to GitHub Secrets in T012

**Steps**:
1. In app settings, scroll to "Private keys" section
2. Click "Generate a private key"
3. Key automatically downloads as `[app-name].[date].private-key.pem`
4. **Immediately move key to secure location**:
   ```bash
   # Example: Move to 1Password vault or encrypted directory
   # DO NOT leave in Downloads folder!
   ```
5. **Document key location** (but NOT the key itself):

**Document in** `/workspaces/vscode-bridge/docs/plans/28-release-please-integration/validation/app-key-location.md`:
```markdown
# GitHub App Private Key Location

⚠️ This file documents WHERE the key is stored, NOT the key itself!

Date Generated: [DATE]
Key File Name: [app-name].[date].private-key.pem
Secure Storage Location: [1Password vault / Encrypted directory / etc.]
Access: [Who has access]

## Key Rotation Schedule
- Created: 2025-11-10
- Next Rotation Due: 2026-02-08 (90 days)
- Rotation Procedure: See docs/how/releases/2-github-app-setup.md
```

---

### T009: Install App on AI-Substrate Organization

**Objective**: Enable app to access repositories

**Steps**:
1. In app settings, click "Install App" in left sidebar
2. Click "Install" next to "AI-Substrate" organization
3. Choose installation scope:
   - **All repositories** (recommended for org-wide use)
   - OR **Only select repositories** → select `wormhole`
4. Click "Install"
5. **Record Installation ID** (visible in URL after install)

**Installation URL**: https://github.com/organizations/AI-Substrate/settings/installations/[INSTALLATION_ID]

**Validation**: App visible at https://github.com/organizations/AI-Substrate/settings/installations

---

### T010: Add App to Main Branch Bypass List

**Objective**: Allow app to create Release PRs without PR approval

**Prerequisites**: Repository admin access

**Steps**:
1. Navigate to: https://github.com/AI-Substrate/wormhole/settings/rules
2. Locate ruleset for `main` branch (or create if missing)
3. Click ruleset to edit
4. Scroll to "Bypass list" section
5. Click "Add bypass"
6. Select **"GitHub Apps"**
7. Search for your app: `AI-Substrate Release Please`
8. Add app to bypass list
9. Click "Save changes"

**Validation**:
- App visible in "Bypass list" section
- Allows: Creating branches, creating PRs, pushing commits

**⚠️ CRITICAL**: This step is essential - without it, release-please cannot create Release PRs due to branch protection

---

### T011: Store App ID as Repository Secret

**Objective**: Make App ID available to workflows

**Prerequisites**: App ID from T005

**Steps**:
1. Navigate to: https://github.com/AI-Substrate/wormhole/settings/secrets/actions
2. Click "New repository secret"
3. Name: `RELEASE_PLEASE_APP_ID`
4. Value: [App ID from T005]
5. Click "Add secret"

**Validation**: Secret `RELEASE_PLEASE_APP_ID` visible in repository secrets list

---

### T012: Store Private Key as Repository Secret

**Objective**: Make private key available to workflows

**Prerequisites**: Private key .pem file from T008

**Steps**:
1. Navigate to: https://github.com/AI-Substrate/wormhole/settings/secrets/actions
2. Click "New repository secret"
3. Name: `RELEASE_PLEASE_APP_PRIVATE_KEY`
4. Value: **Entire contents of .pem file** (including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----`)
   ```bash
   # To get key contents (do this in secure terminal):
   cat /path/to/[app-name].[date].private-key.pem
   # Copy entire output including BEGIN/END lines
   ```
5. Paste complete key contents into "Value" field (multi-line)
6. Click "Add secret"

**Validation**: Secret `RELEASE_PLEASE_APP_PRIVATE_KEY` visible in repository secrets list (value hidden)

**⚠️ SECURITY**: After uploading, verify key file is securely stored and NOT in git

---

### T013: Set APP_KEY_LAST_ROTATION Variable

**Objective**: Track key age for 90-day rotation monitoring

**Steps**:
1. Navigate to: https://github.com/AI-Substrate/wormhole/settings/variables/actions
2. Click "New repository variable"
3. Name: `APP_KEY_LAST_ROTATION`
4. Value: `2025-11-10` (today's date in YYYY-MM-DD format)
5. Click "Add variable"

**Validation**: Variable `APP_KEY_LAST_ROTATION` visible with correct date

**Purpose**: Manual monitoring - check this date every month to ensure rotation happens before 90 days

---

### T014: Test App Token Generation

**Objective**: Verify credentials work before proceeding

**Steps**:
1. Create temporary test workflow to validate app token generation
2. Workflow file: `.github/workflows/test-app-token.yml`
3. Run workflow manually via Actions tab
4. Check workflow logs for successful token generation
5. **Delete test workflow after verification**

**Test Workflow Template**:
```yaml
name: Test GitHub App Token
on: workflow_dispatch

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Generate App Token
        id: app-token
        uses: actions/create-github-app-token@v1
        with:
          app-id: ${{ secrets.RELEASE_PLEASE_APP_ID }}
          private-key: ${{ secrets.RELEASE_PLEASE_APP_PRIVATE_KEY }}

      - name: Validate Token
        run: |
          echo "Token generated successfully"
          echo "Token starts with: ghs_..." # Should start with ghs_ prefix
```

**Expected Output**: "Token generated successfully" in workflow logs

**If Fails**: Check that App ID and private key are correctly stored in secrets

**After Success**: Delete `.github/workflows/test-app-token.yml`

---

## Checklist for Part 2 Completion

- [ ] T005: GitHub App created, App ID recorded
- [ ] T006: Permissions configured (contents + pull-requests only)
- [ ] T007: Homepage URL set to wormhole repository
- [ ] T008: Private key generated and stored securely
- [ ] T009: App installed on AI-Substrate organization
- [ ] T010: App added to main branch bypass list
- [ ] T011: App ID stored as `RELEASE_PLEASE_APP_ID` secret
- [ ] T012: Private key stored as `RELEASE_PLEASE_APP_PRIVATE_KEY` secret
- [ ] T013: Rotation date stored as `APP_KEY_LAST_ROTATION` variable
- [ ] T014: Token generation tested successfully

**Status**: Ready to proceed to configuration files (T015-T017)

---

## Notes

- All GitHub UI tasks require organizational admin or repository admin access
- Private key security is CRITICAL - never commit to git
- App bypass list is essential for Release PR creation
- Test workflow (T014) should be deleted after verification to avoid clutter
