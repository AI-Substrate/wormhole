# Commit Conventions and Versioning

This guide explains the commit message conventions and semantic versioning strategy for VSC-Bridge.

## Version Strategy: Standard 0.x.y (Pre-1.0 Development)

VSC-Bridge uses **standard 0.x.y versioning** during pre-1.0 development:

- **Breaking changes** → Minor bump (0.1.0 → 0.2.0)
- **New features** → Minor bump (0.1.0 → 0.2.0)
- **Bug fixes** → Patch bump (0.1.0 → 0.1.1)
- **Performance improvements** → Patch bump (0.1.0 → 0.1.1)

**Major versions (1.0.0+)** are reserved for manual "big party" milestones when the team is absolutely certain.

## Why Conventional Commits?

Conventional Commits enable:
- **Automated versioning** - semantic-release determines version bumps from commit messages
- **Automatic CHANGELOG** generation
- **Clear project history** - understand changes at a glance
- **Semantic meaning** - commits signal their impact on users

## Commit Types

### Release-Triggering Types

These commit types trigger automatic releases:

#### `feat:` - New Features (0.X.0 Minor Bump)

Introduces new functionality or capabilities.

```bash
feat: add variable inspection during debug sessions

feat(mcp): add dap_search tool for searching debug logs

feat!: rename breakpoint parameters for consistency
```

**Impact**: Increments minor version (0.1.0 → 0.2.0)

#### `fix:` - Bug Fixes (0.0.X Patch Bump)

Fixes a bug or defect in existing functionality.

```bash
fix: resolve null pointer in validation logic

fix(debug): correct variable scope calculation

fix: prevent extension crash on invalid configuration
```

**Impact**: Increments patch version (0.1.0 → 0.1.1)

#### `perf:` - Performance Improvements (0.0.X Patch Bump)

Improves performance without changing behavior.

```bash
perf: optimize DAP log filtering

perf(debug): reduce memory usage in variable traversal
```

**Impact**: Increments patch version (0.1.0 → 0.1.1)

#### `revert:` - Revert Changes (0.0.X Patch Bump)

Reverts a previous commit.

```bash
revert: revert "feat: add experimental feature"

This reverts commit abc123def456.
```

**Impact**: Increments patch version (0.1.0 → 0.1.1)

#### `refactor:` - Code Refactoring (0.0.X Patch Bump)

Improves code structure without changing behavior.

```bash
refactor: simplify configuration loading logic

refactor(test): extract common test utilities
```

**Impact**: Increments patch version (0.1.0 → 0.1.1)

### Non-Release Types

These commits do NOT trigger releases:

#### `docs:` - Documentation

```bash
docs: update installation instructions

docs(api): add examples for debug_evaluate tool
```

#### `style:` - Code Style

Formatting, white-space, semicolons, etc.

```bash
style: apply prettier formatting

style: fix linting errors
```

#### `chore:` - Maintenance

Build process, dependencies, tooling.

```bash
chore: update dependencies

chore(ci): add GitHub Actions workflow
```

#### `test:` - Tests

Adding or updating tests.

```bash
test: add integration tests for breakpoint management

test(unit): improve coverage for variable inspection
```

#### `build:` - Build System

Changes to build configuration.

```bash
build: update webpack configuration

build: configure TypeScript strict mode
```

#### `ci:` - Continuous Integration

Changes to CI/CD configuration.

```bash
ci: add semantic-release workflow

ci: enable branch protection checks
```

## Breaking Changes

### Using `!` Suffix (Recommended)

```bash
feat!: rename extension ID to AI-Substrate.vsc-bridge-extension

fix!: change breakpoint API parameter names
```

**Impact**: Increments minor version during 0.x.y (0.1.0 → 0.2.0)

### Using `BREAKING CHANGE:` Footer

```bash
feat: add new debug configuration API

BREAKING CHANGE: The `startDebug` function now requires a `config` parameter.
Migration: Replace `startDebug()` with `startDebug({launch: "Run Extension"})`
```

