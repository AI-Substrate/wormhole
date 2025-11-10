# GitHub App Setup - Quick Start Guide

**Time Required**: 15-20 minutes

**What You're Creating**: A GitHub App that can bypass branch protection to create Release PRs automatically.

---

## Quick Steps Overview

1. **T005**: Create app → Get App ID
2. **T006**: Set permissions (contents + pull-requests)
3. **T007**: Set homepage URL
4. **T008**: Generate private key → Download .pem file
5. **T009**: Install app on organization
6. **T010**: Add app to branch protection bypass list ⚠️ CRITICAL
7. **T011**: Store App ID as secret
8. **T012**: Store private key as secret
9. **T013**: Set rotation date variable
10. **T014**: Test token generation

---

## Start Here: Create the App

### 1. Navigate to Organization Apps
https://github.com/organizations/AI-Substrate/settings/apps

### 2. Click "New GitHub App"

### 3. Fill in the form:

**GitHub App name**: `AI-Substrate Release Please`

**Homepage URL**: `https://github.com/AI-Substrate/wormhole`

**Webhook**: ❌ **UNCHECK "Active"** (not needed)

**Repository permissions**:
- Contents: **Read and write**
- Pull requests: **Read and write**
- Metadata: Read-only (auto-selected)

**Where can this GitHub App be installed?**: Only on this account

### 4. Click "Create GitHub App"

### 5. Record the App ID
After creation, you'll see the App ID on the settings page. **Write it down!**

App ID: `_________________`

---

## Generate Private Key

### 6. Scroll to "Private keys" section
Click "Generate a private key"

File downloads as: `ai-substrate-release-please.2025-11-10.private-key.pem`

**Keep this file accessible** - you'll need it in step 8!

---

## Install the App

### 7. Click "Install App" in left sidebar
- Select "AI-Substrate" organization
- Choose: **All repositories** (recommended)
- Click "Install"

---

## Add to Branch Protection Bypass List ⚠️ CRITICAL

### 8. Go to repository rules
https://github.com/AI-Substrate/wormhole/settings/rules

### 9. Edit the main branch ruleset
- Click the ruleset for `main` branch
- Scroll to "Bypass list" section
- Click "Add bypass"
- Select **"GitHub Apps"**
- Search for: `AI-Substrate Release Please`
- Add it
- Click "Save changes"

**Without this step, release-please cannot create Release PRs!**

---

## Store Credentials as Secrets

### 10. Navigate to repository secrets
https://github.com/AI-Substrate/wormhole/settings/secrets/actions

### 11. Add App ID secret
- Click "New repository secret"
- Name: `RELEASE_PLEASE_APP_ID`
- Value: [App ID from step 5]
- Click "Add secret"

### 12. Add Private Key secret
- Click "New repository secret"
- Name: `RELEASE_PLEASE_APP_PRIVATE_KEY`
- Value: **Open the .pem file in text editor, copy ALL contents**
  ```
  -----BEGIN RSA PRIVATE KEY-----
  [many lines of base64 text]
  -----END RSA PRIVATE KEY-----
  ```
- Paste entire contents (multi-line)
- Click "Add secret"

---

## Set Rotation Date

### 13. Navigate to repository variables
https://github.com/AI-Substrate/wormhole/settings/variables/actions

### 14. Add rotation date variable
- Click "New repository variable"
- Name: `APP_KEY_LAST_ROTATION`
- Value: `2025-11-10`
- Click "Add variable"

---

## Test Token Generation

### 15. Create test workflow
Create file `.github/workflows/test-app-token.yml`:

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

### 16. Commit and push the file

### 17. Run the workflow
- Go to: https://github.com/AI-Substrate/wormhole/actions/workflows/test-app-token.yml
- Click "Run workflow"
- Select your branch
- Click "Run workflow"

### 18. Check the result
If successful, you'll see:
```
✅ Token generated successfully
Token starts with: ghs_...
```

### 19. Clean up
Delete the test workflow:
```bash
git rm .github/workflows/test-app-token.yml
git commit -m "chore: remove GitHub App token test workflow"
git push
```

---

## Done!

✅ GitHub App is configured and ready

**Tell Claude you're done** - I'll proceed with the testing phase (T036-T057)

---

## Troubleshooting T014 Failures

**Error: "Bad credentials"**
- App ID is wrong - check the number

**Error: "Private key is invalid"**
- Key is incomplete - must include BEGIN/END lines
- Key has extra spaces - copy from text editor, not terminal with formatting

**Error: "App not found"**
- App not installed on repository - verify step 7
- App not installed on correct organization

**Error: "Resource not accessible by integration"**
- Permissions wrong - verify step 3 (contents + pull-requests)
