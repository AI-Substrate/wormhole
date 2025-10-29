# Branch Protection Setup for Semantic-Release

This guide explains how to configure GitHub branch protection to work with semantic-release automation.

## Why Branch Protection?

Branch protection ensures:
- **Code quality** - Require tests to pass before merge
- **Review process** - Enforce peer review
- **Stability** - Prevent accidental direct pushes to main
- **Automation safety** - Allow CI/CD tools to commit version bumps

## The Challenge

semantic-release needs to **commit back to main** after creating a release:
1. Analyzes commits
2. Determines new version
3. Updates `package.json` with new version
4. Updates `CHANGELOG.md`
5. **Commits these changes back to main**
6. Creates GitHub release

If branch protection blocks all commits, semantic-release will fail at step 5.

## Solution: Allow GitHub Actions to Bypass Protection

There are two approaches:

### Option 1: GitHub Actions Bypass (Recommended)

Configure GitHub Actions workflow permissions to allow semantic-release commits.

#### Step 1: Enable Workflow Permissions

1. Go to **Repository Settings** → **Actions** → **General**
2. Scroll to **Workflow permissions**
3. Select **"Read and write permissions"**
4. Check **"Allow GitHub Actions to create and approve pull requests"**
5. Click **Save**

#### Step 2: Verify GITHUB_TOKEN Permissions

Ensure your `.github/workflows/release.yml` uses the default `GITHUB_TOKEN`:

```yaml
name: Release

on:
  push:
    branches:
      - main

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write      # Required to commit version bumps
      issues: write        # Required to close issues
      pull-requests: write # Required to comment on PRs

    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: true

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: npm ci

      - name: Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx semantic-release
```

**Key Points**:
- `permissions.contents: write` allows committing to the repository
- `GITHUB_TOKEN` has special bypass privileges for workflows
- No additional secrets needed

### Option 2: Personal Access Token (Alternative)

If Option 1 doesn't work (e.g., organization policy restrictions):

#### Step 1: Create Personal Access Token (PAT)