**Impact**: Increments minor version during 0.x.y (0.1.0 → 0.2.0)

## Scopes (Optional)

Scopes provide context about which part of the codebase changed:

```bash
feat(mcp): add new MCP tool for DAP log search
fix(extension): resolve activation error
docs(debug): update debugging workflow guide
```

Common scopes:
- `mcp` - MCP server tools
- `extension` - VS Code extension code
- `cli` - Command-line interface
- `debug` - Debugging functionality
- `test` - Test infrastructure
- `ci` - CI/CD workflows

## Examples

### Version Progression Example

Starting from **0.1.0**:

```bash
# 0.1.0 → 0.1.1 (patch)
fix: resolve crash when extension not found

# 0.1.1 → 0.1.2 (patch)
perf: optimize variable tree traversal

# 0.1.2 → 0.2.0 (minor - new feature)
feat: add support for conditional breakpoints

# 0.2.0 → 0.3.0 (minor - breaking change during 0.x.y)
feat!: redesign debug session management API

# 0.3.0 → 0.3.1 (patch)
fix: correct variable display for nested objects

# 0.3.1 → 0.3.2 (no release)
docs: update API documentation
```

### Multi-line Commit Message

```bash
feat: add DAP event timeline visualization

Implements a new MCP tool `dap_timeline` that provides chronological
view of all DAP events during a debug session.

Features:
- Timestamp-based event ordering
- Event type filtering
- Human-readable event summaries

Closes #42
```

### Commit with Scope and Breaking Change

```bash
feat(cli)!: change default output format to JSON

The CLI now outputs JSON by default instead of plain text.
This enables better integration with automation tools.

BREAKING CHANGE: Scripts expecting plain text output must now
use the `--format=text` flag.

Migration:
  Before: vscb status
  After:  vscb status --format=text
```

## Best Practices

1. **Use present tense**: "add feature" not "added feature"
2. **Use imperative mood**: "fix bug" not "fixes bug"
3. **No period at end** of subject line
4. **Capitalize** the first letter after the type
5. **Keep subject line under 72 characters**
6. **Separate subject from body** with blank line
7. **Use body to explain why**, not what (code shows what)
8. **Reference issues** in footer: `Closes #123`, `Fixes #456`

## Commit Message Template

```
<type>[optional scope][!]: <subject>

[optional body]

[optional footer(s)]
```

### Good Examples

✅ `feat: add user authentication`
✅ `fix(debug): resolve null pointer in validator`
✅ `refactor: simplify config loading logic`
✅ `feat!: rename breakpoint API parameters`

### Bad Examples

❌ `updated stuff` (no type, vague)
❌ `Fix bug.` (wrong capitalization, period)
❌ `FEAT: Added new feature` (wrong case)
❌ `fix something that was broken` (too long, unclear)

## Automatic Release Flow

When you push commits to the `main` branch:

1. **semantic-release** analyzes commits since last release
2. **Determines version bump** based on commit types
3. **Generates CHANGELOG** from commit messages
4. **Creates GitHub release** with CHANGELOG
5. **Commits version bump** back to repository

## Special Cases

### Preventing Release

Use `[skip ci]` or `[no-release]` in commit message:

```bash
docs: update README [skip ci]

chore(deps): update dependencies [no-release]
```

### Multiple Changes in One Commit

Prefer atomic commits, but if necessary:

```bash
feat: add authentication and authorization

- Implement user authentication with JWT tokens
- Add role-based authorization middleware
- Update API endpoints to check permissions
```

## Tools and Configuration

- **Commit Linter**: We use `commitlint` to validate commit messages
- **Pre-commit Hooks**: Automatically validate before push (optional)
- **Configuration**: See `.releaserc.json` for semantic-release rules

## Questions?

- See the [semantic-release documentation](https://semantic-release.gitbook.io/)
- Check our versioning strategy in `.releaserc.json`
- Review recent commits for examples: `git log --oneline -20`

---

**Remember**: Conventional commits aren't just for automation—they make the project history more readable and maintainable for everyone.
