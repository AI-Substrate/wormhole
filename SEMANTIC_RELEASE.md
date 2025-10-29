# Semantic Release Setup

This project uses [semantic-release](https://github.com/semantic-release/semantic-release) for automated version management and package publishing based on conventional commits.

## How It Works

### Conventional Commits

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification. Each commit message should be structured as:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

- **feat**: A new feature (triggers minor version bump)
- **fix**: A bug fix (triggers patch version bump)
- **perf**: A performance improvement (triggers patch version bump)
- **refactor**: Code refactoring (triggers patch version bump)
- **revert**: Reverts a previous commit (triggers patch version bump)
- **docs**: Documentation only changes (no release)
- **style**: Code style changes (no release)
- **test**: Adding or updating tests (no release)
- **build**: Build system changes (no release)
- **ci**: CI configuration changes (no release)
- **chore**: Other maintenance tasks (no release)

### Breaking Changes

To trigger a major version bump, include `BREAKING CHANGE:` in the commit footer or use `!` after the type:

```bash
feat!: remove deprecated API endpoint

BREAKING CHANGE: The old /api/v1 endpoint has been removed
```

## Release Process

### Automatic Releases

Releases are automatically created when code is pushed to:

- **main branch**: Creates stable releases (1.0.0, 1.1.0, etc.)
- **develop branch**: Creates pre-releases (1.1.0-beta.1, 1.1.0-beta.2, etc.)

### What Gets Released

1. **Version Bumping**: Automatically updates version in all package.json files
2. **Changelog**: Generates CHANGELOG.md with all changes
3. **Git Tags**: Creates git tags for new versions
4. **GitHub Releases**: Creates GitHub releases with release notes
5. **VS Code Extension**: Packages and publishes to VS Code Marketplace
6. **Docker Images**: Builds and pushes to GitHub Container Registry
7. **NPM Packages**: Publishes MCP server to npm (if configured)

## Development Workflow

### 1. Making Commits

Use the provided commit helper:

```bash
npm run commit
```

This will prompt you through creating a conventional commit message.

### 2. Manual Commit Examples

```bash
# Feature addition
git commit -m "feat: add new debugging tool for C# applications"

# Bug fix
git commit -m "fix: resolve memory leak in MCP server"

# Documentation
git commit -m "docs: update installation instructions"

# Breaking change
git commit -m "feat!: redesign extension API

BREAKING CHANGE: The extension.activate() method now requires a context parameter"
```

### 3. Release Flow

1. Create feature branch from `develop`
2. Make changes with conventional commits
3. Create PR to `develop`
4. Merge PR (triggers beta pre-release)
5. When ready for stable release, create PR from `develop` to `main`
6. Merge to `main` (triggers stable release)

## Configuration Files

### `.releaserc.json`
Main semantic-release configuration defining:
- Release branches and rules
- Plugins for changelog, git commits, GitHub releases
- Asset publishing configuration

### `commitlint.config.js`
Validates commit message format in PRs

### `.cz.json`
Configuration for the `npm run commit` helper

## GitHub Actions

### Main Workflow (`build-and-release.yml`)
- Runs tests and builds
- Executes semantic-release on main/develop branches
- Publishes all artifacts

### Commit Lint (`commitlint.yml`)
- Validates commit messages in PRs
- Ensures conventional commit format

## Required Secrets

Add these to your GitHub repository secrets:

```
VSCODE_MARKETPLACE_TOKEN=your_token_here
OPEN_VSX_TOKEN=your_token_here
NPM_TOKEN=your_npm_token_here (optional)
```

## Version Strategy

- **Patch** (1.0.1): Bug fixes, performance improvements, refactoring
- **Minor** (1.1.0): New features that don't break existing functionality
- **Major** (2.0.0): Breaking changes that require user action

## Example Release Flow

```bash
# Starting from develop branch
git checkout develop

# Add new feature
git commit -m "feat: add support for Python debugging"
# This creates version 1.1.0-beta.1 when pushed

# Fix a bug
git commit -m "fix: resolve extension activation issue"
# This creates version 1.1.0-beta.2 when pushed

# Ready for release? Merge to main
git checkout main
git merge develop
git push origin main
# This creates version 1.1.0 stable release
```

## Troubleshooting

### No Release Created
- Check that commit messages follow conventional format
- Ensure you're pushing to main or develop branch
- Verify semantic-release configuration

### Release Failed
- Check GitHub Actions logs
- Verify all required secrets are set
- Ensure package.json versions are valid

### Commit Rejected
- Use `npm run commit` for guided commit creation
- Check commitlint rules in `commitlint.config.js`
- Ensure commit message follows conventional format

## Manual Release (Emergency)

If automatic release fails, you can trigger manually:

```bash
npm run semantic-release
```

Or force a specific version:

```bash
npx semantic-release --dry-run  # Test what would happen
npx semantic-release --no-ci    # Skip CI checks
```