1. Go to **GitHub Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Click **Generate new token (classic)**
3. Name it: `semantic-release-bot`
4. Expiration: Choose appropriate duration
5. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `write:packages` (if publishing packages)
6. Click **Generate token**
7. **Copy the token immediately** (you won't see it again)

#### Step 2: Add Token to Repository Secrets

1. Go to **Repository Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `SEMANTIC_RELEASE_TOKEN`
4. Value: Paste your PAT
5. Click **Add secret**

#### Step 3: Update Workflow to Use PAT

```yaml
name: Release

on:
  push:
    branches:
      - main

jobs:
  release:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.SEMANTIC_RELEASE_TOKEN }}
          persist-credentials: true

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: npm ci

      - name: Release
        env:
          GITHUB_TOKEN: ${{ secrets.SEMANTIC_RELEASE_TOKEN }}
        run: npx semantic-release
```

**Key Differences**:
- PAT used in both `checkout` and `semantic-release` steps
- PAT belongs to a user (or bot account) with write access

## Branch Protection Rules

### Recommended Settings

Go to **Repository Settings** → **Branches** → **Add rule**

#### Basic Settings

- **Branch name pattern**: `main`
- ✅ **Require a pull request before merging**
  - ☐ Require approvals: 1 (adjust based on team size)
  - ☐ Dismiss stale pull request approvals when new commits are pushed
  - ☐ Require review from Code Owners
  - ✅ Allow specified actors to bypass required pull requests
    - Add: `github-actions[bot]` (if using Option 1)

#### Status Checks

- ✅ **Require status checks to pass before merging**
  - ✅ Require branches to be up to date before merging
  - Select required checks:
    - `build` (if you have a build job)
    - `test` (if you have test jobs)
    - `lint` (if you have linting checks)

#### Additional Settings

- ✅ **Require conversation resolution before merging** (optional)
- ☐ **Require signed commits** (optional, but recommended)
- ☐ **Require linear history** (optional)
- ☐ **Require deployments to succeed** (optional)
- ✅ **Do not allow bypassing the above settings** (unless you need emergency access)

### What NOT to Enable

❌ **Do not** check "Block force pushes" if using semantic-release with PAT
❌ **Do not** check "Restrict who can push to matching branches" (blocks semantic-release)
❌ **Do not** require all status checks for semantic-release commits

## Verification

### Test Branch Protection with Dry Run

Before enabling full branch protection, test semantic-release:

```bash
# From local main branch
npx semantic-release --dry-run

# Should see:
# [semantic-release] › ✔  Loaded plugin "verifyConditions" from ...
# [semantic-release] › ✔  Allowed to push to the Git repository
# [semantic-release] › ℹ  The next release version is X.Y.Z
```

If you see errors about permissions, check:
1. Workflow permissions (Option 1)
2. PAT scope and expiration (Option 2)
3. Branch protection bypass settings

### Test Actual Release

1. Make a commit with release-triggering type:
   ```bash
   git commit -m "feat: test semantic-release with branch protection"
   git push origin main
   ```

2. Check GitHub Actions workflow:
   - Should complete successfully
   - Should create new release
   - Should commit version bump back to main

3. Verify in repository:
   ```bash
   git pull origin main
   cat package.json | grep version
   # Should show new version
   ```

## Troubleshooting

### Error: "Resource not accessible by integration"

**Cause**: GitHub Actions doesn't have write permissions

**Solution**:
- Enable "Read and write permissions" in Actions → General → Workflow permissions
- Or add `permissions: contents: write` to workflow job

### Error: "Protected branch update failed"

**Cause**: Branch protection blocks the commit

**Solution**:
- Add `github-actions[bot]` to bypass list
- Or use Personal Access Token (Option 2)

### Error: "Authentication failed"

**Cause**: PAT is invalid, expired, or has wrong scopes

**Solution**:
- Regenerate PAT with `repo` scope
- Update `SEMANTIC_RELEASE_TOKEN` secret
- Check PAT expiration date

### semantic-release Commits But Doesn't Create Release

**Cause**: Missing permissions for GitHub releases

**Solution**: Add to workflow:
```yaml
permissions:
  contents: write
  issues: write
  pull-requests: write
```

## Security Best Practices

1. **Use Option 1 (GitHub Actions) when possible** - Most secure, no long-lived tokens
2. **Rotate PATs regularly** if using Option 2
3. **Use bot account** for PAT instead of personal account
4. **Limit PAT scope** to minimum required (`repo` only)
5. **Monitor Actions** audit log for unexpected commits
6. **Enable signed commits** for additional verification (optional)

## Alternative: GitHub Apps

For enterprise setups, consider using a GitHub App instead of PAT:

**Advantages**:
- More granular permissions
- Better audit trail
- Automatic token rotation
- Organization-wide installation

**Setup**:
1. Create GitHub App with `contents: write` permission
2. Install app on repository
3. Use `actions/create-github-app-token` action in workflow
4. Pass app token to semantic-release

See [GitHub Apps documentation](https://docs.github.com/en/apps) for details.

## Current VSC-Bridge Status

✅ **Branch protection**: Not yet enabled (planned)
✅ **semantic-release**: Configured and working
⏸️ **Action required**: Enable branch protection when ready using Option 1

**When you're ready to enable**:
1. Follow "Option 1: GitHub Actions Bypass" above
2. Test with dry-run
3. Enable branch protection rules
4. Verify with test release

## Summary

**For most projects**: Use **Option 1** (GitHub Actions bypass)
- ✅ Simple setup
- ✅ No secrets to manage
- ✅ Works with default GITHUB_TOKEN

**For enterprise/restricted**: Use **Option 2** (Personal Access Token)
- ✅ Works when Actions permissions are restricted
- ⚠️ Requires PAT management
- ⚠️ Need to rotate tokens

**Both options allow semantic-release to commit version bumps while maintaining branch protection for all other commits.**

---

**Need help?** Check the [semantic-release CI Configuration docs](https://semantic-release.gitbook.io/semantic-release/usage/ci-configuration)
