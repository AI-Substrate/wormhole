# Manual Tasks Guide for Release-Please Migration

**Purpose**: Step-by-step instructions for GitHub UI tasks requiring organizational admin access

**Tasks Covered**: T002-T004 (validation), T005-T014 (GitHub App setup)

**CURRENT STATUS**:
- ✅ T002 Complete - Token test confirmed GitHub App needed (secret not configured)
- ⏭️ **NEXT STEP**: T003 - Verify merge strategy (5 minutes)
- ⏭️ **THEN**: T005-T014 - GitHub App setup (15-20 minutes)

---

## Part 1: Pre-Migration Validation (T002-T004)

### T002: Test Organization Token Policy ✅ COMPLETE

**Status**: ✅ Complete - 2025-11-10

**Result**: `SEMANTIC_RELEASE_TOKEN` secret is not configured (workflow failed at checkout)

**Finding**: Cannot test org token policy without secret. Current workflow is non-functional.

**Conclusion**: GitHub App urgency = HIGH. Proceed directly to T005-T014.

**Evidence**: See `/workspaces/vscode-bridge/docs/plans/28-release-please-integration/validation/token-policy-test.md`

---

### T003: Verify Repository Merge Strategy ⏭️ NEXT TASK (5 minutes)

**Objective**: Document merge strategy to determine if PR title validation is needed

**Why This Matters**:
- If "squash merging" is enabled → PR **titles** must follow conventional commits (feat:, fix:, etc.)
- If only "merge commits" → Individual commit messages matter (PR title doesn't affect releases)

**Steps**:
1. Navigate to: https://github.com/AI-Substrate/wormhole/settings
2. Scroll to "Pull Requests" section
3. Check which merge methods are enabled:
   - [ ] Allow merge commits
   - [ ] Allow squash merging ← **Most important for release-please**
   - [ ] Allow rebase merging
4. Note which box is selected by default

**Document Results**: Create file `/workspaces/vscode-bridge/docs/plans/28-release-please-integration/validation/merge-strategy.md`:
```markdown
# Repository Merge Strategy

Date: 2025-11-10

## Enabled Merge Methods
- Merge commits: [Yes/No]
- Squash merging: [Yes/No]  ← Check this!
- Rebase merging: [Yes/No]

## Default Method
[Which radio button is selected in UI]

## Impact on Release-Please
- If squash merge enabled: PR titles MUST follow conventional commits format
- If merge commits only: Individual commit messages used (no PR title requirement)

## Recommendation
[Continue with current strategy / Add PR title validation workflow]
```

**After documenting**: Continue to T005 (GitHub App setup)

---

### T004: Verify Current Version Baseline

**Status**: ✅ COMPLETE (documented in pre-migration-baseline.md)

**Confirmed**:
- All 3 package.json files: v1.0.0
- Git tag v1.0.0 exists
- CHANGELOG.md has v1.0.0 entry
- Bootstrap SHA: `6552cc9`

---

## Part 2: GitHub App Creation (T005-T014) ⏭️ MAIN TASK (15-20 minutes)

**Overview**: Create a GitHub App that can bypass branch protection and create Release PRs automatically.

**Time Required**: 15-20 minutes total for all steps (T005-T014)

**Why This Is Critical**: Without the GitHub App, release-please cannot create Release PRs due to branch protection rules.

---

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
- Store key in secure location (password manager, encrypted vault, etc.)
- Key will be uploaded to GitHub Secrets in T012
- **Keep the downloaded file** - you'll need it for T012 (uploading to secrets)

**Steps**:
1. In app settings, scroll to "Private keys" section
2. Click "Generate a private key"
3. Key automatically downloads as `[app-name].[date].private-key.pem`
4. **Keep the file accessible** for the next few steps (T012 needs it)
5. **After T012 completes**: Move to secure long-term storage (password manager, etc.)

**What You'll Need This File For**:
- T012: Upload entire contents to GitHub Secrets
- Future key rotations (every 90 days)

**Document key metadata** (but NOT the key itself) in `/workspaces/vscode-bridge/docs/plans/28-release-please-integration/validation/app-key-location.md`:
```markdown
# GitHub App Private Key Location

⚠️ This file documents WHERE the key is stored, NOT the key itself!

Date Generated: 2025-11-10
Key File Name: [exact filename that downloaded]
Secure Storage Location: [Where you stored it after T012]
Access: [Who has access to retrieve it]

## Key Rotation Schedule
- Created: 2025-11-10
- Next Rotation Due: 2026-02-08 (90 days)
- Rotation Procedure: Repeat T008, T012, T013 with new key
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

**Prerequisites**: Private key .pem file from T008 (keep file accessible!)

**Steps**:
1. Navigate to: https://github.com/AI-Substrate/wormhole/settings/secrets/actions
2. Click "New repository secret"
3. Name: `RELEASE_PLEASE_APP_PRIVATE_KEY`
4. Value: **Entire contents of .pem file** (including header/footer lines)

   **How to get the contents**:
   ```bash
   # Option 1: Open file in text editor, copy all text
   # Option 2: In terminal:
   cat ~/Downloads/[app-name].[date].private-key.pem
   # Copy entire output including these lines:
   # -----BEGIN RSA PRIVATE KEY-----
   # [many lines of base64 text]
   # -----END RSA PRIVATE KEY-----
   ```

5. Paste complete key contents into GitHub "Value" field (it's a multi-line textarea)
6. Click "Add secret"

**Validation**:
- Secret `RELEASE_PLEASE_APP_PRIVATE_KEY` visible in list
- Value shows as "•••••" (hidden)

**⚠️ AFTER THIS STEP**:
- Move .pem file to secure long-term storage (password manager, encrypted vault)
- Update `app-key-location.md` with final storage location
- Verify .pem file is NOT in git (check with `git status`)

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

**Why This Matters**: If secrets are wrong, release-please workflow will fail. Test now to catch errors early.

**Steps**:
1. **Create test workflow file**: `.github/workflows/test-app-token.yml`

   Use this template:
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
             echo "✅ Token generated successfully"
             echo "Token starts with: ghs_..."
   ```

2. **Commit and push** the test workflow to your branch
3. Navigate to: https://github.com/AI-Substrate/wormhole/actions/workflows/test-app-token.yml
4. Click "Run workflow" → Select your branch → Click "Run workflow"
5. Wait for workflow to complete (~30 seconds)
6. Click into the run and check logs

**Expected Success Output**:
```
✅ Token generated successfully
Token starts with: ghs_...
```

**If It Fails**:
- Check error message carefully
- Common issues:
  - App ID is wrong (double-check the number from T005)
  - Private key is incomplete (must include BEGIN/END lines)
  - Private key has extra spaces or line breaks
  - App not installed on repository (verify T009)

**After Success**:
1. Delete the test workflow file:
   ```bash
   git rm .github/workflows/test-app-token.yml
   git commit -m "chore: remove GitHub App token test workflow"
   git push
   ```
2. Mark T014 complete in your checklist below

---

## Checklist for Part 2 Completion

Use this checklist as you work through T005-T014:

- [ ] **T003**: Verify merge strategy (document in `merge-strategy.md`)
- [ ] **T005**: GitHub App created, App ID recorded
- [ ] **T006**: Permissions configured (contents + pull-requests only)
- [ ] **T007**: Homepage URL set to wormhole repository
- [ ] **T008**: Private key generated and downloaded (.pem file)
- [ ] **T009**: App installed on AI-Substrate organization
- [ ] **T010**: App added to main branch bypass list ⚠️ **CRITICAL**
- [ ] **T011**: App ID stored as `RELEASE_PLEASE_APP_ID` secret
- [ ] **T012**: Private key stored as `RELEASE_PLEASE_APP_PRIVATE_KEY` secret
- [ ] **T013**: Rotation date stored as `APP_KEY_LAST_ROTATION` variable (value: `2025-11-10`)
- [ ] **T014**: Token generation tested successfully (test workflow deleted after)

**After completing all tasks above**: ✅ GitHub App setup is complete!

**Next Phase**: Testing and validation (T036-T057) - I will handle these

---

## Summary: What You Need To Do

1. **Quick task (5 min)**: T003 - Check merge strategy in repo settings
2. **Main task (15-20 min)**: T005-T014 - Create GitHub App and configure secrets
3. **Tell me when done**: I'll proceed with testing phase

**Current status**: All configuration files are ready. Just need the GitHub App credentials!

---

## Notes

- All GitHub UI tasks require organizational admin or repository admin access
- Private key security is CRITICAL - never commit to git
- App bypass list (T010) is essential - without it, release-please cannot create Release PRs
- Test workflow (T014) should be deleted after verification to avoid clutter
